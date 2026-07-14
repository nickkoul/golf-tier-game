# Adopted PGA Fantasy Scoring Table

**Decision:** adopt the current DraftKings golf classic scoring table below as the
product's one-time copied PGA Tour scoring table. This is a rules reference, not
a runtime dependency on DraftKings. Source checked 2026-07-13.

## Primary Sources

- [DraftKings: Rules and Scoring for Golf](https://www.draftkings.com/help/rules/golf)
  is the authoritative current table and qualification text.
- [gstat ESPN client at `5cfea614`](https://github.com/nickkoul/gstat/tree/5cfea614c7cc3f3cff0480eeaad076b711f575ae/internal/espn)
  is the assessed implementation. Its sole upstream is ESPN's
  [PGA scoreboard response](https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard),
  as set in [client.go](https://github.com/nickkoul/gstat/blob/5cfea614c7cc3f3cff0480eeaad076b711f575ae/internal/espn/client.go#L15-L19).

## Points

### Per Hole

| Result | Points |
| --- | ---: |
| Double eagle (or better) | +13 |
| Hole in one | +5 |
| Eagle | +8 |
| Birdie | +3 |
| Par | +0.5 |
| Bogey | -0.5 |
| Double bogey or worse | -1 |

The hole-in-one award is additional to the score-relative-to-par award for that
hole. The source defines double eagle as *or better* and double bogey as *or
worse*.

### Bonuses

| Result | Points | Qualification |
| --- | ---: | --- |
| Streak of three birdies or better | +3 | Three consecutive holes in one round; at most one streak award per round. |
| Bogey-free round | +3 | A complete 18-hole round with no bogey or worse. |
| All four rounds below 70 strokes | +5 | The golfer must play all four rounds and shoot fewer than 70 strokes in each. |

### Final Finishing Position

| Position | Points | Position | Points |
| --- | ---: | --- | ---: |
| 1st | +30 | 2nd | +20 |
| 3rd | +18 | 4th | +16 |
| 5th | +14 | 6th | +12 |
| 7th | +10 | 8th | +9 |
| 9th | +8 | 10th | +7 |
| 11th-15th | +6 | 16th-20th | +5 |
| 21st-25th | +4 | 26th-30th | +3 |
| 31st-40th | +2 | 41st-50th | +1 |

No position points are listed below 50th. For a tie, add the points for every
occupied finishing position and divide evenly among the tied golfers (for
example, a two-way tie for second shares second- and third-place points).

## Qualification And Settlement Rules

- Award normal hole points only for completed holes. A hole in one receives both
  its normal hole-result points and the separate hole-in-one award.
- A streak is based on consecutive holes within a round, not across rounds, and
  cannot earn more than one award in that round.
- Bogey-free requires all 18 holes; an incomplete bogey-free card does not
  qualify.
- The under-70 bonus requires four played rounds, each under 70; it cannot be
  earned in a shorter personal scorecard.
- Apply finishing-position points using the final leaderboard and the tie split
  rule. A golfer who does not finish in a listed position receives no finishing
  points.
- DraftKings' published scoring and stat-correction process is authoritative for
  DraftKings contests. This product instead calculates its copied table from
  ESPN data, so ESPN corrections remain provisional until the product sees the
  tournament complete, consistent with the project's defined `Fantasy Points`
  and `Final Standings` terms.

## gstat ESPN Coverage

The assessment is against the current `internal/espn` package at the cited
commit, not merely the raw ESPN response.

| Scoring input | Current gstat coverage | Assessment |
| --- | --- | --- |
| Per-hole result relative to par | `HoleScore` exposes `Strokes`, derived `Par`, `Played`, and a derived score category. | Covered when ESPN supplies the hole linescore. Compute the exact relation as `Strokes - Par`; do not rely on gstat's `eagle` label, which merges eagle and double eagle. |
| Hole in one | `HoleScore.Strokes`. | Covered when the hole is present: `Strokes == 1`. It is not an explicit field, but needs none. |
| Consecutive birdies or better | Per-round holes are sorted by hole number; score relation is derivable. | Covered when all relevant hole linescores are present. Count a maximum of one qualifying run per round. |
| Bogey-free 18-hole round | Per-round hole list, score relation, and `Played`; a completed round also has a stroke total. | Covered when all 18 hole linescores are present. Require exactly the complete 18-hole card rather than trusting a partial live card. |
| Four scores below 70 | `RoundScore.Played` and `RoundScore.Strokes` for up to four rounds. | Covered for the numeric test. Also require four completed rounds; `Played` is based on a plausible full-round stroke total, not an explicit ESPN completion flag. |
| Final rank and tie pool | `CanonicalRank`, `DisplayPosition`, `Tied`, and total score. | Covered for a normal final leaderboard. The client groups equal total scores to derive ties, so the scoring adapter must sum every occupied position before division. |
| Tournament completion before settlement | Raw `StatusType.Completed` is decoded, but `Tournament` retains only the event state string (`pre`/`in`/`post`). | **Gap:** completion is discarded. Preserve `Completed` (and preferably event and competition status detail) so Final Standings use ESPN's completion signal, not an inferred `post` state. |
| Withdrawn/disqualified eligibility for final position and bonuses | `Player.Status` is inferred from linescore shapes; raw competitor status is decoded but not mapped. `DQ` is named only in a comment. | **Gap:** DQ is never assigned, and WD is a heuristic that can misclassify nonstandard/incomplete cards. Preserve ESPN's explicit competitor status and define the copied-rule treatment before awarding finish points or round bonuses. |
| Missing or incomplete scorecard | A missing hole has no `HoleScore`; no completeness indicator is exposed. | **Gap:** the adapter must detect and surface incomplete required input as `Scoring Unavailable`, rather than treating omitted holes as zero points. |

Relevant implementation evidence: `parseHoleScores` derives par from strokes and
the ESPN relative score and collapses all values at or below -2 to `eagle`
([client.go:304-379](https://github.com/nickkoul/gstat/blob/5cfea614c7cc3f3cff0480eeaad076b711f575ae/internal/espn/client.go#L304-L379));
the public model exposes the round and hole fields
([types.go:170-202](https://github.com/nickkoul/gstat/blob/5cfea614c7cc3f3cff0480eeaad076b711f575ae/internal/espn/types.go#L170-L202));
and `parseTournament` discards `StatusType.Completed`
([client.go:83-132](https://github.com/nickkoul/gstat/blob/5cfea614c7cc3f3cff0480eeaad076b711f575ae/internal/espn/client.go#L83-L132)).

## Result

The scoring table is fully captured and can be copied into the specification.
The existing client supplies the ordinary live scoring inputs, including enough
numeric data to distinguish all hole outcomes, but cannot safely settle Final
Standings without preserving ESPN completion and explicit competitor-status
data. Missing per-hole data must remain `Scoring Unavailable`.
