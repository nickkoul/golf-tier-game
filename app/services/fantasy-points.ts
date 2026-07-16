export type Hole = { par: number; strokes: number };
export type Round = { holes: Hole[]; strokes: number };
export type FinalPosition = { position: number; tiedWith: number };

type Scorecard = {
  rounds: Round[];
  finalPosition?: FinalPosition;
};

function holePoints(hole: Hole) {
  const relativeToPar = hole.strokes - hole.par;
  const normal =
    relativeToPar <= -3
      ? 13
      : relativeToPar === -2
        ? 8
        : relativeToPar === -1
          ? 3
          : relativeToPar === 0
            ? 0.5
            : relativeToPar === 1
              ? -0.5
              : -1;
  return normal + (hole.strokes === 1 ? 5 : 0);
}

function finalPositionPoints({ position, tiedWith }: FinalPosition) {
  const pointsForPosition = (value: number): number => {
    if (value === 1) return 30;
    if (value === 2) return 20;
    if (value === 3) return 18;
    if (value === 4) return 16;
    if (value === 5) return 14;
    if (value === 6) return 12;
    if (value === 7) return 10;
    if (value === 8) return 9;
    if (value === 9) return 8;
    if (value === 10) return 7;
    if (value <= 15) return 6;
    if (value <= 20) return 5;
    if (value <= 25) return 4;
    if (value <= 30) return 3;
    if (value <= 40) return 2;
    if (value <= 50) return 1;
    return 0;
  };
  return (
    Array.from({ length: tiedWith }, (_, index) =>
      pointsForPosition(position + index),
    ).reduce((total, points) => total + points, 0) / tiedWith
  );
}

export function calculateFantasyPoints(scorecard: Scorecard): number | null {
  if (
    !scorecard.rounds.every(
      (round) =>
        round.holes.length === 18 &&
        round.holes.every(
          (hole) =>
            Number.isInteger(hole.par) &&
            hole.par > 0 &&
            Number.isInteger(hole.strokes) &&
            hole.strokes > 0,
        ),
    )
  )
    return null;

  const roundPoints = scorecard.rounds.reduce((total, round) => {
    const holes = round.holes.reduce((sum, hole) => sum + holePoints(hole), 0);
    const birdieStreak = round.holes.some(
      (_, index) =>
        index >= 2 &&
        round.holes
          .slice(index - 2, index + 1)
          .every((hole) => hole.strokes <= hole.par - 1),
    );
    const bogeyFree = round.holes.every((hole) => hole.strokes <= hole.par);
    return total + holes + (birdieStreak ? 3 : 0) + (bogeyFree ? 3 : 0);
  }, 0);
  const under70 =
    scorecard.rounds.length === 4 &&
    scorecard.rounds.every((round) => round.strokes < 70)
      ? 5
      : 0;
  return (
    roundPoints +
    under70 +
    (scorecard.finalPosition ? finalPositionPoints(scorecard.finalPosition) : 0)
  );
}
