# Pi configuration

Managed by `modules/pi.ts` (enabled in local `config.yaml`).

| Pi path | Repository source |
| --- | --- |
| `~/.pi/agent/settings.json` | `pi/settings.json` |
| `~/.pi/agent/subagents.json` | `pi/subagents.json` |
| `~/.pi/agent/agent-tool-description.md` | `pi/agent-tool-description.md` |
| `~/.pi/agent/extensions/` | `pi/extensions/` |
| `~/.pi/agent/themes/` | `pi/themes/` |
| `~/.pi/agent/skills/herdr-orchestration/` | `pi/skills/herdr-orchestration/` |

The module honors `PI_CODING_AGENT_DIR` when set.

The selected theme is `tokyonight-night`, using the same Tokyo Night Night
palette as Kitty and Neovim. Its definition lives in `themes/tokyonight-night.json`.

Put user extensions in `extensions/`. Pi discovers them through the symlink;
run `/reload` after adding extensions or editing configuration.

## Persistent planning and execution

Run `/reload`, then:

```text
/plan Add pagination to the users endpoint and cover it with tests
```

`extensions/plan.ts` asks Pi to explore the codebase, resolve material questions
through an input dialog, record implementation and verification todos with the
`plan_todos` tool, and execute immediately. No separate approval is required after
planning; normal safety/permission rules still apply. Planning-before-editing is
an instruction, not a read-only sandbox.

A todo widget shows progress. Completion requires an explicit tool update with
verification evidence; saying “done” in prose does not clear work. New work is
appended, not substituted for unfinished todos. At Pi's `agent_before_settle`
boundary, the extension requests another turn whenever planning or execution is
unfinished. There is no fixed iteration limit: continued runs consume tokens
until completion, a recorded blocker, or your intervention.

- `/plan-status`: show the plan, todo evidence, and blocker details.
- `/plan-resume`: resume after an interrupt or after resolving a blocker.
- `/plan-cancel`: stop enforcement and abort the current run; retain the history.
  This does not undo file changes.

Blockers require a reason, attempted remedies, and what is needed to proceed.
Unanswered essential clarification (including in headless mode) is a blocker.
The extension enforces structured reporting, but the model still judges whether
work is genuinely complete or blocked—it cannot independently prove those claims.

State is stored in the session's active branch, restored on reload/resume/tree
navigation, and supplied again on every model request so compaction does not lose
remaining todos. Restoring a session does not start work by itself; use
`/plan-resume` to restart it. Escape, process exit, and Pi's hard provider/error
exits are never overridden; ordinary early wrap-up is what the hook prevents.
Cancelled plans cannot be resumed; start a new `/plan` instead.

Requires Pi's `agent_before_settle` API (verified with 1.5.2). If another extension
registers `/plan`, Pi assigns numeric suffixes; invoke this extension's command
from the command menu.

Tests: `bun test pi/tests/plan.test.js`. They use the installed Pi package's real
extension loader. For non-managed installations, set `PI_TEST_PACKAGE_DIR` to the
package directory containing `dist/core/extensions/loader.js`; tests are skipped
with a warning if no installation is available.

## Herdr orchestration skill

Run `/reload`, then use `/skill:herdr-orchestration` to coordinate agents through
Herdr Core's `hc` CLI. Pi can also load it automatically for relevant requests.
It covers discovery, safe messaging, bounded delegation, remote agents, result
verification, and cleanup. The skill reads `hc --skill` for current CLI behavior.
Only this individual skill is linked; other local and package skills are preserved.
Requires `hc` to be installed separately. No agents are launched during sync.

Tests: `bun test test/pi-skills.test.ts`.

## Delegation policy

Work directly by default. Subagents remain available for explicit requests,
substantial independent parallel work, and useful independent review—not as the
normal path for research, exploration, or implementation.

`subagents.json` selects the custom Agent description in
`agent-tool-description.md`. `extensions/direct-work-policy.ts` replaces the
plugin's delegation-first prompt guidelines using Pi's structured prompt hook;
it leaves spawning, steering, resuming, and the agents UI intact. Workflows
require an explicit request for workflow/multi-agent orchestration.

Run `/reload` (or restart Pi) after changing these files. Project-level
`.pi/subagents.json` and `.pi/agent-tool-description.md` can override the plugin's
global settings; the global policy extension still supplies direct-work guidance.

Credentials (`auth.json`), sessions, model cache (`models-store.json`), and the
Pi installation remain in `~/.pi/agent`, outside this repository. Do not put
API keys or other secrets in tracked settings or extensions.
