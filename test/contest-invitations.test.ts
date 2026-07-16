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

async function authenticatedSession(email: string) {
  const token = crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO sign_in_links (token_hash, email, expires_at) VALUES (?, ?, ?)',
  )
    .bind(
      await tokenHash(token),
      email,
      new Date(Date.now() + 60_000).toISOString(),
    )
    .run();
  const response = await SELF.fetch(
    `http://example.com/verify?token=${token}`,
    {
      redirect: 'manual',
    },
  );
  return response.headers.get('set-cookie')!;
}

async function contestForOwner(session: string) {
  const tournamentId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO tournaments (id, name, starts_at, time_zone, source, field_available_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(
      tournamentId,
      'The Invitation Invitational',
      new Date(Date.now() + 86_400_000).toISOString(),
      'America/New_York',
      'espn',
      new Date().toISOString(),
    ),
    env.DB.prepare(
      'INSERT INTO tournament_golfers (tournament_id, golfer_id, golfer_name) VALUES (?, ?, ?)',
    ).bind(tournamentId, 'golfer-a', 'Avery Ace'),
  ]);
  const response = await SELF.fetch('http://example.com/api/contests', {
    method: 'POST',
    headers: { cookie: session, 'content-type': 'application/json' },
    body: JSON.stringify({
      tournamentId,
      tiers: [{ name: 'Tier 1', golferIds: ['golfer-a'] }],
    }),
  });
  return (await response.json()) as { id: string };
}

describe('Contest invitations', () => {
  it('lets a Contest Owner manage invitation access and an addressed invitee join then leave', async () => {
    const ownerSession = await authenticatedSession(
      `owner-${crypto.randomUUID()}@example.com`,
    );
    const contest = await contestForOwner(ownerSession);
    const inviteeEmail = `invitee-${crypto.randomUUID()}@example.com`;

    const invited = await SELF.fetch(
      `http://example.com/api/contests/${contest.id}/invitations`,
      {
        method: 'POST',
        headers: { cookie: ownerSession, 'content-type': 'application/json' },
        body: JSON.stringify({ email: inviteeEmail }),
      },
    );
    expect(invited.status).toBe(201);
    const invitation = (await invited.json()) as {
      id: string;
      expiresAt: string;
    };
    expect(new Date(invitation.expiresAt).getTime()).toBeGreaterThan(
      Date.now() + 6 * 86_400_000,
    );

    const wrongSession = await authenticatedSession(
      `wrong-${crypto.randomUUID()}@example.com`,
    );
    const rejected = await SELF.fetch(
      `http://example.com/api/invitations/${invitation.id}/response`,
      {
        method: 'POST',
        headers: { cookie: wrongSession, 'content-type': 'application/json' },
        body: JSON.stringify({ response: 'accept' }),
      },
    );
    expect(rejected.status).toBe(403);

    const inviteeSession = await authenticatedSession(inviteeEmail);
    const accepted = await SELF.fetch(
      `http://example.com/api/invitations/${invitation.id}/response`,
      {
        method: 'POST',
        headers: { cookie: inviteeSession, 'content-type': 'application/json' },
        body: JSON.stringify({ response: 'accept' }),
      },
    );
    expect(accepted.status).toBe(200);
    expect(
      (
        await SELF.fetch(
          `http://example.com/api/invitations/${invitation.id}/response`,
          {
            method: 'POST',
            headers: {
              cookie: inviteeSession,
              'content-type': 'application/json',
            },
            body: JSON.stringify({ response: 'accept' }),
          },
        )
      ).status,
    ).toBe(403);

    expect(
      (
        await SELF.fetch(`http://example.com/api/contests/${contest.id}`, {
          headers: { cookie: inviteeSession },
        })
      ).status,
    ).toBe(200);

    const invitee = await env.DB.prepare('SELECT id FROM users WHERE email = ?')
      .bind(inviteeEmail)
      .first<{ id: string }>();
    expect(
      (
        await SELF.fetch(
          `http://example.com/api/contests/${contest.id}/participants/${invitee!.id}`,
          {
            method: 'DELETE',
            headers: { cookie: ownerSession },
          },
        )
      ).status,
    ).toBe(204);
    expect(
      (
        await SELF.fetch(`http://example.com/api/contests/${contest.id}`, {
          headers: { cookie: inviteeSession },
        })
      ).status,
    ).toBe(404);

    const reinvited = await SELF.fetch(
      `http://example.com/api/contests/${contest.id}/invitations`,
      {
        method: 'POST',
        headers: { cookie: ownerSession, 'content-type': 'application/json' },
        body: JSON.stringify({ email: inviteeEmail }),
      },
    );
    const replacement = (await reinvited.json()) as { id: string };
    await SELF.fetch(
      `http://example.com/api/invitations/${replacement.id}/response`,
      {
        method: 'POST',
        headers: { cookie: inviteeSession, 'content-type': 'application/json' },
        body: JSON.stringify({ response: 'accept' }),
      },
    );

    expect(
      (
        await SELF.fetch(
          `http://example.com/api/contests/${contest.id}/participation`,
          {
            method: 'DELETE',
            headers: { cookie: inviteeSession },
          },
        )
      ).status,
    ).toBe(204);

    expect(
      (
        await SELF.fetch(`http://example.com/api/contests/${contest.id}`, {
          headers: { cookie: inviteeSession },
        })
      ).status,
    ).toBe(404);
  });
});
