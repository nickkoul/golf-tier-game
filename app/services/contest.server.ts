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

const invitationLifetimeMs = 7 * 24 * 60 * 60 * 1000;

function error(error: string, status: number) {
  return { error, status };
}

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

export async function userContests(db: D1Database, userId: string) {
  const { results } = await db
    .prepare(
      `SELECT DISTINCT contests.id, contests.name, contests.lineup_lock_at AS lineupLockAt, contests.tournament_time_zone AS tournamentTimeZone
       FROM contests LEFT JOIN participants ON participants.contest_id = contests.id
       WHERE contests.owner_user_id = ? OR participants.user_id = ? ORDER BY contests.created_at DESC`,
    )
    .bind(userId, userId)
    .all<Omit<Contest, 'tiers'>>();
  return results;
}

export async function ownerContest(
  db: D1Database,
  ownerUserId: string,
  contestId: string,
): Promise<Contest | null> {
  return contestForUser(db, ownerUserId, contestId, true);
}

export async function contestForUser(
  db: D1Database,
  userId: string,
  contestId: string,
  ownerOnly = false,
): Promise<(Contest & { isOwner: boolean }) | null> {
  const contest = await db
    .prepare(
      `SELECT contests.id, contests.name, contests.lineup_lock_at AS lineupLockAt, contests.tournament_time_zone AS tournamentTimeZone,
        contests.owner_user_id = ? AS isOwner
       FROM contests LEFT JOIN participants ON participants.contest_id = contests.id AND participants.user_id = ?
       WHERE contests.id = ? AND (contests.owner_user_id = ? OR (? = 0 AND participants.user_id IS NOT NULL))`,
    )
    .bind(userId, userId, contestId, userId, ownerOnly ? 1 : 0)
    .first<Omit<Contest, 'tiers'> & { isOwner: number }>();
  if (!contest) return null;
  const { results: tiers } = await db
    .prepare(
      'SELECT id, name FROM tiers WHERE contest_id = ? ORDER BY position',
    )
    .bind(contestId)
    .all<{ id: string; name: string }>();
  return {
    ...contest,
    isOwner: Boolean(contest.isOwner),
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

export async function inviteParticipant(
  db: D1Database,
  ownerUserId: string,
  contestId: string,
  value: unknown,
) {
  const email =
    value &&
    typeof value === 'object' &&
    typeof (value as { email?: unknown }).email === 'string'
      ? (value as { email: string }).email.trim().toLowerCase()
      : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return error('Enter a valid email address.', 400);
  if (!(await ownerContest(db, ownerUserId, contestId)))
    return error('Contest not found.', 404);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + invitationLifetimeMs).toISOString();
  await db.batch([
    db
      .prepare(
        'UPDATE invitations SET revoked_at = ? WHERE contest_id = ? AND email = ? AND revoked_at IS NULL AND responded_at IS NULL',
      )
      .bind(now, contestId, email),
    db
      .prepare(
        'INSERT INTO invitations (id, contest_id, email, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .bind(id, contestId, email, expiresAt, now),
  ]);
  return { invitation: { id, email, expiresAt } };
}

export async function respondToInvitation(
  db: D1Database,
  user: { id: string; email: string },
  invitationId: string,
  value: unknown,
) {
  const response =
    value && typeof value === 'object'
      ? (value as { response?: unknown }).response
      : null;
  if (response !== 'accept' && response !== 'decline')
    return error('Choose whether to accept or decline.', 400);
  const now = new Date().toISOString();
  const invitation = await db
    .prepare(
      'UPDATE invitations SET responded_at = ?, response = ? WHERE id = ? AND email = ? AND revoked_at IS NULL AND responded_at IS NULL AND expires_at > ? RETURNING contest_id AS contestId',
    )
    .bind(
      now,
      response === 'accept' ? 'accepted' : 'declined',
      invitationId,
      user.email,
      now,
    )
    .first<{ contestId: string }>();
  if (!invitation) {
    const exists = await db
      .prepare('SELECT id FROM invitations WHERE id = ?')
      .bind(invitationId)
      .first();
    return exists
      ? error(
          'This Invitation is unavailable or addressed to another email address.',
          403,
        )
      : error('Invitation not found.', 404);
  }
  if (response === 'accept')
    await db
      .prepare(
        'INSERT OR IGNORE INTO participants (contest_id, user_id, joined_at) VALUES (?, ?, ?)',
      )
      .bind(invitation.contestId, user.id, now)
      .run();
  return { contestId: invitation.contestId, response };
}

export async function leaveContest(
  db: D1Database,
  userId: string,
  contestId: string,
) {
  const contest = await contestForUser(db, userId, contestId);
  if (!contest || contest.isOwner) return error('Contest not found.', 404);
  if (new Date(contest.lineupLockAt) <= new Date())
    return error('Participants cannot leave after Lineup Lock.', 400);
  await db
    .prepare('DELETE FROM participants WHERE contest_id = ? AND user_id = ?')
    .bind(contestId, userId)
    .run();
  return {};
}

export async function revokeInvitation(
  db: D1Database,
  ownerUserId: string,
  contestId: string,
  invitationId: string,
) {
  if (!(await ownerContest(db, ownerUserId, contestId)))
    return error('Contest not found.', 404);
  const result = await db
    .prepare(
      'UPDATE invitations SET revoked_at = ? WHERE id = ? AND contest_id = ? AND revoked_at IS NULL AND responded_at IS NULL',
    )
    .bind(new Date().toISOString(), invitationId, contestId)
    .run();
  return result.meta.changes ? {} : error('Invitation not found.', 404);
}

export async function removeParticipant(
  db: D1Database,
  ownerUserId: string,
  contestId: string,
  participantId: string,
) {
  if (!(await ownerContest(db, ownerUserId, contestId)))
    return error('Contest not found.', 404);
  const result = await db
    .prepare('DELETE FROM participants WHERE contest_id = ? AND user_id = ?')
    .bind(contestId, participantId)
    .run();
  return result.meta.changes ? {} : error('Participant not found.', 404);
}

export async function contestManagement(
  db: D1Database,
  ownerUserId: string,
  contestId: string,
) {
  if (!(await ownerContest(db, ownerUserId, contestId))) return null;
  const [{ results: invitations }, { results: participants }] =
    await Promise.all([
      db
        .prepare(
          'SELECT id, email, expires_at AS expiresAt FROM invitations WHERE contest_id = ? AND revoked_at IS NULL AND responded_at IS NULL AND expires_at > ? ORDER BY created_at DESC',
        )
        .bind(contestId, new Date().toISOString())
        .all<{ id: string; email: string; expiresAt: string }>(),
      db
        .prepare(
          'SELECT users.id, users.email, users.display_name AS displayName FROM participants JOIN users ON users.id = participants.user_id WHERE participants.contest_id = ? ORDER BY participants.joined_at',
        )
        .bind(contestId)
        .all<{ id: string; email: string; displayName: string }>(),
    ]);
  return { invitations, participants };
}

export async function invitationsForUser(db: D1Database, email: string) {
  const { results } = await db
    .prepare(
      `SELECT invitations.id, contests.name AS contestName, invitations.expires_at AS expiresAt
     FROM invitations JOIN contests ON contests.id = invitations.contest_id
     WHERE invitations.email = ? AND invitations.revoked_at IS NULL AND invitations.responded_at IS NULL AND invitations.expires_at > ?
     ORDER BY invitations.created_at DESC`,
    )
    .bind(email, new Date().toISOString())
    .all<{ id: string; contestName: string; expiresAt: string }>();
  return results;
}
