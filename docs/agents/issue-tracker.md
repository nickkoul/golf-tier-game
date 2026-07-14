# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`.
- **Read an issue**: `gh issue view <number> --comments`, including labels.
- **List issues**: `gh issue list` with the required state and labels.
- **Comment on an issue**: `gh issue comment <number> --body "..."`.
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`.
- **Close**: `gh issue close <number> --comment "..."`.

Infer the repository from `git remote -v`; `gh` does this automatically inside the clone.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: create one issue labelled `wayfinder:map`, containing the Notes, Decisions-so-far, and fog sections.
- **Child ticket**: create an issue labelled `wayfinder:<type>` (`research`, `prototype`, `grilling`, or `task`), then link it to the map with GitHub sub-issues. If sub-issues are unavailable, add it to a task list in the map and put `Part of #<map>` at the top of its body.
- **Blocking**: use native GitHub issue dependencies. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-database-id>`. If unavailable, use `Blocked by: #<number>` in the child body.
- **Frontier query**: list open map children, excluding tickets with an open blocker or an assignee. First in map order wins.
- **Claim**: `gh issue edit <number> --add-assignee @me` before working.
- **Resolve**: add a resolution comment, close the ticket, then append a linked one-line gist to the map's Decisions-so-far.
