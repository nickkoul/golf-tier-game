import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

async function tokenHash(value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

describe('passwordless authentication', () => {
  it('renders sign-in and keeps private data unauthenticated', async () => {
    const signIn = await SELF.fetch('http://example.com/sign-in');
    expect(signIn.status).toBe(200);
    await expect(signIn.text()).resolves.toContain('Make Sunday interesting.');

    const requested = await SELF.fetch('http://example.com/api/auth/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: `golfer-${crypto.randomUUID()}@example.com`,
      }),
    });
    expect(requested.status).toBe(202);
    await expect(requested.json()).resolves.toEqual({
      message: 'If that address can sign in, a link is on its way.',
    });

    const privateData = await SELF.fetch('http://example.com/api/private');
    expect(privateData.status).toBe(401);

    const home = await SELF.fetch('http://example.com/', {
      redirect: 'manual',
    });
    expect(home.status).toBe(302);
    expect(home.headers.get('location')).toBe('/sign-in');
  });

  it('verifies an email link once and lets the user update their profile', async () => {
    const token = crypto.randomUUID();
    const email = `golfer-${crypto.randomUUID()}@example.com`;
    await env.DB.prepare(
      'INSERT INTO sign_in_links (token_hash, email, expires_at) VALUES (?, ?, ?)',
    )
      .bind(
        await tokenHash(token),
        email,
        new Date(Date.now() + 60_000).toISOString(),
      )
      .run();

    const verified = await SELF.fetch(
      `http://example.com/verify?token=${token}`,
      { redirect: 'manual' },
    );
    expect(verified.status).toBe(302);
    expect(verified.headers.get('location')).toBe('/profile');
    const session = verified.headers.get('set-cookie')!;

    const profile = await SELF.fetch('http://example.com/api/profile', {
      method: 'POST',
      headers: { cookie: session, 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'Mina Golfer' }),
    });
    await expect(profile.json()).resolves.toEqual({
      displayName: 'Mina Golfer',
    });

    const privateData = await SELF.fetch('http://example.com/api/private', {
      headers: { cookie: session },
    });
    await expect(privateData.json()).resolves.toEqual({
      user: { email, displayName: 'Mina Golfer' },
    });

    const otherToken = crypto.randomUUID();
    const otherEmail = `golfer-${crypto.randomUUID()}@example.com`;
    await env.DB.prepare(
      'INSERT INTO sign_in_links (token_hash, email, expires_at) VALUES (?, ?, ?)',
    )
      .bind(
        await tokenHash(otherToken),
        otherEmail,
        new Date(Date.now() + 60_000).toISOString(),
      )
      .run();
    const otherVerified = await SELF.fetch(
      `http://example.com/verify?token=${otherToken}`,
      { redirect: 'manual' },
    );
    const otherPrivateData = await SELF.fetch(
      'http://example.com/api/private',
      { headers: { cookie: otherVerified.headers.get('set-cookie')! } },
    );
    await expect(otherPrivateData.json()).resolves.toEqual({
      user: { email: otherEmail, displayName: '' },
    });

    const reused = await SELF.fetch(
      `http://example.com/verify?token=${token}`,
      { redirect: 'manual' },
    );
    expect(reused.headers.get('location')).toBe(
      'http://example.com/sign-in?error=invalid-link',
    );
  });
});
