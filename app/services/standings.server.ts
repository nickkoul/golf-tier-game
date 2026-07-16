import { fetchEspnTournament, type EspnTournament } from './espn';

const scoringFreshnessMs = 15 * 60 * 1000;

type GolferStanding = {
  name: string;
  fantasyPoints: number | null;
  position: string | null;
  scoreToPar: string | null;
  currentRound: number | null;
  throughStatus: string | null;
};

type EntrantStanding = {
  displayName: string;
  fantasyPoints: number | null;
  position: number | null;
  golfers: GolferStanding[];
};

export type Standings = {
  status: 'provisional' | 'final' | 'cancelled';
  lastSuccessAt: string | null;
  entrants: EntrantStanding[];
};

export async function standingsForContest(
  db: D1Database,
  contestId: string,
): Promise<Standings> {
  const refresh = await db
    .prepare(
      'SELECT status, last_success_at AS lastSuccessAt FROM tournament_refreshes WHERE tournament_id = (SELECT tournament_id FROM contests WHERE id = ?)',
    )
    .bind(contestId)
    .first<{
      status: 'active' | 'complete' | 'cancelled';
      lastSuccessAt: string;
    }>();
  if (refresh?.status === 'cancelled')
    return {
      status: 'cancelled',
      lastSuccessAt: refresh.lastSuccessAt,
      entrants: [],
    };
  const { results } = await db
    .prepare(
      `SELECT lineups.id AS lineupId, COALESCE(users.display_name, users.email) AS displayName,
        tier_golfers.golfer_name AS name, golfer_scores.fantasy_points AS fantasyPoints,
         golfer_scores.position, golfer_scores.score_to_par AS scoreToPar,
         golfer_scores.current_round AS currentRound, golfer_scores.through_status AS throughStatus,
         golfer_scores.refreshed_at AS refreshedAt,
         tiers.position AS tierPosition
       FROM lineups
       JOIN users ON users.id = lineups.user_id
       JOIN lineup_selections ON lineup_selections.lineup_id = lineups.id
       JOIN tiers ON tiers.id = lineup_selections.tier_id
       JOIN tier_golfers ON tier_golfers.tier_id = tiers.id AND tier_golfers.golfer_id = lineup_selections.golfer_id
       LEFT JOIN golfer_scores ON golfer_scores.tournament_id = (SELECT tournament_id FROM contests WHERE id = lineups.contest_id)
         AND golfer_scores.golfer_id = lineup_selections.golfer_id
       WHERE lineups.contest_id = ?
       ORDER BY lineups.created_at, tiers.position`,
    )
    .bind(contestId)
    .all<{
      lineupId: string;
      displayName: string;
      name: string;
      fantasyPoints: number | null;
      position: string | null;
      scoreToPar: string | null;
      currentRound: number | null;
      throughStatus: string | null;
      refreshedAt: string | null;
    }>();
  const staleBefore = Date.now() - scoringFreshnessMs;
  const entrants = new Map<string, EntrantStanding>();
  for (const row of results) {
    const entrant = entrants.get(row.lineupId) ?? {
      displayName: row.displayName,
      fantasyPoints: 0,
      position: null,
      golfers: [],
    };
    const refreshedAt = row.refreshedAt ? Date.parse(row.refreshedAt) : NaN;
    const freshnessThreshold =
      refresh?.status === 'complete'
        ? Date.parse(refresh.lastSuccessAt)
        : staleBefore;
    const scoringUnavailable =
      row.fantasyPoints === null ||
      !Number.isFinite(refreshedAt) ||
      refreshedAt < freshnessThreshold;
    entrant.golfers.push({
      name: row.name,
      fantasyPoints: scoringUnavailable ? null : row.fantasyPoints,
      position: scoringUnavailable ? null : row.position,
      scoreToPar: scoringUnavailable ? null : row.scoreToPar,
      currentRound: scoringUnavailable ? null : row.currentRound,
      throughStatus: scoringUnavailable ? null : row.throughStatus,
    });
    if (scoringUnavailable) entrant.fantasyPoints = null;
    else if (entrant.fantasyPoints !== null && row.fantasyPoints !== null)
      entrant.fantasyPoints += row.fantasyPoints;
    entrants.set(row.lineupId, entrant);
  }
  const ranked = Array.from(entrants.values()).sort(
    (left, right) =>
      (right.fantasyPoints ?? Number.NEGATIVE_INFINITY) -
      (left.fantasyPoints ?? Number.NEGATIVE_INFINITY),
  );
  let previousPoints: number | null | undefined;
  let previousPosition = 0;
  ranked.forEach((entrant, index) => {
    if (entrant.fantasyPoints !== null) {
      entrant.position =
        entrant.fantasyPoints === previousPoints ? previousPosition : index + 1;
      previousPosition = entrant.position;
      previousPoints = entrant.fantasyPoints;
    }
  });
  return {
    status: refresh?.status === 'complete' ? 'final' : 'provisional',
    lastSuccessAt: refresh?.lastSuccessAt ?? null,
    entrants: ranked,
  };
}

export async function refreshTournament(
  db: D1Database,
  tournamentId: string,
  tournament: EspnTournament,
) {
  const refreshedAt = new Date().toISOString();
  await db.batch([
    ...tournament.golfers.map((golfer) =>
      db
        .prepare(
          `INSERT INTO golfer_scores (tournament_id, golfer_id, golfer_name, fantasy_points, position, score_to_par, current_round, through_status, source_payload, refreshed_at)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
           WHERE COALESCE((SELECT status FROM tournament_refreshes WHERE tournament_id = ?), 'active') = 'active'
           ON CONFLICT(tournament_id, golfer_id) DO UPDATE SET golfer_name = excluded.golfer_name, fantasy_points = excluded.fantasy_points, position = excluded.position, score_to_par = excluded.score_to_par, current_round = excluded.current_round, through_status = excluded.through_status, source_payload = excluded.source_payload, refreshed_at = excluded.refreshed_at
           WHERE COALESCE((SELECT status FROM tournament_refreshes WHERE tournament_id = ?), 'active') = 'active'`,
        )
        .bind(
          tournamentId,
          golfer.id,
          golfer.name,
          golfer.fantasyPoints,
          golfer.position,
          golfer.scoreToPar,
          golfer.currentRound,
          golfer.throughStatus,
          JSON.stringify(golfer.source),
          refreshedAt,
          tournamentId,
          tournamentId,
        ),
    ),
    db
      .prepare(
        `INSERT INTO tournament_refreshes (tournament_id, status, last_success_at, source_payload)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(tournament_id) DO UPDATE SET status = excluded.status, last_success_at = excluded.last_success_at, source_payload = excluded.source_payload
         WHERE tournament_refreshes.status = 'active'`,
      )
      .bind(
        tournamentId,
        tournament.status,
        refreshedAt,
        JSON.stringify(tournament.source),
      ),
  ]);
}

export async function refreshActiveTournaments(
  db: D1Database,
  fetcher: typeof fetch = fetch,
) {
  const now = new Date().toISOString();
  const { results } = await db
    .prepare(
      `SELECT tournaments.id, COALESCE(tournaments.espn_event_id, tournaments.id) AS eventId
       FROM tournaments
       WHERE tournaments.source = 'espn' AND tournaments.starts_at <= ?
         AND EXISTS (SELECT 1 FROM contests WHERE contests.tournament_id = tournaments.id)
         AND COALESCE((SELECT status FROM tournament_refreshes WHERE tournament_id = tournaments.id), 'active') = 'active'`,
    )
    .bind(now)
    .all<{ id: string; eventId: string }>();
  for (const tournament of results) {
    try {
      await refreshTournament(
        db,
        tournament.id,
        await fetchEspnTournament(tournament.eventId, fetcher),
      );
    } catch (cause) {
      console.log(
        JSON.stringify({
          event: 'espn_refresh_failed',
          tournamentId: tournament.id,
          cause: String(cause),
        }),
      );
    }
  }
}
