# Shared Hermes persona and skills

`modules/hermes.ts` manages:

- `SOUL.md`, including guidance on finding and editing this sysdef repository.
- All 27 installed Matt Pocock / AI Hero skills, with their reference files and MIT license, under `skills/aihero/`.
- Impeccable, including its references, scripts, and data, under `skills/creative/impeccable/`.

These are snapshots imported from the existing Hermes installation. The module links each AI Hero skill individually, plus Impeccable; it never replaces the skills root or copies hub/updater/curator metadata. Review upstream updates before replacing the vendored sources. Updating a linked skill through Hermes may modify repository files—review Git diffs afterward.

## Enable on another machine

1. Install Hermes separately.
2. Back up and move aside existing `SOUL.md`, `skills/aihero/AIHERO-LICENSE.txt`, the individual AI Hero skill directories being adopted, and `skills/creative/impeccable`. Sysdef replaces existing files without backup and refuses real directory collisions. Preserve unrelated skills and metadata.
3. Add `hermes` to the modules list in that machine's local sysdef `config.yaml`.
4. Run `sysdef sync --files-only --dry-run`, then `sysdef sync --files-only`.

The destination is `$HERMES_HOME` when set, otherwise `~/.hermes`. Named profiles require an explicit home; automatic profile discovery is not supported.

Persona, skills, and the Tokyo Night Night skin (`skins/tokyonight-night.yaml`) are managed. The skin uses the same palette as Kitty, Neovim, and Pi. After syncing on another machine, activate it with `hermes config set display.skin tokyonight-night`; skin selection stays local. `config.yaml`, `.env`, credentials, memories, sessions, databases, logs, caches, cron jobs, and service state stay local. No installation, updater, or service restart runs during sync.

## Editing and rollback

Edit the sources under `hermes/` to share changes. Links point directly at this checkout, wherever it resides. The conventional location is `~/sysdef`; this machine currently uses `~/my-sysdef`.

To roll back, disable the module, remove only its managed symlinks, and restore the backed-up files/directories. Disabling the module alone does not undo links. Local migration backups are kept outside this repository under `~/.hermes/sysdef-backups/`.
