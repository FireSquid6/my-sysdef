# Hyprland workspaces and monitors

The active config is `hyprland.lua` (Hyprland 0.57+). `hyprland.conf` is the legacy config, not the active source.

The [NixOS desktop output](../../docs/nixos-desktop.md) supplies compatible
Hyprland/AGS runtimes and explicitly selects `hyprland.lua` in its login session.
The following native-runtime caveat applies only to **standalone Home Manager**.

Home Manager's workstation profile links this directory. The pinned Nixpkgs
Hyprland is too old, so the compositor, matching portal/ecosystem, and PAM locker
remain native; see the [migration guide](../../docs/nix-migration.md). The Lua
config uses HM's `SYSTEM_CONFIG_DIR`/`SCRIPTS_DIR` environment and includes the
Nix profile on PATH. Legacy `hyprland.conf` retains historical paths and is not
activated by this migration.

## Workspaces

| Key | Icon | Mode | Login application |
| --- | --- | --- | --- |
| S | Terminal | Tiling | Herdr (`herdr-app`) |
| G | Mail | Tiling | Proton Mail (`proton-mail`) |
| R | Robot | Tiling | Hermes Desktop (`hermes desktop`) |
| N | Notebook | Tiling | Obsidian |
| 1–9 | Window | Floating initially | None |

Trayscale and Proton Mail Bridge are not launched at login. Hermes Desktop has an app-ID window rule that opens it silently on R, including when its launcher spawns the window indirectly.

- Super + workspace key: switch.
- Super + Shift + workspace key: move the focused window and follow.
- Super + Ctrl + workspace key: move the focused window without following.
- Super + Shift + Q still closes a window. N replaces the old Q workspace; numeric 7 and 8 are independent again.
- Super + T toggles a **numeric workspace** between floating and tiling, including future windows. S/G/R/N remain tiling-only.
- Native floating windows/popups, floating-rule windows, pinned windows, and explicitly floated windows are not forced into tiling.
- Super + Shift + F explicitly floats and centers a window. On a workspace-default floating window it marks an exemption; on an already explicitly floating window it toggles back to tiling.
- Returning a workspace to floating restores saved positions/sizes, clamped to its current monitor. Windows opened while tiled get a centered size.
- Workspace modes and window geometry survive controller/config reloads in the same login session, but numeric modes reset to floating on the next login.
- Existing scratchpad/music workspaces, grouping, media keys, screenshots, and machine border rules remain.

## Monitor menu (Super + M)

The AGS GTK4 layer-shell popup opens on the focused monitor. Press Super + M again or Escape to close it.

- **Primary**: Up/Down selects; Enter applies. Monitor rows are also clickable.
- **Workspaces**: Up/Down selects; Left/Right cycles Automatic and connected monitors. Mouse buttons provide the same actions.
- Tab switches pages. Changes apply and save immediately; closing is not cancellation.
- Automatic clears the saved override. Disconnected assignments remain saved, with primary as the temporary fallback.

On `deisslaptop`, the default primary is eDP-1; other hosts prefer DP-1. If unavailable, use the other conventional output or the first connected output. S/G/R/N follow primary unless explicitly assigned elsewhere. Numeric workspaces are split evenly across other monitors, or use primary if it is the only output.

Changing primary moves the automatic letter workspaces but leaves existing numeric locations intact. Super + Ctrl + arrow monitor moves are temporary: the manager does not fight them or save them as preferences. The menu changes the saved assignment. Unplugged destinations fall back temporarily and restore on reconnect.

## Startup and bar

The Lua config starts one Bun controller per Hyprland instance. At login, `workspace-session.sh` waits for it, then launches applications **once** and focuses S/Herdr. Closing an application does not relaunch it; reloading the config does not rerun application startup.

The dedicated `ags` module links the shared Tokyo Night AGS shell. Each output shows its current workspaces, including empty ones, ordered S/G/R/N/1–9. Every button includes the key, application/window icon, and **▦ tiling / ◇ floating** indicator. Click to switch. The controller publishes one cached, atomic `desktop.json`; AGS watches it rather than spawning Bun for each button. Monitor additions/removals create/destroy bar windows. Launcher, project picker, power menu, window switcher, monitor settings, notifications and tray also run in AGS. See [`ags/README.md`](../../ags/README.md) for shortcuts, dependencies, control commands and verification limits.

## Login screen

SDDM uses a Qt6 Astronaut theme configured with the same Tokyo Night palette, flat background and centered login form. Sources and deployment instructions live in [`dotfiles/sddm/`](../sddm/README.md); `modules/desktop.ts` declares dependencies. System-wide deployment is an explicit sudo step, not a home-directory symlink or display-manager restart.

## Locking and idle

`modules/desktop.ts` installs stable Arch `hyprlock` and `hypridle` packages, not
Git snapshots. Verified against upstream releases: hyprlock **0.9.7** and hypridle
**0.1.8**. Keep them updated through normal full-system Arch upgrades (`pacman -Syu`),
not partial repository refreshes.

- **Super + P → Lock** (or bar power button → Lock): lock immediately. Type your normal account password to unlock. There is no dedicated lock keybind. **Log out** is in the same menu and requires a second selection to confirm.
- **5 minutes idle:** lock; **8 minutes 20 seconds:** turn displays off.
- Activity wakes displays; it does not bypass password authentication.
- Before suspend, hypridle requests locking and holds a sleep-delay inhibitor until
  the Wayland session is locked. Waking turns displays back on.
- No automatic suspend timer is configured. Browser/media, Wayland and systemd
  idle inhibitors remain respected.

`hyprlock.conf` uses opaque Tokyo Night backgrounds, clock/date and password entry
on every output, with PAM's packaged `/etc/pam.d/hyprlock` service. No screenshots,
grace period, authentication changes or credentials are stored. `hyprlock.sh` uses
a per-user runtime `flock` to serialize requests, held until the locker exits.
Authentication uses the distribution's normal PAM policy (including failed-login
limits); no automatic unlock command is configured.

`hypr-startup.sh` starts hypridle once for this compositor session. Do not also
enable `hypridle.service`, which would create a second startup route. Configs are
already linked through the managed `~/.config/hypr` directory. After changing
`hypridle.conf`, restart hypridle; changing `hyprlock.conf` applies on the next lock.
Legacy swaylock settings remain available, but this Hyprland session no longer
uses swaylock. The lock screen itself must be tested interactively when ready;
non-interactive checks do not authenticate, lock, suspend, or turn displays off.

Sources: [hyprlock configuration](https://github.com/hyprwm/hyprland-wiki/blob/main/content/hypr-ecosystem/user/hyprlock.md),
[hypridle configuration](https://github.com/hyprwm/hyprland-wiki/blob/main/content/hypr-ecosystem/user/hypridle.md).

## Sources, state, and dependencies

- `scripts/workspace-model.ts`: allocation, validation, geometry, and safe Lua encoding.
- `scripts/workspace-manager.ts`: serialized local command service, Hyprland event handling, session modes, preferences, and bar data.
- `ags/`: GTK4/TSX bar, menus, tray and notification daemon; policy stays in the TypeScript controller.
- Persistent per-host preferences: `$XDG_STATE_HOME/sysdef/monitors/<hostname>.json` (default `~/.local/state/sysdef/monitors/`).
- Session data/socket/desktop snapshot: run `bun scripts/workspace-manager.ts runtime` to locate the private directory under `$XDG_RUNTIME_DIR`.
- Controller log: `$XDG_RUNTIME_DIR/sysdef-workspace-manager.log`.
- No preferences, monitor choices, app credentials, or session state belong in Git.

`modules/ags.ts` owns AGS/native dependencies and its config symlink; enable `ags` and the `aur` provider in local config. `modules/desktop.ts` retains compositor, idle, wallpaper and other non-shell dependencies. The Python popup and Waybar/Fuzzel/Rofi/Dunst shell dependencies are retired. Install Herdr, Hermes Desktop, Proton Mail, and Obsidian separately. A missing required S/R/G launcher is reported and aborts app startup rather than silently skipping it; a missing legacy Notes application is reported visibly.

Useful checks:

```sh
bun test test/workspaces.test.ts test/ags.test.ts test/ags-menus.test.ts test/ags-notifications.test.ts
bash ags/check.sh
bash -n scripts/workspace-session.sh ags/*.sh
Hyprland --verify-config -c "$PWD/dotfiles/hypr/hyprland.lua"
hyprctl configerrors
bun scripts/workspace-manager.ts status
```

Physical multi-monitor hotplug should also be checked on a docked/desktop setup; the unit tests exercise allocation, saved overrides, disconnected fallback/restore, and temporary moves without needing extra outputs.
