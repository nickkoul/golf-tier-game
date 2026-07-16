type Tournament = {
  id: string;
  name: string;
  startsAt: string;
  timeZone: string;
  golfers: { id: string; name: string }[];
};

type TierInput = { name: string; golferIds: string[] };

type Contest = {
  id: string;
  name: string;
  lineupLockAt: string;
  tournamentTimeZone: string;
  tiers: { name: string; golfers: { id: string; name: string }[] }[];
};

type CreateContestResult =
  | { contest: Contest }
  | { error: string; status: number };

export async function availableTournaments(
  db: D1Database,
): Promise<Tournament[]> {
  const now = new Date().toISOString();
  const { results } = await db
    .prepare(
      `SELECT id, name, starts_at AS startsAt, time_zone AS timeZone
       FROM tournaments
       WHERE source = 'espn' AND starts_at > ? AND field_available_at IS NOT NULL AND field_available_at <= ?
       AND EXISTS (SELECT 1 FROM tournament_golfers WHERE tournament_id = tournaments.id)
       ORDER BY starts_at`,
    )
    .bind(now, now)
    .all<Omit<Tournament, 'golfers'>>();

  return Promise.all(
    results.map(async (tournament) => ({
      ...tournament,
      golfers: await tournamentGolfers(db, tournament.id),
    })),
  );
}

async function tournamentGolfers(db: D1Database, tournamentId: string) {
  const { results } = await db
    .prepare(
      'SELECT golfer_id AS id, golfer_name AS name FROM tournament_golfers WHERE tournament_id = ? ORDER BY golfer_name',
    )
    .bind(tournamentId)
    .all<{ id: string; name: string }>();
  return results;
}

function validTierBoard(value: unknown): TierInput[] | string {
  if (!Array.isArray(value) || value.length === 0)
    return 'Add at least one Tier.';

  const tierNames = new Set<string>();
  const golferIds = new Set<string>();
  const tiers: TierInput[] = [];
  for (let position = 0; position < value.length; position += 1) {
    const tier = value[position];
    if (!tier || typeof tier !== 'object')
      return 'Each Tier needs valid Golfers.';
    const { name, golferIds: ids } = tier as {
      name?: unknown;
      golferIds?: unknown;
    };
    const tierName =
      (typeof name === 'string' ? name.trim() : '') || `Tier ${position + 1}`;
    if (tierNames.has(tierName.toLocaleLowerCase()))
      return 'Tier names must be unique.';
    if (!Array.isArray(ids) || ids.length === 0)
      return 'Each Tier needs at least one Golfer.';
    tierNames.add(tierName.toLocaleLowerCase());
    const tierGolferIds: string[] = [];
    for (const id of ids) {
      if (typeof id !== 'string' || !id)
        return 'Each Tier needs valid Golfers.';
      if (golferIds.has(id)) return 'A Golfer can appear in only one Tier.';
      golferIds.add(id);
      tierGolferIds.push(id);
    }
    tiers.push({ name: tierName, golferIds: tierGolferIds });
  }
  return tiers;
}

export async function createContest(
  db: D1Database,
  ownerUserId: string,
  value: unknown,
): Promise<CreateContestResult> {
  if (!value || typeof value !== 'object')
    return { error: 'Enter a Tournament and Tier Board.', status: 400 };
  const { tournamentId, tiers: rawTiers } = value as {
    tournamentId?: unknown;
    tiers?: unknown;
  };
  if (typeof tournamentId !== 'string')
    return { error: 'Select an eligible Tournament.', status: 400 };
  const tiers = validTierBoard(rawTiers);
  if (typeof tiers === 'string') return { error: tiers, status: 400 };

  const tournaments = await availableTournaments(db);
  const tournament = tournaments.find(({ id }) => id === tournamentId);
  if (!tournament)
    return { error: 'Select an eligible Tournament.', status: 400 };

  const golfers = new Map(
    tournament.golfers.map((golfer) => [golfer.id, golfer]),
  );
  if (tiers.some((tier) => tier.golferIds.some((id) => !golfers.has(id))))
    return { error: 'Choose Golfers from the Tournament field.', status: 400 };

  const contestId = crypto.randomUUID();
  const now = new Date().toISOString();
  const tierRecords = tiers.map((tier, position) => ({
    ...tier,
    id: crypto.randomUUID(),
    position,
  }));
  await db.batch([
    db
      .prepare(
        'INSERT INTO contests (id, owner_user_id, tournament_id, name, lineup_lock_at, tournament_time_zone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(
        contestId,
        ownerUserId,
        tournament.id,
        tournament.name,
        tournament.startsAt,
        tournament.timeZone,
        now,
      ),
    ...tierRecords.flatMap((tier) => [
      db
        .prepare(
          'INSERT INTO tiers (id, contest_id, position, name) VALUES (?, ?, ?, ?)',
        )
        .bind(tier.id, contestId, tier.position, tier.name),
      ...tier.golferIds.map((golferId) =>
        db
          .prepare(
            'INSERT INTO tier_golfers (tier_id, golfer_id, golfer_name) VALUES (?, ?, ?)',
          )
          .bind(tier.id, golferId, golfers.get(golferId)!.name),
      ),
    ]),
  ]);

  return {
    contest: {
      id: contestId,
      name: tournament.name,
      lineupLockAt: tournament.startsAt,
      tournamentTimeZone: tournament.timeZone,
      tiers: tierRecords.map((tier) => ({
        name: tier.name,
        golfers: tier.golferIds.map((id) => golfers.get(id)!),
      })),
    },
  };
}

export async function ownerContests(db: D1Database, ownerUserId: string) {
  const { results } = await db
    .prepare(
      'SELECT id, name, lineup_lock_at AS lineupLockAt, tournament_time_zone AS tournamentTimeZone FROM contests WHERE owner_user_id = ? ORDER BY created_at DESC',
    )
    .bind(ownerUserId)
    .all<Omit<Contest, 'tiers'>>();
  return results;
}

export async function ownerContest(
  db: D1Database,
  ownerUserId: string,
  contestId: string,
): Promise<Contest | null> {
  const contest = await db
    .prepare(
      'SELECT id, name, lineup_lock_at AS lineupLockAt, tournament_time_zone AS tournamentTimeZone FROM contests WHERE id = ? AND owner_user_id = ?',
    )
    .bind(contestId, ownerUserId)
    .first<Omit<Contest, 'tiers'>>();
  if (!contest) return null;
  const { results: tiers } = await db
    .prepare(
      'SELECT id, name FROM tiers WHERE contest_id = ? ORDER BY position',
    )
    .bind(contestId)
    .all<{ id: string; name: string }>();
  return {
    ...contest,
    tiers: await Promise.all(
      tiers.map(async (tier) => ({
        name: tier.name,
        golfers: await (async () => {
          const { results } = await db
            .prepare(
              'SELECT golfer_id AS id, golfer_name AS name FROM tier_golfers WHERE tier_id = ? ORDER BY golfer_name',
            )
            .bind(tier.id)
            .all<{ id: string; name: string }>();
          return results;
        })(),
      })),
    ),
  };
}
