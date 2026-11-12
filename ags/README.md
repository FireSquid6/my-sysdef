# Sysdef AGS desktop shell

AGS 3 + GJS + GTK4 + Astal + Gnim, written in TypeScript/TSX. The shared Tokyo
Night Night palette is unchanged: background `#1a1b26`, foreground `#c0caf5`,
purple `#bb9af7`, green `#9ece6a`, red `#f7768e`, and cyan `#7dcfff`.

## Managed installation

Enable **`ags`** alongside **`desktop`** in local `config.yaml`, and enable the
`aur` provider alongside `arch-official`. `modules/ags.ts` declares the AGS and
native/tool dependencies. The AGS package supplies matching Astal dependencies.

```yaml
providers:
  - arch-official
  - aur
modules:
  - desktop
  - ags
  # Keep your other modules.
```

The module links this **individual directory** to `$XDG_CONFIG_HOME/ags` (default
`~/.config/ags`). Check for destination conflicts and back up personal files
before syncing. No credentials or monitor preferences are copied. Enabling a
module does not itself start the application. Project launch preserves the
existing Alacritty/tmux `scripts/proj.sh` workflow.

The observed Arch package is `aylurs-gtk-shell 3.1.2-1`, whose CLI reports 3.1.0.
Use installed command help and the API notes in `pi/skills/ags/references/` rather
than AGS v1/v2 examples. GJS executes the shell; Bun executes the separate
workspace controller and development tools, not GTK widgets.

## Desktop surfaces

| Shortcut / control | AGS replacement |
| --- | --- |
| Super+X | Native desktop application launcher; search names/descriptions |
| Super+O | Search actual directories under `~/source`, launch the existing project helper |
| Super+P / power button | Toggle the system sidebar: power/session, system resources, then Tailscale and all tailnet devices |
| Super+M / settings button | Primary output and per-workspace monitor assignments, including Automatic |
| Alt+Tab / bar window title | Search open Hyprland windows and focus the exact validated address |
| Clock | Native GTK calendar |
| Network status | Activate saved NetworkManager connections by UUID; open connection editor for new networks |
| Audio status | Open pavucontrol; scroll adjusts volume; right-click toggles mute |
| Super+B / bell | Notification history, dismiss/actions, Do Not Disturb, clear history |
| Tray icons | StatusNotifier activation, middle click, and right-click DBusMenu |

Search menus support arrows, Enter and Escape, mouse selection, and automatic
search focus. In the monitor menu, Tab switches Primary/Workspaces; left/right
cycles a workspace's saved assignment. Changes save immediately through the
existing controller. Escape releases exclusive keyboard focus. A repeated menu
shortcut toggles it closed; only one keyboard-grabbing menu is visible at once.

Each output has one top bar. Workspaces show their actual monitor location,
including empty ones, ordered S/G/R/N/1–9, with the original icons and **▦ tiling /
◇ floating** indicators. Clock/title/network text is compacted on narrower
outputs. Status items have transparent backgrounds and simple vertical dividers;
only clickable items highlight on hover. Audio, battery, notifications and each
workspace tab use fixed pixel widths with ellipsized labels, so changing contents
does not shift their boundaries. The Arch logo is removed. Native tray icons and bounded ARGB pixmaps are supported. DBusMenu
submenus are presented as indented rows rather than cascading windows.

Notifications implement `org.freedesktop.Notifications`, including replacement,
expiry, actions, close signals and critical urgency. History is bounded to 100
in-memory items; popups show at most three on the primary output. Text is rendered
as plain text, never arbitrary application markup. Do Not Disturb suppresses
popups but retains history. AGS owns the notification and StatusNotifierWatcher
names without stealing them from another daemon; conflicts are visibly reported.

This replaces Waybar, Fuzzel, Rofi window switching, Dunst, the custom menu runner,
and the Python monitor popup in the Hyprland session. Application-internal menus
(such as Herdr's picker), screen locking, and optional legacy i3 configuration are
not rewritten. `scripts/open-menu.sh` remains a compatibility shim into AGS.

## System sidebar

Super+P toggles the left-hand sidebar on the focused output. It fills the usable
vertical space with the same 20px outer gaps, 2px border and 10px corner radius as
normal Hyprland windows. The GTK window accepts compositor resizing so its body
keeps the full anchored height as content loads; it is not a fixed-size popup.
Sections appear in this order:

1. **Power & session:** Suspend, Logout, Reboot, Shutdown. Destructive actions
   require a second explicit selection; holding Enter or Space cannot confirm.
2. **System resources:** CPU utilization (delta sampled), RAM used/total, load
   averages and root filesystem usage. CPU shows “sampling” until its second sample.
3. **Tailscale:** connection/login/daemon status, health warnings, this device and
   **all** peers returned by the daemon, including offline devices. Rows show
   hostname, OS, online state, IPs and direct/relay/idle status. Expand a row for
   last-seen and transfer information. No login URLs, keys or raw status are saved.

`j`/`k` or Up/Down navigate rows; `gg`/`G` or Home/End reach the first/last row;
`h`/`l` collapse/expand device details; Tab/Shift+Tab traverse controls;
Enter/Space activates a power choice; on a peer device it copies its Tailscale IP
(prefer IPv4, fall back to IPv6) and toggles details, with a visible copied marker.
Self rows only toggle details. Devices without an IP report that nothing can be
copied. The native Wayland clipboard is used, with no external clipboard command.
`h`/`l` change details without touching the clipboard. `q` or Escape closes and
releases keyboard focus. Vim letter keys do not intercept Ctrl/Alt/Super
shortcuts. Focused rows scroll into view. Tailscale is read-only
here: there are no automatic connect/disconnect, SSH or network-changing actions.
Resource/status polling runs only while open, without overlapping requests;
Tailscale commands have a four-second timeout. Closing cancels resource reads and
discards stale asynchronous results. `modules/ags.ts` declares the Tailscale CLI.

## Startup, control and logs

Hyprland starts `start.sh` at login and on config reload. A startup lock plus
native instance discovery prevents duplicate shells. The launcher waits for the
workspace controller and forces the Wayland backend (no accidental XWayland
fallback). Config verification is guarded against launching desktop services.
It does not rerun login applications or alter workspace modes/preferences.

```sh
bash ~/.config/ags/start.sh
bash ~/.config/ags/control.sh launcher
bash ~/.config/ags/control.sh monitors
bash ~/.config/ags/control.sh sidebar
bash ~/.config/ags/control.sh notifications
ags request -i sysdef status
ags request -i sysdef close
ags request -i sysdef reload-css
ags quit -i sysdef
```

The instance is `sysdef`; `SYSDEF_AGS_INSTANCE` selects a disposable instance.
`SYSDEF_AGS_SERVICES=0` disables desktop-wide notification/tray ownership for UI
experiments. `SYSDEF_ROOT_DIR` is derived from the symlink's actual target by the
launcher; direct `ags run` defaults to `~/sysdef` unless that variable is set.

Logs are `$XDG_RUNTIME_DIR/sysdef-ags.log` and `sysdef-ags-start.log`. Sources and
CSS live here; CSS is watched and reapplied without restarting the application.
After changing TypeScript, quit only the intended instance and rerun `start.sh`.
Stop any previous bar/notification daemon before the first migration launch; do
not leave Waybar or Dunst in another autostart entry. No packages are uninstalled
by the migration itself.

The Bun workspace controller publishes one private, atomic `desktop.json` under
its per-login runtime directory. AGS watches that directory and reads changes;
there is no Bun process per bar widget or polling interval. User actions call the
serialized controller. `bun scripts/workspace-manager.ts runtime` locates it.
The existing per-host monitor preferences remain under
`$XDG_STATE_HOME/sysdef/monitors/<hostname>.json`; mode/session/geometry state stays
in the controller runtime. Neither belongs in Git.

## Checks

```sh
bash ags/types.sh                       # Generates ignored @girs and package links
bun ags/tools/typecheck.ts              # Checks this project's sources
bun ags/tools/typecheck.ts --upstream   # Also print installed-library diagnostics
ags bundle ags/app.tsx /tmp/sysdef-ags-check --gtk 4
bun test
bash ags/check.sh                       # Actual GTK widgets + private D-Bus/resource tests
bash ags/check.sh layout                # Opt-in: briefly displays a read-only panel, validates full height through refresh
bash -n ags/*.sh scripts/hypr-startup.sh scripts/open-menu.sh scripts/proj.sh
Hyprland --verify-config -c "$PWD/dotfiles/hypr/hyprland.lua"
hyprctl configerrors
```

`ags/types.sh` does **not** use `--update`, which would overwrite tracked tsconfig.
`@girs/` and package links are development artifacts ignored by Git. The GJS
project is checked separately from the Bun repo; Node/Bun globals are not injected
into its TypeScript environment. On non-Arch installations set `AGS_PACKAGE_DIR`
when generating package links if the installed package is elsewhere.

**Typechecking limitation:** installed AGS/Gnim ship `.ts` sources with optional
GI imports and generated-GI overload errors, which `skipLibCheck` cannot hide.
The checker reports their diagnostic count separately and fails on any project
or unknown external errors. A completely unfiltered `tsc -p ags/tsconfig.json`
is currently **not clean**; this is not described as a full compiler pass.

The GTK smoke test constructs real widgets, emits their real key-controller
signals, measures fixed bar widths across content changes, checks sidebar
navigation/details/offline peers, and mocks every desktop action. It never maps a keyboard-exclusive test
popup or executes power/monitor commands. Service tests use a private D-Bus,
without initializing a GTK application or sharing accessibility/GVFS resources.
They exercise actual notification wire signatures and tray registration, pixmap
conversion and activation. Neither test stops the user's shell. Physical
multi-monitor hotplug and differing DPI still need real-hardware verification.
