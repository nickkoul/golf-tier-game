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

async function authenticatedSession() {
  const token = crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO sign_in_links (token_hash, email, expires_at) VALUES (?, ?, ?)',
  )
    .bind(
      await tokenHash(token),
      `owner-${crypto.randomUUID()}@example.com`,
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

describe('Contest creation', () => {
  it('creates an immutable Contest from an eligible Tournament and valid Tier Board', async () => {
    const tournamentId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO tournaments (id, name, starts_at, time_zone, source, field_available_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).bind(
        tournamentId,
        'The Example Invitational',
        new Date(Date.now() + 86_400_000).toISOString(),
        'America/New_York',
        'espn',
        new Date().toISOString(),
      ),
      env.DB.prepare(
        'INSERT INTO tournament_golfers (tournament_id, golfer_id, golfer_name) VALUES (?, ?, ?)',
      ).bind(tournamentId, 'golfer-a', 'Avery Ace'),
      env.DB.prepare(
        'INSERT INTO tournament_golfers (tournament_id, golfer_id, golfer_name) VALUES (?, ?, ?)',
      ).bind(tournamentId, 'golfer-b', 'Blair Birdie'),
    ]);
    const session = await authenticatedSession();

    const available = await SELF.fetch('http://example.com/api/tournaments', {
      headers: { cookie: session },
    });
    await expect(available.json()).resolves.toEqual([
      {
        id: tournamentId,
        name: 'The Example Invitational',
        startsAt: expect.any(String),
        timeZone: 'America/New_York',
        golfers: [
          { id: 'golfer-a', name: 'Avery Ace' },
          { id: 'golfer-b', name: 'Blair Birdie' },
        ],
      },
    ]);

    const created = await SELF.fetch('http://example.com/api/contests', {
      method: 'POST',
      headers: { cookie: session, 'content-type': 'application/json' },
      body: JSON.stringify({
        tournamentId,
        tiers: [
          { name: 'Favorites', golferIds: ['golfer-a'] },
          { name: 'Contenders', golferIds: ['golfer-b'] },
        ],
      }),
    });
    expect(created.status).toBe(201);
    const contest = (await created.json()) as { id: string };
    expect(contest).toMatchObject({
      name: 'The Example Invitational',
      lineupLockAt: expect.any(String),
      tournamentTimeZone: 'America/New_York',
      tiers: [
        { name: 'Favorites', golfers: [{ id: 'golfer-a', name: 'Avery Ace' }] },
        {
          name: 'Contenders',
          golfers: [{ id: 'golfer-b', name: 'Blair Birdie' }],
        },
      ],
    });

    const invalid = await SELF.fetch('http://example.com/api/contests', {
      method: 'POST',
      headers: { cookie: session, 'content-type': 'application/json' },
      body: JSON.stringify({
        tournamentId,
        tiers: [
          { name: 'One', golferIds: ['golfer-a'] },
          { name: 'Two', golferIds: ['golfer-a'] },
        ],
      }),
    });
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({
      error: 'A Golfer can appear in only one Tier.',
    });

    const contests = await env.DB.prepare(
      'SELECT id FROM contests WHERE owner_user_id = (SELECT user_id FROM sessions ORDER BY created_at DESC LIMIT 1)',
    ).all();
    expect(contests.results).toEqual([{ id: contest.id }]);
  });
});
