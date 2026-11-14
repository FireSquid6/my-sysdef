# Claude Code configuration

Home Manager's `personal.agents.claude.enable` links settings, agents, skills,
and output styles into `~/.claude`. For an override, configure home-relative
`personal.paths.claude`; Home Manager exports matching `CLAUDE_CONFIG_DIR`.
Follow the [migration guide](../docs/nix-migration.md) to preview/adopt conflicts
and switch explicitly. The historical `modules/claude.ts` writer is retired.

Only these configuration entries are linked, not the whole Claude directory.
Credentials, history, sessions, caches, installed plugins, and `~/.claude.json`
stay local. Install Claude Code separately.

The notification hook requires Linux's `notify-send` and `jq`. Fleet extensions
require `fleet`. Review these dependencies on other machines, and never put
secrets in shared settings or extensions.
