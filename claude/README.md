# Claude Code configuration

`modules/claude.ts` links settings, agents, skills, and output styles into
`$CLAUDE_CONFIG_DIR`, or `~/.claude` when unset. Enable `claude` in each
machine's local `config.yaml`, then run sysdef's `sync --files-only`.
Back up and move existing destination directories aside before syncing.

Only these configuration entries are linked, not the whole Claude directory.
Credentials, history, sessions, caches, installed plugins, and `~/.claude.json`
stay local. Install Claude Code separately.

The notification hook requires Linux's `notify-send` and `jq`. Fleet extensions
require `fleet`. Review these dependencies on other machines, and never put
secrets in shared settings or extensions.
