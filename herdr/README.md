# Herdr configuration

`modules/herdr.ts` links this directory to `~/.config/herdr-app`, using the
current user's home directory. Add `herdr` to the modules in each machine's
`config.yaml` (that file is local and ignored by Git).

Run sysdef's usual `sync --files-only` to install links. If the destination
already exists as a real directory, back it up and move it aside first; sysdef
will not overwrite directories. Install Herdr separately on each machine.

To use another config location, set `HERDR_APP_HOME` to the same absolute path
when running both sysdef and Herdr. Windows symlink creation may require
Developer Mode or elevated permissions; this setup has only been tested on Linux.

## Shared versus local

Git includes settings, keybindings, program overrides, custom themes, cloned
layouts/mods, and personal assets. Herdr's generated files, shipped UI, caches,
socket, window positions, and session/mod state remain local and ignored.
They are still present here on this machine; Herdr creates its generated files
on other machines. Do not copy ignored state between computers.

Clone shipped layouts/mods before customizing them. New clones are not ignored.
When Herdr adds new shipped layouts/mods, add their names to `.gitignore` before
committing. If intentionally customizing a shipped theme, remove its ignore rule.

Use relative asset paths and fonts installed on every target machine. Review
keybindings and program launch commands for OS-specific assumptions, especially
Ctrl versus Cmd shortcuts and executable names. Avoid committing secrets or
machine-specific absolute paths in configuration or mods.
