import { calculateFantasyPoints, type Round } from './fantasy-points';

export type EspnGolfer = {
  id: string;
  name: string;
  position: string | null;
  scoreToPar: string | null;
  currentRound: number | null;
  throughStatus: string | null;
  fantasyPoints: number | null;
  source: unknown;
};

export type EspnTournament = {
  status: 'active' | 'complete' | 'cancelled';
  golfers: EspnGolfer[];
  source: unknown;
};

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' ? (value as UnknownRecord) : null;
}

function string(value: unknown) {
  return typeof value === 'string' && value ? value : null;
}

function number(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function rounds(value: unknown): Round[] | null {
  if (!Array.isArray(value)) return null;
  const result: Round[] = [];
  for (const rawRound of value) {
    const round = record(rawRound);
    const rawHoles = round && (round.holes ?? round.scorecard);
    if (!Array.isArray(rawHoles)) return null;
    const holes = rawHoles.map((rawHole) => {
      const hole = record(rawHole);
      return {
        par: number(hole?.par),
        strokes: number(hole?.strokes ?? hole?.score),
      };
    });
    if (holes.some((hole) => hole.par === null || hole.strokes === null))
      return null;
    const strokes = number(round?.strokes ?? round?.score);
    if (strokes === null) return null;
    result.push({ holes: holes as Round['holes'], strokes });
  }
  return result;
}

function status(event: UnknownRecord) {
  const type = record(record(event.status)?.type);
  if (type?.completed === true) return 'complete' as const;
  const state = string(type?.state)?.toLowerCase();
  return state === 'post' || state === 'final'
    ? 'cancelled'
    : ('active' as const);
}

export function normalizeEspnTournament(
  payload: unknown,
): EspnTournament | null {
  const root = record(payload);
  const event = Array.isArray(root?.events) ? record(root.events[0]) : root;
  if (!event) return null;
  const competition = Array.isArray(event.competitions)
    ? record(event.competitions[0])
    : event;
  const competitors = competition?.competitors;
  if (!Array.isArray(competitors)) return null;
  const completed = status(event);
  const golfers = competitors.flatMap((rawGolfer) => {
    const golfer = record(rawGolfer);
    const athlete = record(golfer?.athlete);
    const id = string(athlete?.id ?? golfer?.id);
    const name = string(athlete?.displayName ?? golfer?.displayName);
    if (!id || !name) return [];
    const finalPosition = number(golfer?.position);
    const tiedWith = number(golfer?.tiedWith) ?? 1;
    const scorecard = rounds(golfer?.rounds ?? golfer?.scorecard);
    return [
      {
        id,
        name,
        position: string(golfer?.position ?? golfer?.rank),
        scoreToPar: string(golfer?.scoreToPar ?? golfer?.toPar),
        currentRound: number(golfer?.currentRound ?? golfer?.round),
        throughStatus: string(
          golfer?.through ?? record(golfer?.status)?.detail,
        ),
        fantasyPoints: scorecard
          ? calculateFantasyPoints({
              rounds: scorecard,
              finalPosition:
                completed && finalPosition
                  ? { position: finalPosition, tiedWith }
                  : undefined,
            })
          : null,
        source: golfer,
      },
    ];
  });
  return { status: completed, golfers, source: payload };
}

export async function fetchEspnTournament(
  eventId: string,
  fetcher: typeof fetch = fetch,
): Promise<EspnTournament> {
  const response = await fetcher(
    `https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard?event=${encodeURIComponent(eventId)}`,
  );
  if (!response.ok) throw new Error(`ESPN returned ${response.status}`);
  const tournament = normalizeEspnTournament(await response.json());
  if (!tournament)
    throw new Error('ESPN response lacks tournament competitors');
  return tournament;
}
