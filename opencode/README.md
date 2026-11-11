# OpenCode configuration

`modules/opencode.ts` links this directory to `$XDG_CONFIG_HOME/opencode`,
or `~/.config/opencode` when `XDG_CONFIG_HOME` is unset. Enable `opencode` in
each machine's local `config.yaml`, then run sysdef's `sync --files-only`.
Back up and move any existing real destination directory aside first.

Settings, agents, skills, plugins, and custom themes are shared. Dependencies,
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
