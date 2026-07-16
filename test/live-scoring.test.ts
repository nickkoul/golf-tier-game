import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import {
  refreshActiveTournaments,
  refreshTournament,
} from '../app/services/standings.server';

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

  it('retains the last successful provisional scores when ESPN refresh fails', async () => {
    const tournamentId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const now = new Date().toISOString();
    const refreshedAt = new Date(Date.now() - 60_000).toISOString();
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO users (id, email, display_name, created_at) VALUES (?, ?, ?, ?)',
      ).bind(userId, `owner-${userId}@example.com`, 'Owner', now),
      env.DB.prepare(
        'INSERT INTO tournaments (id, name, starts_at, time_zone, source) VALUES (?, ?, ?, ?, ?)',
      ).bind(tournamentId, 'Active', refreshedAt, 'America/New_York', 'espn'),
      env.DB.prepare(
        'INSERT INTO contests (id, owner_user_id, tournament_id, name, lineup_lock_at, tournament_time_zone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).bind(
        crypto.randomUUID(),
        userId,
        tournamentId,
        'Active',
        refreshedAt,
        'America/New_York',
        now,
      ),
      env.DB.prepare(
        'INSERT INTO tournament_refreshes (tournament_id, status, last_success_at, source_payload) VALUES (?, ?, ?, ?)',
      ).bind(tournamentId, 'active', refreshedAt, '{}'),
      env.DB.prepare(
        'INSERT INTO golfer_scores (tournament_id, golfer_id, golfer_name, fantasy_points, position, score_to_par, current_round, through_status, source_payload, refreshed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(
        tournamentId,
        'golfer-a',
        'Avery Ace',
        12,
        '1',
        '-2',
        1,
        'F',
        '{}',
        refreshedAt,
      ),
    ]);

    await refreshActiveTournaments(
      env.DB,
      async () => new Response(null, { status: 503 }),
    );

    const persisted = await env.DB.prepare(
      `SELECT tournament_refreshes.last_success_at AS lastSuccessAt,
          golfer_scores.fantasy_points AS fantasyPoints
         FROM tournament_refreshes
         JOIN golfer_scores ON golfer_scores.tournament_id = tournament_refreshes.tournament_id
         WHERE tournament_refreshes.tournament_id = ?`,
    )
      .bind(tournamentId)
      .first<{ lastSuccessAt: string; fantasyPoints: number }>();
    expect(persisted).toEqual({
      lastSuccessAt: refreshedAt,
      fantasyPoints: 12,
    });
  });

  it('does not let a stale refresh reopen a completed Tournament', async () => {
    const tournamentId = crypto.randomUUID();
    const completedAt = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO tournaments (id, name, starts_at, time_zone, source) VALUES (?, ?, ?, ?, ?)',
      ).bind(
        tournamentId,
        'Completed',
        completedAt,
        'America/New_York',
        'espn',
      ),
      env.DB.prepare(
        'INSERT INTO tournament_refreshes (tournament_id, status, last_success_at, source_payload) VALUES (?, ?, ?, ?)',
      ).bind(tournamentId, 'complete', completedAt, '{}'),
      env.DB.prepare(
        'INSERT INTO golfer_scores (tournament_id, golfer_id, golfer_name, fantasy_points, position, score_to_par, current_round, through_status, source_payload, refreshed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(
        tournamentId,
        'golfer-a',
        'Avery Ace',
        20,
        '1',
        '-8',
        4,
        'F',
        '{}',
        completedAt,
      ),
    ]);

    await refreshTournament(env.DB, tournamentId, {
      status: 'active',
      golfers: [
        {
          id: 'golfer-a',
          name: 'Avery Ace',
          fantasyPoints: 10,
          position: '2',
          scoreToPar: '-3',
          currentRound: 3,
          throughStatus: '12',
          source: {},
        },
      ],
      source: {},
    });

    const persisted = await env.DB.prepare(
      `SELECT tournament_refreshes.status, golfer_scores.fantasy_points AS fantasyPoints
         FROM tournament_refreshes
         JOIN golfer_scores ON golfer_scores.tournament_id = tournament_refreshes.tournament_id
         WHERE tournament_refreshes.tournament_id = ?`,
    )
      .bind(tournamentId)
      .first<{ status: string; fantasyPoints: number }>();
    expect(persisted).toEqual({ status: 'complete', fantasyPoints: 20 });
  });
});
