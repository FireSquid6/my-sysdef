# Pi configuration

Managed by `modules/pi.ts` (enabled in local `config.yaml`).

| Pi path | Repository source |
| --- | --- |
| `~/.pi/agent/settings.json` | `pi/settings.json` |
| `~/.pi/agent/extensions/` | `pi/extensions/` |
| `~/.pi/agent/themes/` | `pi/themes/` |

The module honors `PI_CODING_AGENT_DIR` when set.

The selected theme is `tokyonight-night`, using the same Tokyo Night Night
palette as Kitty and Neovim. Its definition lives in `themes/tokyonight-night.json`.

Put user extensions in `extensions/`. Pi discovers them through the symlink;
run `/reload` after adding extensions or editing configuration.

Credentials (`auth.json`), sessions, model cache (`models-store.json`), and the
Pi installation remain in `~/.pi/agent`, outside this repository. Do not put
API keys or other secrets in tracked settings or extensions.
