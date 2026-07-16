import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { refreshActiveTournaments } from '../app/services/standings.server';

describe('live scoring refresh', () => {
  it('polls only active Contest Tournaments and upserts ESPN-derived scores idempotently', async () => {
    const tournamentId = crypto.randomUUID();
    const futureTournamentId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO users (id, email, display_name, created_at) VALUES (?, ?, ?, ?)',
      ).bind(userId, `owner-${userId}@example.com`, 'Owner', now),
      env.DB.prepare(
        'INSERT INTO tournaments (id, name, starts_at, time_zone, source) VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)',
      ).bind(
        tournamentId,
        'Active',
        new Date(Date.now() - 60_000).toISOString(),
        'America/New_York',
        'espn',
        futureTournamentId,
        'Future',
        new Date(Date.now() + 60_000).toISOString(),
        'America/New_York',
        'espn',
      ),
      env.DB.prepare(
        'INSERT INTO contests (id, owner_user_id, tournament_id, name, lineup_lock_at, tournament_time_zone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).bind(
        crypto.randomUUID(),
        userId,
        tournamentId,
        'Active',
        new Date(Date.now() - 60_000).toISOString(),
        'America/New_York',
        now,
      ),
    ]);
    const holes = Array.from({ length: 18 }, () => ({ par: 4, strokes: 4 }));
    let calls = 0;
    const fetcher: typeof fetch = async () => {
      calls += 1;
      return Response.json({
        events: [
          {
            status: { type: { state: 'in', completed: false } },
            competitions: [
              {
                competitors: [
                  {
                    athlete: { id: 'golfer-a', displayName: 'Avery Ace' },
                    position: '1',
                    scoreToPar: '-2',
                    currentRound: 1,
                    through: 'F',
                    rounds: [{ holes, strokes: 72 }],
                  },
                ],
              },
            ],
          },
        ],
      });
    };

    await refreshActiveTournaments(env.DB, fetcher);
    await refreshActiveTournaments(env.DB, fetcher);

    expect(calls).toBe(2);
    const score = await env.DB.prepare(
      'SELECT fantasy_points AS fantasyPoints, position, current_round AS currentRound FROM golfer_scores WHERE tournament_id = ? AND golfer_id = ?',
    )
      .bind(tournamentId, 'golfer-a')
      .first<{
        fantasyPoints: number;
        position: string;
        currentRound: number;
      }>();
    expect(score).toEqual({
      fantasyPoints: 12,
      position: '1',
      currentRound: 1,
    });
    const refreshes = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM tournament_refreshes WHERE tournament_id = ?',
    )
      .bind(tournamentId)
      .first<{ count: number }>();
    expect(refreshes?.count).toBe(1);
  });
});
