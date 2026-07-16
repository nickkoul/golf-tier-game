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
    { redirect: 'manual' },
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
      'The Lineup Invitational',
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
    env.DB.prepare(
      'INSERT INTO tournament_golfers (tournament_id, golfer_id, golfer_name) VALUES (?, ?, ?)',
    ).bind(tournamentId, 'golfer-c', 'Casey Chip'),
  ]);
  const response = await SELF.fetch('http://example.com/api/contests', {
    method: 'POST',
    headers: { cookie: session, 'content-type': 'application/json' },
    body: JSON.stringify({
      tournamentId,
      tiers: [
        { name: 'Tier 1', golferIds: ['golfer-a', 'golfer-b'] },
        { name: 'Tier 2', golferIds: ['golfer-c'] },
      ],
    }),
  });
  return (await response.json()) as { id: string };
}

describe('Lineups', () => {
  it('shows Participants entered status without exposing another Participant selections before Lineup Lock', async () => {
    const ownerEmail = `owner-${crypto.randomUUID()}@example.com`;
    const ownerSession = await authenticatedSession(ownerEmail);
    const contest = await contestForOwner(ownerSession);
    const ownerContest = (await (
      await SELF.fetch(`http://example.com/api/contests/${contest.id}`, {
        headers: { cookie: ownerSession },
      })
    ).json()) as {
      tiers: { id: string; golfers: { id: string }[] }[];
    };
    await SELF.fetch(`http://example.com/api/contests/${contest.id}/lineup`, {
      method: 'PUT',
      headers: { cookie: ownerSession, 'content-type': 'application/json' },
      body: JSON.stringify({
        selections: ownerContest.tiers.map((tier) => ({
          tierId: tier.id,
          golferId: tier.golfers[0].id,
        })),
      }),
    });

    const inviteeEmail = `invitee-${crypto.randomUUID()}@example.com`;
    const invitation = (await (
      await SELF.fetch(
        `http://example.com/api/contests/${contest.id}/invitations`,
        {
          method: 'POST',
          headers: { cookie: ownerSession, 'content-type': 'application/json' },
          body: JSON.stringify({ email: inviteeEmail }),
        },
      )
    ).json()) as { id: string };
    const inviteeSession = await authenticatedSession(inviteeEmail);
    await SELF.fetch(
      `http://example.com/api/invitations/${invitation.id}/response`,
      {
        method: 'POST',
        headers: { cookie: inviteeSession, 'content-type': 'application/json' },
        body: JSON.stringify({ response: 'accept' }),
      },
    );

    const overview = (await (
      await SELF.fetch(`http://example.com/api/contests/${contest.id}`, {
        headers: { cookie: inviteeSession },
      })
    ).json()) as {
      lineup: unknown[];
      participants: { displayName: string; entered: boolean }[];
    };
    expect(overview.lineup).toEqual([]);
    expect(overview.participants).toEqual(
      expect.arrayContaining([
        { displayName: ownerEmail, entered: true },
        { displayName: inviteeEmail, entered: false },
      ]),
    );
  });

  it('lets a Participant submit, replace, and remove only their complete valid Lineup', async () => {
    const ownerSession = await authenticatedSession(
      `owner-${crypto.randomUUID()}@example.com`,
    );
    const contest = await contestForOwner(ownerSession);
    const ownerContest = (await (
      await SELF.fetch(`http://example.com/api/contests/${contest.id}`, {
        headers: { cookie: ownerSession },
      })
    ).json()) as {
      tiers: { id: string; golfers: { id: string }[] }[];
    };

    const incomplete = await SELF.fetch(
      `http://example.com/api/contests/${contest.id}/lineup`,
      {
        method: 'PUT',
        headers: { cookie: ownerSession, 'content-type': 'application/json' },
        body: JSON.stringify({
          selections: [
            {
              tierId: ownerContest.tiers[0].id,
              golferId: ownerContest.tiers[0].golfers[0].id,
            },
          ],
        }),
      },
    );
    expect(incomplete.status).toBe(400);

    const submitted = await SELF.fetch(
      `http://example.com/api/contests/${contest.id}/lineup`,
      {
        method: 'PUT',
        headers: { cookie: ownerSession, 'content-type': 'application/json' },
        body: JSON.stringify({
          selections: ownerContest.tiers.map((tier) => ({
            tierId: tier.id,
            golferId: tier.golfers[0].id,
          })),
        }),
      },
    );
    expect(submitted.status).toBe(200);

    const replacement = await SELF.fetch(
      `http://example.com/api/contests/${contest.id}/lineup`,
      {
        method: 'PUT',
        headers: { cookie: ownerSession, 'content-type': 'application/json' },
        body: JSON.stringify({
          selections: [
            {
              tierId: ownerContest.tiers[0].id,
              golferId: ownerContest.tiers[0].golfers[1].id,
            },
            {
              tierId: ownerContest.tiers[1].id,
              golferId: ownerContest.tiers[1].golfers[0].id,
            },
          ],
        }),
      },
    );
    expect(replacement.status).toBe(200);

    const refreshed = (await (
      await SELF.fetch(`http://example.com/api/contests/${contest.id}`, {
        headers: { cookie: ownerSession },
      })
    ).json()) as { lineup: { tierId: string; golferId: string }[] };
    expect(refreshed.lineup).toEqual([
      { tierId: ownerContest.tiers[0].id, golferId: 'golfer-b' },
      { tierId: ownerContest.tiers[1].id, golferId: 'golfer-c' },
    ]);

    const removed = await SELF.fetch(
      `http://example.com/api/contests/${contest.id}/lineup`,
      { method: 'DELETE', headers: { cookie: ownerSession } },
    );
    expect(removed.status).toBe(204);
  });
});
