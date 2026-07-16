import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

async function session(email: string) {
  const token = crypto.randomUUID();
  const hash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)),
    ),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
  await env.DB.prepare(
    'INSERT INTO sign_in_links (token_hash, email, expires_at) VALUES (?, ?, ?)',
  )
    .bind(hash, email, new Date(Date.now() + 60_000).toISOString())
    .run();
  return (
    await SELF.fetch(`http://example.com/verify?token=${token}`, {
      redirect: 'manual',
    })
  ).headers.get('set-cookie')!;
}

describe('Standings', () => {
  it('reveals shared-position, expandable lineup data to an unentered Participant after Lineup Lock', async () => {
    const id = crypto.randomUUID();
    const tournamentId = crypto.randomUUID();
    const ownerSession = await session(`owner-${id}@example.com`);
    const viewerSession = await session(`viewer-${id}@example.com`);
    await session(`entrant-${id}@example.com`);
    const users = await env.DB.prepare(
      'SELECT id, email FROM users WHERE email IN (?, ?, ?)',
    )
      .bind(
        `owner-${id}@example.com`,
        `viewer-${id}@example.com`,
        `entrant-${id}@example.com`,
      )
      .all<{ id: string; email: string }>();
    const owner = users.results.find((user) => user.email.startsWith('owner'))!;
    const viewer = users.results.find((user) =>
      user.email.startsWith('viewer'),
    )!;
    const entrant = users.results.find((user) =>
      user.email.startsWith('entrant'),
    )!;
    const now = new Date().toISOString();
    const staleAt = new Date(Date.now() - 16 * 60_000).toISOString();
    const tierId = crypto.randomUUID();
    const lineupA = crypto.randomUUID();
    const lineupB = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO tournaments (id, name, starts_at, time_zone, source) VALUES (?, ?, ?, ?, ?)',
      ).bind(
        tournamentId,
        'Live Invitational',
        new Date(Date.now() - 60_000).toISOString(),
        'America/New_York',
        'espn',
      ),
      env.DB.prepare(
        'INSERT INTO contests (id, owner_user_id, tournament_id, name, lineup_lock_at, tournament_time_zone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).bind(
        id,
        owner.id,
        tournamentId,
        'Live Invitational',
        new Date(Date.now() - 60_000).toISOString(),
        'America/New_York',
        now,
      ),
      env.DB.prepare(
        'INSERT INTO participants (contest_id, user_id, joined_at) VALUES (?, ?, ?), (?, ?, ?)',
      ).bind(id, viewer.id, now, id, entrant.id, now),
      env.DB.prepare(
        'INSERT INTO tiers (id, contest_id, position, name) VALUES (?, ?, ?, ?)',
      ).bind(tierId, id, 0, 'Tier 1'),
      env.DB.prepare(
        'INSERT INTO tier_golfers (tier_id, golfer_id, golfer_name) VALUES (?, ?, ?)',
      ).bind(tierId, 'a', 'Avery Ace'),
      env.DB.prepare(
        'INSERT INTO tier_golfers (tier_id, golfer_id, golfer_name) VALUES (?, ?, ?)',
      ).bind(tierId, 'b', 'Blair Birdie'),
      env.DB.prepare(
        'INSERT INTO lineups (id, contest_id, user_id, created_at) VALUES (?, ?, ?, ?), (?, ?, ?, ?)',
      ).bind(lineupA, id, owner.id, now, lineupB, id, entrant.id, now),
      env.DB.prepare(
        'INSERT INTO lineup_selections (lineup_id, tier_id, golfer_id) VALUES (?, ?, ?), (?, ?, ?)',
      ).bind(lineupA, tierId, 'a', lineupB, tierId, 'b'),
      env.DB.prepare(
        'INSERT INTO tournament_refreshes (tournament_id, status, last_success_at, source_payload) VALUES (?, ?, ?, ?)',
      ).bind(tournamentId, 'active', now, '{}'),
      env.DB.prepare(
        'INSERT INTO golfer_scores (tournament_id, golfer_id, golfer_name, fantasy_points, position, score_to_par, current_round, through_status, source_payload, refreshed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(
        tournamentId,
        'a',
        'Avery Ace',
        11,
        'T1',
        '-4',
        2,
        '12',
        '{}',
        now,
        tournamentId,
        'b',
        'Blair Birdie',
        11,
        'T1',
        '-4',
        2,
        '12',
        '{}',
        staleAt,
      ),
    ]);

    const response = await SELF.fetch(`http://example.com/api/contests/${id}`, {
      headers: { cookie: viewerSession },
    });
    expect(response.status).toBe(200);
    const contest = (await response.json()) as {
      standings: {
        status: string;
        lastSuccessAt: string;
        entrants: {
          position: number | null;
          fantasyPoints: number | null;
          golfers: { name: string; fantasyPoints: number | null }[];
        }[];
      };
    };
    expect(contest.standings.status).toBe('provisional');
    expect(contest.standings.lastSuccessAt).toBe(now);
    expect(contest.standings.entrants).toMatchObject([
      { position: 1, golfers: [{ name: 'Avery Ace', fantasyPoints: 11 }] },
      {
        position: null,
        fantasyPoints: null,
        golfers: [{ name: 'Blair Birdie', fantasyPoints: null }],
      },
    ]);

    await env.DB.prepare(
      "UPDATE tournament_refreshes SET status = 'complete' WHERE tournament_id = ?",
    )
      .bind(tournamentId)
      .run();
    const finalResponse = await SELF.fetch(
      `http://example.com/api/contests/${id}`,
      { headers: { cookie: viewerSession } },
    );
    const finalContest = (await finalResponse.json()) as {
      standings: {
        status: string;
        entrants: {
          position: number | null;
          fantasyPoints: number | null;
          golfers: {
            name: string;
            fantasyPoints: number | null;
            position: string | null;
          }[];
        }[];
      };
    };
    expect(finalContest.standings).toMatchObject({
      status: 'final',
      entrants: [
        { position: 1, fantasyPoints: 11 },
        {
          position: null,
          fantasyPoints: null,
          golfers: [
            { name: 'Blair Birdie', fantasyPoints: null, position: null },
          ],
        },
      ],
    });

    await env.DB.prepare(
      "UPDATE tournament_refreshes SET status = 'cancelled' WHERE tournament_id = ?",
    )
      .bind(tournamentId)
      .run();
    const cancelledResponse = await SELF.fetch(
      `http://example.com/api/contests/${id}`,
      { headers: { cookie: viewerSession } },
    );
    const cancelledContest = (await cancelledResponse.json()) as {
      standings: { status: string; entrants: unknown[] };
    };
    expect(cancelledContest.standings).toEqual({
      status: 'cancelled',
      lastSuccessAt: now,
      entrants: [],
    });
    expect(ownerSession).toContain('golf_tiers_session');
  });
});
