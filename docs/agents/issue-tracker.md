# Issue tracker: GitHub

Issues and PRDs live in FireSquid6/my-sysdef GitHub Issues.
Use the gh CLI from this checkout.

## Operations

- Create: gh issue create --title "..." --body "..."
- Read: gh issue view <number> --comments
- List: gh issue list --state open
- Comment: gh issue comment <number> --body "..."
- Label: gh issue edit <number> --add-label "..."
- Remove label: gh issue edit <number> --remove-label "..."
- Close: gh issue close <number> --comment "..."

Use heredocs for multiline bodies.

## Pull requests as a triage surface

**PRs as a request surface: yes.**

Triage external PRs through the same labels and states as issues.
Include authors associated as CONTRIBUTOR, FIRST_TIME_CONTRIBUTOR,
or NONE. Leave OWNER, MEMBER, and COLLABORATOR PRs alone.

Use gh pr view, gh pr diff, gh pr list, gh pr comment,
gh pr edit, and gh pr close for PR operations.

Issues and PRs share numbers. Resolve ambiguous references with
gh pr view <number>, falling back to gh issue view <number>.

## Skill conventions

“Publish to the issue tracker” means create a GitHub issue.
“Fetch the relevant ticket” means read the issue with comments.

## Wayfinding

Use one issue labelled wayfinder:map as the map.
Link child tickets as GitHub sub-issues; otherwise use a task list
in the map and “Part of #<map>” in each child.

Label children wayfinder:research, wayfinder:prototype,
wayfinder:grilling, or wayfinder:task.

Record blockers using native GitHub issue dependencies where
available; otherwise use “Blocked by: #<number>” in the child.

Select unassigned open children with no open blockers, in map order.
Claim with gh issue edit <number> --add-assignee @me.
Resolve by commenting with the answer, closing the child, and adding
a summary and link to the map’s Decisions-so-far.
