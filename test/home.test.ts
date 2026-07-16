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

describe('home route', () => {
  it('redirects unauthenticated visitors to sign-in', async () => {
    const response = await SELF.fetch('http://example.com/', {
      redirect: 'manual',
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/sign-in');
  });

  it('shows an authenticated Owner an empty Contest state', async () => {
    const userId = crypto.randomUUID();
    const token = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO users (id, email, display_name, created_at) VALUES (?, ?, ?, ?)',
      ).bind(userId, `owner-${userId}@example.com`, 'Mina Golfer', now),
      env.DB.prepare(
        'INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
      ).bind(
        await tokenHash(token),
        userId,
        new Date(Date.now() + 60_000).toISOString(),
        now,
      ),
    ]);

    const response = await SELF.fetch('http://example.com/', {
      headers: { cookie: `golf_tiers_session=${token}` },
    });

    expect(response.status).toBe(200);
    const page = await response.text();
    expect(page).toContain('My Contests');
    expect(page).toContain('No Contests yet');
  });
});
