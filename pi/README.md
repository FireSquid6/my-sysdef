# Pi configuration

Managed by `modules/pi.ts` (enabled in local `config.yaml`).

| Pi path | Repository source |
| --- | --- |
| `~/.pi/agent/settings.json` | `pi/settings.json` |
| `~/.pi/agent/subagents.json` | `pi/subagents.json` |
| `~/.pi/agent/agent-tool-description.md` | `pi/agent-tool-description.md` |
| `~/.pi/agent/extensions/` | `pi/extensions/` |
| `~/.pi/agent/themes/` | `pi/themes/` |

The module honors `PI_CODING_AGENT_DIR` when set.

The selected theme is `tokyonight-night`, using the same Tokyo Night Night
palette as Kitty and Neovim. Its definition lives in `themes/tokyonight-night.json`.

Put user extensions in `extensions/`. Pi discovers them through the symlink;
run `/reload` after adding extensions or editing configuration.

## Branch worktrees and context forks

Run `/reload` after installing this extension on every host that will run Pi:

```text
/branchfork feature/login
/branchfork feature/login desktop
```

`extensions/branchfork/index.ts` opens or creates a Git worktree and a Herdr workspace. Omitting the host means **the machine running Pi**, not the machine displaying Herdr. Explicit hosts are saved machine names from the GUI host's `herdr-core machine ls` list.

### Prerequisites and host routing

- Pi 1.5.2-compatible APIs/CLI, Node.js, Git, and `herdr-core` on participating hosts; Herdr's older `herdr-app` GUI/control protocol used by this repo's project picker.
- Install/sync this sysdef Pi extension on destination hosts too, and `/reload` existing agents before sending updates. No credentials or machine settings are copied.
- The Pi host must be able to reach the GUI host through Herdr Core, and the GUI host must have configured connections to destination hosts. Destination hosts need their own origin access, Pi model credentials, Neovim, and Fish.
- A local GUI is preferred. Otherwise the extension discovers an unambiguous GUI among connected saved machines. Set `BRANCHFORK_GUI_HOST=<saved-machine-name>` in Pi's environment to choose a GUI explicitly. For a remote Pi whose GUI host is not saved/reachable from that Pi host, add/connect that host first; an incoming GUI connection alone is not assumed to provide reverse routing.
- `HERDR_APP_HOME`, `XDG_CONFIG_HOME`, and `PI_CODING_AGENT_DIR` are honored on the host doing the operation. Core exec and interactive shell environments should agree on these locations.

### Git safety rules

The source checkout must have no staged, unstaged, or untracked changes (ignored files are allowed). The extension fetches `origin` and requires the current branch to match `origin/<current-branch>` exactly. Detached HEAD, missing origin/remote branch, failed fetch, or ahead/behind/divergent history stops the command with a recommendation. Nothing is automatically committed, pushed, pulled, stashed, reset, cleaned, or overwritten.

On the destination:

- Reuse the source repository locally. Remotely, prefer `~/source/<original-repo-name>`; if absent, check known Herdr workspace folders, the source's equivalent absolute path, and the expected worktree path for an existing copy with the same origin. This is not a recursive disk scan. Ambiguous known copies stop rather than guess.
- Otherwise clone the same origin into `~/source/<repo>`, explicitly checking out **`main`**. No fallback to another default branch; clone/authentication errors fail loudly.
- Create missing directories and worktrees under `~/worktrees/<original-repo-name>/<branch>`. Branch slashes become nested directories; invalid names, path escapes, symlink escapes, and unrelated existing directories are rejected.
- Reuse an existing branch's registered worktree, including one elsewhere. Otherwise use an existing local branch, track an origin-only branch, or create a new branch from the source's exact committed HEAD. Never reset an existing branch to the source.
- Dirty primary checkouts or target worktrees stop the command. Existing destination branches must match their origin branch. **Retry exception:** an unchanged, local-only branch created by this extension can be reused without pushing it. Provenance is recorded under the repository's Git common directory in `branchfork-created/`; unpublished commits added afterward still block reuse.

### Workspaces and handoffs

Workspace identity is **destination host + canonical worktree path**, not display name. New workspace names are `<repo>:<branch>`. The extension reuses the project picker's `project-launch.js` helper for Pi, Neovim, and two shell tabs; retries fill only missing layout tabs.

- New agent: a full fork of the current active conversation path, preserving compaction/context edits, selected model, and thinking level. Pi loads destination project instructions/extensions normally. No task prompt is passed, so it waits for your instruction.
- Existing workspace with one Pi agent: generate a concise summary of relevant requirements, decisions, discoveries, progress, and remaining work using the current model, then place it in that agent's private inbox. Summarization consumes a model call but executes no task tools.
- A busy receiver leaves the update queued until fully idle. It appends a context-only message with `triggerTurn: false`: no terminal keystrokes, interruption, follow-up turn, or automatic new work.
- More than one Pi agent: stop and ask. No running Pi agent: launch a fresh full fork in the existing workspace. An existing Pi without this extension's live registration must be reloaded; it is never treated as a safe terminal-input target.
- Repeated handoffs from the same conversation state to the same worktree are deduplicated. A workspace created successfully before a later failure is reused, not duplicated.

Focus is not intentionally moved to the destination. Legacy `herdr-app` unconditionally selects newly created tabs, so the extension preserves/restores the original tab and pane after setup, including failures. There can be a brief visual selection change during creation; strict zero-transient-focus behavior requires upstream Herdr support. A fully populated existing workspace needs no selection commands.

### Private state and recovery

`<Pi agent directory>/branchfork/` contains private live-agent registrations, context snapshots, queued updates, delivery receipts, and per-repository/branch locks. Directories are created with mode `0700`, files with `0600`; none belong in Git. **Full forks transfer conversation contents to the selected host**, including any sensitive information already present in that context. Large payloads travel over stdin, never shell interpolation or command-line transcript arguments. Transport truncation/timeouts fail rather than silently losing context.

Failures show the blocker and a recommended fix in the current session without triggering work. Successfully created clones, branches, worktrees, snapshots, and tabs are retained. Resolve the blocker and rerun; do not delete resources blindly. If a process crashes while holding a lock, inspect its `branchfork/locks/<key>/owner.json` and the destination resources before manually removing the stale lock. Pending inbox updates survive reloads; live registrations are removed on shutdown and stale heartbeats are ignored.

Verification:

```sh
bun run scripts/typecheck-branchfork.ts
bun test ./test/branchfork-git.test.ts pi/tests/branchfork.test.js pi/tests/branchfork-pi.test.js
node --test herdr/mods/source-picker/*.test.mjs
```

Pi compatibility tests and the focused typecheck use the installed Pi package; set `PI_TEST_PACKAGE_DIR` for non-managed installations. End-to-end GUI/SSH behavior also needs a running Herdr GUI and reachable configured hosts; unit/integration tests do not launch or modify your real workspaces.

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
