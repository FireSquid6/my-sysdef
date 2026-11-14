# Sysdef AGS desktop shell

AGS 3 + GJS + GTK4 + Astal + Gnim, written in TypeScript/TSX. The shared Tokyo
Night Night palette is unchanged: background `#1a1b26`, foreground `#c0caf5`,
purple `#bb9af7`, green `#9ece6a`, red `#f7768e`, and cyan `#7dcfff`.

## Managed installation

The [fresh-install NixOS desktop](../docs/nixos-desktop.md) supplies the pinned
upstream AGS 3 flake and matching runtime. The stable-package/runtime caveat below
applies only to the **standalone Home Manager** outputs.

The repository now uses Nix + standalone Home Manager; see
[the migration guide](../docs/nix-migration.md). Workstation profiles enable
`personal.modules.ags.enable` alongside `personal.modules.desktop.enable`.
The pinned Nixpkgs AGS is **2.3.0**, incompatible with this AGS 3/Gnim code, so the
module installs helper tools only and requires a compatible **native AGS 3 +
GJS/GTK4/Astal/Gnim** runtime. Do not replace it with the pinned `pkgs.ags`.
Native services, portal/PAM and the compositor remain host-owned.

Home Manager links this **individual directory** to `~/.config/ags`. Check the
adoption preview and back up personal files before the first switch. No credentials or monitor preferences are copied. Enabling a
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
| Caffeine (in Power & session) / coffee cup on bar | Toggle idle and lid-close inhibition; stays on with the lid closed |
| Wallpaper (in Power & session) | Switch between animated landscape and Hyprpaper; remembers the selection |

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

### Wallpaper

Open **Super+P → Power & session → Wallpaper** to switch renderers. The default
is **Animated landscape**: a Tokyo Night pixel-art scene with broad, nearby mountain
ridges on a lower horizon, more open sky, dense layered woodland, fields, a winding
river, a mill and a small campsite. Woodland leaves clearings for the river, mill,
tent and crop field. After sunset the campsite's stone-ringed fire lights up, casts
warm light, and emits wind-drifting smoke and embers; it fades before sunrise.
All colors are blended from the Tokyo Night palette, including daytime lighting.

The selection is saved in `$XDG_STATE_HOME/sysdef/wallpaper` (normally
`~/.local/state/sysdef/wallpaper`). **Hyprpaper** uses the existing
`~/.config/hypr/hyprpaper.conf` unchanged. AGS owns renderer handoff; don't also
start Hyprpaper separately. It can adopt legacy Hyprpaper processes from this exact
Hyprland/Wayland session, but never kills another session's wallpaper. Hyprpaper
0.8's `listactive` IPC must be enabled for readiness checks. Failures are shown
in the sidebar; failed startup or an unexpected exit restores animation.

Every output gets an independent background-layer window; hotplug cleanup removes
its window and frame callback. Backgrounds do not reserve screen space or accept
input. A separate **`sysdef-wallpaper` GTK process** renders the scene at native
pixel-art resolution, then uses a nearest-neighbor GPU texture node (not a
full-output Cairo bitmap) for scaling. GTK's presentation
clock targets **30 FPS**, rather than an idle-priority timer that shell work can
starve. River highlights and waterfall shimmer blend continuously between phases.

The main shell publishes small read-only scene snapshots over a private pipe.
Scene generation and its GC no longer run in the sidebar/bar/shell IPC GTK loop. The child
never fetches weather or writes farm/preferences; EOF shuts it down with its
parent. Unexpected exits are supervised with bounded restart backoff. Hyprpaper
mode stops desktop drawing; `SYSDEF_AGS_SERVICES=0` instances never spawn a renderer
or change wallpapers/preferences. `ags request -i sysdef status` exposes renderer
health; `ags request -i sysdef-wallpaper status` reports received snapshots/frames
and mean/worst scene-to-texture paint times in milliseconds. Frame counts can pause
when desktop surfaces are occluded; the lock-image timer continues separately.

#### Lockscreen landscape

When animated wallpaper is enabled, Hyprlock uses an opaque image of the same
scene, with the same weather, manual settings, crops and CPU-driven water motion.
**Hyprlock 0.9.7 supports one-second image reloads, not desktop-rate video.** The
lock background therefore updates at **1 FPS**, independently of the 30 FPS desktop.
No high-rate signals, screenshot capture, desktop transparency or authentication
replacement are used. Hyprlock/PAM, zero grace, serialized lock requests and the
opaque first frame are unchanged.

The wallpaper process generates RGB PNGs offscreen once a second and atomically
publishes them under `$XDG_RUNTIME_DIR/sysdef-wallpaper-sysdef/frame.png` (the
suffix follows `SYSDEF_AGS_INSTANCE`). This timer continues when the compositor
stops frame callbacks on ordinary desktop surfaces during locking. Hyprlock's
`hyprlock-background.sh` only selects a ready path; it never waits for rendering.
A solid opaque base stays below the image layer. Disabled/missing/stale feeds
fall back to the original Tokyo Night solid background; the last valid opaque
image remains safe if image reloading itself fails. Runtime images are private,
contain only the generated scene, and are not persisted in the repository.

Run `bash ags/check.sh renderer` to check process isolation, pipe/EOF lifetime,
valid opaque PNG refresh while desktop windows are hidden, disabled mode, and
preference isolation. It does **not** lock your session or show any windows. Real
lock/unlock and multi-output behavior still need a manual desktop check.

#### Manual landscape controls

Open **Super+P**, scroll to the bottom, and find **Landscape controls**. Turn off
**Sync with real life** to capture the current scene and enable the sliders:

- Time of day, season and weather (clear/cloudy/fog/rain/snow/storm).
- Moon phase, cloud cover, precipitation, wind and temperature.
- Crop growth, harvest progress, and river/mill activity (idle to fast).

Season chooses peas, wheat, pumpkins or winter fallow. Increasing harvest forces
crops to be mature; reducing growth resets the harvest preview. Weather selection
sets sensible cloud/rain defaults, which can then be adjusted independently.
Manual mode fixes the displayed time/conditions but still animates water, smoke,
clouds and weather. It does **not** edit `crops.json`: the real farm continues its
calendar cycle separately. Turn sync back on to restore the real clock, weather,
moon, saved farm and CPU-driven water speed.

The toggle and manual values persist in
`$XDG_STATE_HOME/sysdef/landscape-controls.json` (normally
`~/.local/state/sysdef/landscape-controls.json`). Writes are private, atomic and
debounced while dragging; shutdown flushes pending changes. Damaged/unknown-version
files are preserved and reported in this section. Test instances with
`SYSDEF_AGS_SERVICES=0` can preview controls in memory without touching preferences.

Use **Tab / Shift+Tab** between controls; native **arrow keys** adjust a focused
slider. Home/End adjust its bounds rather than navigating to power actions.
**Escape** closes the panel from any control. From the session/device rows,
**End** jumps to the last enabled landscape control and scrolls it into view.

#### Weather, seasons and moon

One app-owned service requests the wttr-compatible endpoint
**`https://minibox-one.trex-city.ts.net:10443/<location>?format=j1`** on startup
and approximately every 30 minutes (shared across outputs, not per frame).
Every request includes an explicit, URL-encoded location; the proxy's public IP
is never used to choose the city. Requests do not fall back to public wttr.in.

Location precedence:

1. `SYSDEF_WEATHER_LOCATION` environment override.
2. The manually configured city in `$XDG_STATE_HOME/sysdef/weather-location`
   (normally `~/.local/state/sysdef/weather-location`), for example `Waco,Texas`.
3. **Austin** if no valid location is known or the file cannot be read.

Determine the user's city independently before configuring that file; there is
no automatic location lookup on each launch or refresh. A one-time public-IP
lookup is only approximate, so correct the city manually if needed. The local
location preference stays outside the repository. Changes take effect on the next
refresh or shell restart. `curl` is included in the AGS dependencies; TLS certificate
verification remains enabled. Requests are HTTPS-only, bounded to 15 seconds and
256 KiB, cancellable on exit, and disabled in `SYSDEF_AGS_SERVICES=0` test instances.

- **Seasons:** local calendar plus returned latitude selects the hemisphere;
  spring greens/flowers, summer greenery, autumn gold/pink foliage, and winter
  bare deciduous trees and snow cover when cold. Snowy weather also coats terrain.
- **Weather:** cloud cover changes sky brightness and sun/star/aurora visibility;
  fog drifts through the valley; rain, snow and storms add moving precipitation.
  Wind controls cloud drift, falling particles and campsite smoke. CPU-controlled
  river/wheel speed and calendar-driven crops remain independent of weather.
- **Astronomy:** reported sunrise/sunset drive lighting and the campfire. The moon
  renders its actual waxing/waning terminator using reported phase and illuminated
  area, rather than always drawing a full disk.

Failures retain the last good observation in memory, but weather older than six
hours falls back to a fair-weather scene. Offline startup uses seasonal/local-clock
sunrise estimates, an approximate lunar cycle and 45° north until latitude is known.
These are estimates, not live weather. Weather responses stay in memory; only the
manually chosen location is stored locally. `ags request -i sysdef status` includes
the selected location, weather source, error and environment. The `wttr.in` source
label identifies the compatible feed format, including the private endpoint.

Checks and previews (no live shell restart):

```sh
bun test test/wallpaper.test.ts test/wallpaper-resources.test.ts test/wallpaper-weather.test.ts test/wallpaper-crops.test.ts
bash ags/check.sh crops   # isolated real save files: restart, catch-up, corruption and write failures
bash ags/check.sh controls # manual preferences, restart, sync restoration and farm isolation
bash ags/check.sh renderer # isolated process, hidden-window lock feed, EOF shutdown
bun test test/hypr-lock.test.ts test/wallpaper-protocol.test.ts # no real locking
bun test test/landscape-controls.test.ts # preview rules and continuous water phases
bash ags/check.sh weather # isolated fake curl: endpoint/location/fallback, lifecycle, bounded args, parsing, throttling, cancellation
bun test test/weather-request.test.ts # explicit locations, URL escaping and Austin fallback
bash ags/tools/wallpaper-service-smoke.sh # isolated stub renderer, state and session
ags run ags/tools/wallpaper-preview.ts --gtk 4 # /tmp/sysdef-wallpaper-{0,6,12,18}.png
ags run ags/tools/wallpaper-smoke.tsx --gtk 4 # two-second live window test only
```

The preview also writes `/tmp/sysdef-wallpaper-{spring,summer,autumn,winter}.png`
and `/tmp/sysdef-wallpaper-moon-{new,waxing,quarter,full,waning}.png` for deterministic
weather/season/moon comparisons without making network requests.

After updating sources, restart AGS or log in again to load the changes.

### CPU-driven water and persistent seasonal crops

River highlights, the waterfall, splash and clockwise mill wheel share one
continuously integrated phase. Aggregate CPU load smoothly changes their speed;
changing load never resets the wheel angle. One app-wide service reads `/proc/stat`
once per second. The wallpaper no longer samples RAM or uses it to plant crops.

The opposite bank has 96 planting sites. Crops now grow with **real calendar time**,
not uptime or frame count: seedlings emerge, increase in height, ripen, and are
harvested progressively from the front rows to the back, leaving stubble. Varieties
have distinct green pea pods, golden wheat heads and rounded orange pumpkins.
The northern-hemisphere yearly rotation is:

| Crop | Sown | Fully grown | Harvest | Next phase |
| --- | --- | --- | --- | --- |
| Peas | March 1 | May 18 | May 25–31 | Wheat on June 1 |
| Wheat | June 1 | August 13 | August 20–31 | Pumpkins on September 1 |
| Pumpkins | September 1 | November 3 | November 10–30 | Winter fallow on December 1 |
| Fallow | December 1 | — | — | Peas on March 1 |

The southern-hemisphere schedule shifts six months. It follows weather latitude;
an offline restart retains the saved hemisphere until location is known. Initial
setup joins the current season rather than starting a summer crop in winter.

One shared service stores the crop, annual cycle, growth fraction, harvested
fraction and last-update timestamp in **`$XDG_STATE_HOME/sysdef/crops.json`**
(normally `~/.local/state/sysdef/crops.json`). It updates once a minute and saves
atomically with private permissions every five minutes, on crop changes, and on
shutdown. No file I/O happens during drawing. Restarting, suspending or hiding the
wallpaper does not reset farming; elapsed offline time catches up to today's
season without replaying missed years. Clock rollback cannot shrink saved crops.

Bad/unknown-version save files are preserved, with errors visible under `crops`
in `ags request -i sysdef status`. Farming continues in memory if saving fails.
To reset a damaged save, move it aside and restart AGS; the new field joins today's
calendar. Disposable `SYSDEF_AGS_SERVICES=0` instances never read or write the save.

For desktop verification, restart AGS and:

1. Run `ags run ags/tools/wallpaper-preview.ts --gtk 4`. Inspect
   `/tmp/sysdef-wallpaper-crop-{peas,wheat,pumpkins}-{sown,growing,ripe,harvesting,harvested}.png`.
   These hold water and lighting fixed to isolate crop stages, without changing
   your real save or waiting months.
2. Observe the river and wheel at idle, during a build, and afterward. Check smooth
   acceleration/deceleration, downstream flow and clockwise rotation.
3. Check `crops` in the status response and the state file, then restart AGS and
   verify growth persists. Do not change the system clock to test seasonal stages.
4. Check multiple monitors, narrow/ultrawide outputs, night lighting, Hyprpaper
   switching and suspend/resume. All monitors share one farm. Hidden backgrounds
   stop queuing frames, but calendar growth continues.

### Caffeine

Open the system/power sidebar with **Super+P**, then toggle **Caffeine** in
**Power & session**. A coffee cup appears on every bar while enabled; click it
to disable Caffeine. It prevents hypridle's idle locking, display power-off and
idle-suspend actions using a logind **idle:handle-lid-switch** block inhibitor.
While enabled, closing the lid does not trigger logind's sleep/lock policy, and
Caffeine stays on when the lid closes or reopens. Manual lock and manual suspend
are not blocked. Turn Caffeine off to restore normal idle and lid-close behavior.

State is session-only and defaults off after shell restart; no preference or
compositor setting is changed. The inhibitor is also
released on shell exit or loss of logind. Errors are visible in the sidebar and
bar rather than falsely showing Caffeine as enabled. This requires hypridle's
`ignore_systemd_inhibit = false` (already set in the supplied config).

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
normal Hyprland windows. It slides in/out from the left via a namespace-specific
Hyprland layer rule; other shell animations are unchanged. The GTK window accepts compositor resizing so its body
keeps the full anchored height as content loads; it is not a fixed-size popup.
Sections appear in this order:

1. **Power & session:** icon-labelled Lock, Suspend, Log out, Reboot, Shut down. Lock uses the
   existing Hyprlock wrapper and acts immediately; Log out, Reboot and Shut down
   require a second explicit selection. Holding Enter or Space cannot confirm.
   The former Super+Ctrl+L lock shortcut is removed; use Super+P → Lock instead.
2. **System resources:** CPU utilization (delta sampled), RAM used/total, load
   averages and root filesystem usage. The initial CPU baseline gets a second sample
   after about 250 ms instead of waiting five seconds, and reopening retains the
   previous baseline. The panel is no longer competing with wallpaper drawing in
   the same GTK process; unchanged monitor/width assignments avoid extra layout
   invalidation. Manual sliders stay hidden until live sync is disabled.
3. **Tailscale:** connection/login/daemon status, health warnings, this device and
   **all** peers returned by the daemon, including offline devices. Rows show
   hostname, OS, online state, IPs and direct/relay/idle status. Expand a row for
   last-seen and transfer information. No login URLs, keys or raw status are saved.

`j`/`k` or Up/Down navigate rows; `gg`/`G` or Home/End reach the first/last row;
`h`/`l` collapse/expand device details; Tab/Shift+Tab traverse controls.
Row navigation starts at Lock and excludes the mouse-only ✕ close button;
Enter/Space activates a power choice; on a peer device it copies its Tailscale IP
(prefer IPv4, fall back to IPv6) and toggles details, with a visible copied marker.
Self rows only toggle details. Devices without an IP report that nothing can be
copied. The native Wayland clipboard is used, with no external clipboard command.
`h`/`l` change details without touching the clipboard. `q` or Escape closes and
releases keyboard focus. Vim letter keys do not intercept Ctrl/Alt/Super
shortcuts. Focused rows scroll into view. Tailscale is read-only
here: there are no automatic connect/disconnect, SSH or network-changing actions.
Resource/status polling runs only while open, without overlapping requests;
The informational “Tailscale SSH enabled, but access controls don't allow anyone”
warning is hidden in this menu only; other health warnings remain visible and no
Tailscale settings are changed. Keyboard controls remain active without a bottom
controls-guide footer.
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
bash ags/check.sh                       # Actual GTK widgets + private D-Bus/resource/weather/crop tests
bash ags/check.sh weather               # Isolated fake curl; no network or desktop changes
bash ags/check.sh layout                # Opt-in: briefly displays a read-only panel, validates full height through refresh
bash ags/check.sh caffeine              # Opt-in: briefly acquires an idle + lid inhibitor; checks toggle-off and shutdown release
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
