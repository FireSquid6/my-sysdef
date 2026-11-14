# OpenCode configuration

Home Manager's `personal.agents.opencode.enable` links tracked settings, agents,
skills and plugins under `~/.config/opencode`, leaving the root local. Configure
home-relative `personal.paths.opencode` for another location and launch OpenCode
with the corresponding XDG/application override; evaluation does not read ambient
XDG variables. Follow the [migration guide](../docs/nix-migration.md), including
explicit detachment of a legacy whole-root link while OpenCode is stopped.
The historical `modules/opencode.ts` writer is retired.

Tracked settings, agents, skills and plugins are shared. Dependencies,
generated package manifests/locks, credentials, and `service.json` stay local
and ignored. Install OpenCode separately; it manages its plugin dependencies.
Existing local files were preserved during migration.

The top session tab strip is disabled with `tabs.mode: "off"` in `cli.json`.
Valid edits to that file reload in the running TUI. `tui.json` is preserved as
legacy configuration; current terminal settings live in `cli.json`.

Review extensions for OS-specific dependencies on each machine: `notify.ts`
uses Linux's `notify-send`; `fleet-agent.js` requires `fleet` for fleet integration.
Windows symlinks may require Developer Mode or elevation. Only Linux has been
tested. Do not put secrets or machine-specific paths in tracked configuration.
