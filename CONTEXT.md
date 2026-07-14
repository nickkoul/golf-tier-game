# Ubiquitous Language

## Contest

A private golf competition created by a Contest Owner for one selected Tournament. Its name is the selected Tournament's name. Creation is atomic: the Contest is immediately visible to its Contest Owner and has no saved draft state. Its selected Tournament and Tier Board are immutable. A Contest has a Tier Board, a Lineup Lock time, Participants, and a live Standings view.

## Contest Owner

A User who creates and administers a Contest, including inviting and removing Participants. Before Lineup Lock, the Contest Owner may perform an Owner Cancellation.

## Owner Cancellation

A Contest Owner's pre-Lineup-Lock cancellation of a Contest. The canceled Contest leaves active play and Standings, and its Participants are notified.

## Tournament

An upcoming PGA Tour event selected from the ESPN-backed event list and associated with a Contest. A Tournament is selectable only before its scheduled first tee time.

## User

A person identified by a verified email address through passwordless sign-in. A User has an editable display name visible to Contest Participants.

## Invitation

A single-use, seven-day request for a specified email address to become a Participant in a Contest. The Contest Owner may revoke or resend it.

## Participant

A User with access to a Contest. A Participant may view the Contest and edit or enter their own Lineup until Lineup Lock.

## Entrant

A Participant with an active, complete, valid Lineup in a Contest. An Entrant may remove that Lineup before Lineup Lock and return to not entered. A Participant is otherwise not entered; partial Lineups do not exist.

## Tier Board

The ordered, manually named groups of eligible Golfers from a Contest's Tournament field. A valid Tier Board has one or more uniquely named Tiers, each containing at least one Golfer. Each Golfer belongs to at most one Tier, and an Entrant selects one Golfer from each Tier.

## Lineup

An Entrant's selections: exactly one Golfer from every Tier in a Contest. A Lineup is submitted only when complete and valid; partial Lineups do not exist. Before Lineup Lock, an Entrant may atomically replace their active Lineup with another complete valid Lineup. Golfers may appear in multiple Lineups.

## Lineup Lock

The selected Tournament's scheduled first tee time, displayed in each viewer's local time and the Tournament's local time zone, after which Entrants cannot change their Lineup. Contest Owners cannot override it. Only active, valid Lineups enter Standings at Lineup Lock.

## Fantasy Points

The total calculated from the product's one-time copy of the DraftKings PGA fantasy-scoring rules using ESPN live golf data. Standings rank Lineups by this total.

## Standings

The ordered, live ranking of Contest Lineups by the sum of their selected Golfers' Fantasy Points, highest first, available from Lineup Lock. Equal totals share a position.

## Final Standings

The frozen Standings calculated when ESPN marks the Contest's tournament complete. Before then, Standings are provisional and update for ESPN corrections.

## Scoring Unavailable

The state in which ESPN lacks the valid data needed to calculate a Golfer's Fantasy Points. Affected Standings remain provisional rather than estimating or assigning missing points.

## Contest Cancellation

The outcome when ESPN ends a Contest's tournament without marking it complete. A canceled Contest has no Final Standings.
