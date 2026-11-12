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

## Arcade

Press **Ctrl+Alt+T** to choose Tetris, Minesweeper, Klondike Solitaire, 2048,
or Breakout. **Ctrl+Shift+T** still opens a new tab. The menu supports mouse
selection, j/k or arrow navigation, and 1–5 quick launch. Games save progress
locally when closed; action games reopen paused. See [TTY.md](TTY.md#arcade) for game controls.

## Desktop notifications (Linux)

The `tty` layout routes its existing toast stream through `mods/tty-toast` to
`notify-send`, displayed by AGS instead of an in-app toast. `modules/herdr.ts`
declares Bun and libnotify; install dependencies with a normal `sysdef sync`
(`--files-only` does not install them). Other layouts retain their own toast handler.

Herdr remains responsible for agent events and sounds. Its existing “not looking
at the agent” suppression is preserved; the forwarder also drops `agent.focus`
alerts targeting the currently viewed terminal while the Herdr window is active.
An agent selected in a background window can still notify. General application
errors/login guidance have no agent target and continue to notify normally.
No extra notifications are generated for working/idle transitions, and no extra
sounds are played by the desktop forwarder.

Titles, bodies, severity, icons and timeouts are forwarded. The **Open Herdr**
notification action runs the original Herdr command; on Hyprland it also focuses
the Herdr window. A detached local worker keeps this action alive after the toast
overlay is closed. It does not run commands on remote machines or interpolate
notification content into a shell. The desktop notification daemon must support
actions (AGS does). An expired/dismissed notification executes nothing.

Failures are logged under `$XDG_RUNTIME_DIR/sysdef-herdr-notifications-<uid>/errors.log`
(or the same private directory under the system temp folder when runtime is unset).
Launcher failures appear in Herdr's logs. There is no fallback in-app toast and no
retry loop. Tests: `bun test test/herdr-notifications.test.ts` and
`herdr-app check "$PWD/herdr/mods/tty-toast"`.

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
