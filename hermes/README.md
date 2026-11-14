# Shared Hermes persona and skills

Home Manager's `personal.agents.hermes.enable` in `nix/modules/files.nix` manages:

- `SOUL.md`, including guidance on finding and editing this sysdef repository.
- All 27 installed Matt Pocock / AI Hero skills, with their reference files and MIT license, under `skills/aihero/`.
- Impeccable, including its references, scripts, and data, under `skills/creative/impeccable/`.

These are snapshots imported from the existing Hermes installation. The module links each AI Hero skill individually, plus Impeccable; it never replaces the skills root or copies hub/updater/curator metadata. Review upstream updates before replacing the vendored sources. Updating a linked skill through Hermes may modify repository files—review Git diffs afterward.

## Enable on another machine

1. Install Hermes separately.
2. Enable `personal.agents.hermes.enable` in the selected host/profile.
3. Follow the [migration guide](../docs/nix-migration.md): review the adoption
   preview, explicitly back up conflicts, build, and switch. No forced overwrites.
   Preserve unrelated skills and metadata.

The destination defaults to `~/.hermes`. Configure home-relative
`personal.paths.hermes` for another location; HM exports matching `HERMES_HOME`.
Named profiles require an explicit home; automatic profile discovery is not supported.

Persona, skills, the Tokyo Night Night skin (`skins/tokyonight-night.yaml`),
`config.yaml`, and desktop `translucency.json` are managed. The skin uses the same
palette as Kitty, Neovim, and Pi. Skin selection in `config.yaml` is shared too;
use `hermes config set display.skin tokyonight-night` to select it.
`.env`, credentials, memories, sessions, databases, logs, caches, cron jobs, and
service state stay local. Never put secrets in the shared config. Messaging IDs,
model/provider selections, and enabled-plugin settings in it are shared.
No installation, updater, or service restart runs during sync.

The Linux desktop link is `~/.config/Hermes/translucency.json`. On macOS, link
`~/Library/Application Support/Hermes/translucency.json` to the same repository
file; on Windows the destination is `%APPDATA%\\Hermes\\translucency.json`.
Only settings are portable; translucency support depends on the platform.
Home Manager currently declares the Linux destination, not those other paths.
The main config links from `$HERMES_HOME/config.yaml` (default `~/.hermes/config.yaml`).

## Editing and rollback

Edit the sources under `hermes/` to share changes. Writable links point to the
explicit `personal.checkout` (currently `~/my-sysdef`). HM removes links when a
new generation disables the option; restore unmanaged originals from the
adoption backup if needed. Read the migration guide's recovery section before
restoring files. A generation rollback does not undo source edits.
Historical Hermes migration backups also remain under `~/.hermes/sysdef-backups/`.
