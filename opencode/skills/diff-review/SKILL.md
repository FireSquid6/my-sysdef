---
name: diff-review
description: >-
  Use when a patch, pull request, current diff, or logical implementation chunk
  needs focused review, including proactively after making code changes. Spawn
  the diff-reviewer subagent; do not perform a broad codebase audit.
---

# Diff Review

Delegate the review to the `diff-reviewer` subagent using the Task tool. The
subagent owns the review; do not duplicate its investigation in the primary
agent.

## Delegation Workflow

1. Determine the intended review boundary from the user's request and current context.
2. Launch the `diff-reviewer` subagent with a concise but complete prompt identifying the diff, comparison base, pull request, patch, or implementation chunk to inspect.
3. Include relevant user requirements and known constraints in the prompt. Tell the subagent to review only and not modify files unless the user explicitly requested fixes.
4. Ask the subagent to inspect the diff plus only the callers, tests, schemas, configuration, and dependencies needed to validate changed behavior.
5. Ask it to run targeted checks when useful and return findings ordered by severity with precise file and line references.
6. Present the subagent's findings to the user without weakening, embellishing, or inventing claims. If it reports no substantive issues, state that directly along with its review scope and testing limitations.

If the diff boundary is ambiguous and cannot be inferred from the environment,
ask one concise clarification question before delegation. Do not use this skill
for a repository-wide audit; use `codebase-review` instead.
