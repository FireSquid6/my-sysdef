# Pi configuration

Managed by `modules/pi.ts` (enabled in local `config.yaml`).

| Pi path | Repository source |
| --- | --- |
| `~/.pi/agent/AGENTS.md` | `pi/AGENTS.md` |
| `~/.pi/agent/settings.json` | `pi/settings.json` |
| `~/.pi/agent/subagents.json` | `pi/subagents.json` |
| `~/.pi/agent/agent-tool-description.md` | `pi/agent-tool-description.md` |
| `~/.pi/agent/extensions/` | `pi/extensions/` |
| `~/.pi/agent/themes/` | `pi/themes/` |
| `~/.pi/agent/skills/herdr-orchestration/` | `pi/skills/herdr-orchestration/` |
| `~/.pi/agent/skills/ags/` | `pi/skills/ags/` |

The module honors `PI_CODING_AGENT_DIR` when set.

The selected theme is `tokyonight-night`, using the same Tokyo Night Night
palette as Kitty and Neovim. Its definition lives in `themes/tokyonight-night.json`.

Put user extensions in `extensions/`. Pi discovers them through the symlink;
run `/reload` after adding extensions or editing configuration.

## Branch worktrees and context forks

Run `/reload` after installing this extension on every host that will run Pi:

```text
/branchfork feature/login
/branchfork feature/login minibox-one
/branchfork feature/login minibox-one --headless
```

`extensions/branchfork/index.ts` opens or creates a Git worktree and a persistent **Herdr Core terminal** containing the context fork. By default it also prepares a named four-tab workspace in the destination core's shared layout document. **No running GUI is required on either machine.** Any GUI connected to that core can display the workspace, including remote workspaces on core-only hosts such as `minibox-one`.

Omitting the host means **the machine running Pi**, not the machine displaying Herdr. Explicit hosts are saved names or IDs from the invoking machine's `hc machine ls` list, always treated as remote routes even if hostnames happen to match. `--headless` skips the workspace document, Neovim, and extra shells; it still creates/reuses the worktree and Pi agent.

### Prerequisites and host routing

- Pi 1.5.2-compatible APIs/CLI, Node.js, Git, and Herdr Core's `hc` CLI on participating hosts. Default presentation also requires Core's versioned `doc.get`/`doc.set` API and a GUI compatible with its `herdr-app` shared-document format (verified against installed Core 0.1.20). Headless operation does not use the document API.
- Install/sync this sysdef Pi extension on destination hosts too, and `/reload` existing agents before sending updates. The extension no longer imports the GUI project-picker helper. No credentials or machine settings are copied.
- For an explicit remote destination, the invoking core must have a configured connection to that host. The destination needs its own origin access and Pi model credentials. Local forks on a core-only host do not need a reverse connection to the machine displaying Herdr.
- Default presentation needs Neovim and a configured Herdr shell on the destination. Blank shell terminals use that core's default shell rather than hardcoding Fish. Use `--headless` when only the Pi terminal is wanted.
- GUI discovery and `BRANCHFORK_GUI_HOST` are no longer used. `HERDR_APP_HOME` does not participate in branchfork. `XDG_CONFIG_HOME` and `PI_CODING_AGENT_DIR` are honored by destination processes; core exec and interactive environments should agree on these locations.

### Git safety rules

The source checkout must have no staged, unstaged, or untracked changes (ignored files are allowed). The extension fetches `origin` and requires the current branch to match `origin/<current-branch>` exactly. Detached HEAD, missing origin/remote branch, failed fetch, or ahead/behind/divergent history stops the command with a recommendation. Nothing is automatically committed, pushed, pulled, stashed, reset, cleaned, or overwritten.

On the destination:

- Reuse the source repository locally. Remotely, prefer `~/source/<original-repo-name>`; if absent, check known core-terminal launch/current folders, the source's equivalent absolute path, and the expected worktree path for an existing copy with the same origin. This is not a recursive disk scan. Ambiguous known copies stop rather than guess.
- Otherwise clone the same origin into `~/source/<repo>`, explicitly checking out **`main`**. No fallback to another default branch; clone/authentication errors fail loudly.
- Create missing directories and worktrees under `~/worktrees/<original-repo-name>/<branch>`. Branch slashes become nested directories; invalid names, path escapes, symlink escapes, and unrelated existing directories are rejected.
- Reuse an existing branch's registered worktree, including one elsewhere. Otherwise use an existing local branch, track an origin-only branch, or create a new branch from the source's exact committed HEAD. Never reset an existing branch to the source.
- Dirty primary checkouts or target worktrees stop the command. Existing destination branches must match their origin branch. **Retry exception:** an unchanged, local-only branch created by this extension can be reused without pushing it. Provenance is recorded under the repository's Git common directory in `branchfork-created/`; unpublished commits added afterward still block reuse.

### Workspaces and handoffs

Agent identity is **destination core ID + canonical worktree path + core terminal ID**, independent of any GUI workspace. Inbox registrations record the owning core ID so terminal names such as `t1` cannot collide across isolated Core sessions. Discovery checks live core terminal facts and fresh Pi inbox registrations, including hidden agents and agents inside subdirectories. New Pi terminals have no parent and outlive the source session; the result includes an address usable with `hc attach`. Programs are resolved to absolute destination executable paths before `hc run`, bypassing same-named Core templates and their automatic first messages. A successful launch reports that startup/inbox registration may still be pending; it does not bypass Pi trust/authentication dialogs.

Workspace identity is **destination core + canonical worktree path**, not display name. New workspace names are `<repo>:<branch>`, with `agent`, `editor`, `term1`, and `term2` tabs. Presentation launches only missing companion terminals through core and writes the core's `herdr-app` shared document with compare-and-swap version checks. Existing names, panes, tabs, unknown document fields, and unrelated spaces are preserved. Concurrent document edits are reread and merged, up to five attempts. Core labels let connected GUIs adopt those terminals; presentation does not call GUI creation or selection commands.

- New agent: a full fork of the current active conversation path, preserving compaction/context edits, selected model, and thinking level. Pi loads destination project instructions/extensions normally. No task prompt is passed, so it waits for your instruction.
- Existing destination worktree with one Pi agent (whether visible or hidden): generate a concise summary of relevant requirements, decisions, discoveries, progress, and remaining work using the current model, then place it in that agent's private inbox. Summarization consumes a model call but executes no task tools.
- A busy receiver leaves the update queued until fully idle. It appends a context-only message with `triggerTurn: false`: no terminal keystrokes, interruption, follow-up turn, or automatic new work.
- More than one Pi agent: stop and ask. No running Pi agent: launch a fresh full fork. An existing Pi without this extension's live registration must be inspected/reloaded; it is never treated as a safe terminal-input target. A retained branchfork agent terminal that is still starting or has recovered to a shell also blocks duplicate launches until resolved.
- Repeated handoffs from the same conversation state to the same worktree are deduplicated. Core terminal labels and deterministic names allow retries to reuse partial launches even before the GUI has seen them.

Presentation is optional: a document, editor, or shell failure reports **branchfork succeeded, presentation failed**, with the usable Pi terminal address. The agent/context handoff remains intact. Fix the reported blocker and rerun to complete presentation without launching another Pi; a newly launched Pi must finish registering its inbox first. `--headless` performs no layout reads/writes or companion launches. There are no GUI focus/selection commands; the GUI preserves its own view while consuming the shared document.

### Private state and recovery

`<Pi agent directory>/branchfork/` contains private live-agent registrations, context snapshots, queued updates, delivery receipts, and per-repository/branch locks. Directories are created with mode `0700`, files with `0600`; none belong in Git. **Full forks transfer conversation contents to the selected host**, including any sensitive information already present in that context. Large payloads travel over stdin, never shell interpolation or command-line transcript arguments. Transport truncation/timeouts fail rather than silently losing context.

Failures show the blocker and a recommended fix in the current session without triggering work. Successfully created clones, branches, worktrees, snapshots, terminals, and layout documents are retained. Resolve the blocker and rerun; do not delete resources blindly. If a process crashes while holding a lock, inspect its `branchfork/locks/<key>/owner.json` and the destination resources before manually removing the stale lock. Pending inbox updates survive reloads; live registrations are removed on shutdown and stale heartbeats are ignored.

Verification:

```sh
bun run scripts/typecheck-branchfork.ts
bun test ./test/branchfork-git.test.ts pi/tests/branchfork*.test.*
node --test herdr/mods/source-picker/*.test.mjs
```

Pi compatibility tests and the focused typecheck use the installed Pi package; set `PI_TEST_PACKAGE_DIR` for non-managed installations. The core integration test starts a scratch core with an isolated `HC_SESSION`, socket, HOME, and XDG paths. It verifies real persistent terminal launches, four-tab document creation, retry reuse, and conflict rejection, then stops only that scratch core. Tests do not modify your real workspaces. Physical GUI rendering and cross-machine SSH still need separate acceptance checks.

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

## AGS desktop development skill

Run `/reload`, then `/skill:ags` when building or debugging an AGS bar, popup,
launcher, or other desktop shell component. The skill targets AGS 3 with
TypeScript/TSX, GTK4, Astal, and Gnim, while requiring version checks before work.
It distinguishes AGS v1/v2 examples, GJS runtime APIs versus Bun tooling, reactive
ownership/cleanup, layer-shell focus, styling, named-instance IPC, and verification.

`skills/ags/references/current-api.md` contains the source-verified API notes and
primary-source links pinned to upstream v3.1.2. The observed Arch package
3.1.2-1 reports CLI version 3.1.0; check both rather than assuming they match.
The notes are a researched snapshot, not a replacement for installed CLI help.

Only this individual skill is linked; AGS application configuration and startup
are not changed. Install the AGS CLI and required native libraries separately.
Adding the skill does not migrate Waybar or the Python monitor menu to AGS, launch
a desktop shell, or install packages.

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
