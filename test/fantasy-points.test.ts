import { describe, expect, it } from 'vitest';
import { calculateFantasyPoints } from '../app/services/fantasy-points';

describe('Fantasy Points', () => {
  it('awards completed-hole, hole-in-one, streak, bogey-free, under-70, and tied final-position points', () => {
    const completeRound = Array.from({ length: 18 }, (_, index) => ({
      par: 4,
      strokes: index === 0 ? 3 : 4,
    }));
    completeRound[0] = { par: 3, strokes: 1 };

    expect(
      calculateFantasyPoints({
        rounds: Array.from({ length: 4 }, () => ({
          holes: completeRound,
          strokes: 69,
        })),
        finalPosition: { position: 2, tiedWith: 2 },
      }),
    ).toBe(122);
  });

  it('returns unavailable rather than estimating points from an incomplete scorecard', () => {
    expect(
      calculateFantasyPoints({
        rounds: [{ holes: [{ par: 4, strokes: 3 }], strokes: 3 }],
      }),
    ).toBeNull();
  });
});
