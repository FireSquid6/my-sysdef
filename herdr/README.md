# Herdr configuration

Home Manager's `personal.herdr.enable` manages selected settings, keys, layouts,
themes and custom mods under `~/.config/herdr-app`, plus Bun/libnotify helpers.
It deliberately does **not** link the whole runtime root. Install Herdr separately.

Follow the [migration guide](../docs/nix-migration.md) before the first switch.
Existing legacy whole-root links need explicit guarded detachment **with Herdr
stopped, from an independent terminal**; local runtime state is preserved and
tracked checkout files are not moved. Unknown directory symlinks fail closed.

For another location, configure home-relative `personal.paths.herdr`; HM exports
matching `HERDR_APP_HOME`. The historical `modules/herdr.ts` writer is retired.
This flake targets Linux, not Windows.

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
