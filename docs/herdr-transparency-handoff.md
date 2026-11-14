# Handoff: native Herdr chrome transparency, opaque terminals

> Historical investigation: the UI alpha overrides described below have since
> been removed from `herdr/settings.json` because they made the sidebar/topbar
> look black over the opaque native backing. The current configuration inherits
> solid Tokyo Night UI colors. Do not reapply these overrides without verifying
> native transparency first. See `docs/desktop-transparency.md` for current behavior.

## Goal and scope

Make the desktop wallpaper visible through **Herdr's sidebar and surrounding UI chrome**, with a subtle Tokyo Night tint. **Terminal panes must remain completely opaque**, including their text and default background.

The user confirmed Alacritty, Pi, Neovim and OpenCode transparency works. Leave those alone. The user explicitly deferred Hermes; do not work on it. The power menu has already been given an opaque background and should remain opaque.

This is a handoff for investigation/implementation, not a claim that Herdr transparency has been fixed.

## Environment and repositories

- Dotfiles/config repository: `/home/firesquid/sysdef`.
- Herdr app source checkout: `/home/firesquid/source/herdr-forks/herdr-app`.
- Parent fork instructions: `/home/firesquid/source/herdr-forks/AGENTS.md`.
- App instructions: `/home/firesquid/source/herdr-forks/herdr-app/AGENTS.md`; also read `AGENTS.local.md` if present.
- Installed desktop binary: `/home/firesquid/.local/share/herdr-app/herdr-app`.
- `~/.local/bin/herdr-app` resolves to that installed binary.
- Installed version reported during investigation: `herdr-app 0.1.15`.
- `~/.config/herdr-app` is a symlink to `/home/firesquid/sysdef/herdr`.
- Current layout: `tty`, a personal clone; do not edit shipped layouts/mods.
- Session: Hyprland on native Wayland. `hyprctl clients -j` reported `class: "herdr-app"`, `xwayland: false`.
- The app source checkout and installed executable are separate artifacts. Do not assume a source behavior is present in the installed release.
- No `cargo`, `rustup`, or `~/.cargo/bin` toolchain was found. `sudo -n true` required a password. No toolchain installation or native app build was attempted. A user-local Rust installation may be possible; establish prerequisites before promising a build.

Check current state again: other agents are working concurrently. Unrelated worktree CLI files were already untracked in sysdef. Preserve all unrelated changes in both repositories.

## What has already changed in sysdef

### UI alpha configuration

`herdr/settings.json` now includes these **UI paint token overrides**:

```json
"colors": {
  "background": "#1a1b2600",
  "canvas": "#16161e00",
  "chrome": "#16161ecc",
  "surface": "#1a1b26e6",
  "popover": "#1f2335e6",
  "raised": "#24283be6",
  "hover": "#292e42e6",
  "selected": "#283457e6",
  "input": "#1a1b26e6"
}
```

Eight-digit values use `#rrggbbaa`. The full-window `background` and layout `canvas` must not paint an opaque layer underneath translucent chrome. Chrome is 80% opaque; other UI surfaces are about 90%. Nested alpha-painted layers compound, so avoid mistaking 96% combined opacity for successful subtle glass without visual verification.

**Do not change the theme's terminal palette to alpha.** `herdr/themes/tokyonight-night.json` retains its top-level six-digit `"background": "#1a1b26"`. That terminal palette background is distinct from the UI paint token `colors.background`.

### Terminal opacity

`herdr/layouts/tty.json` explicitly sets:

```json
"terminal_opacity": 1
```

It belongs to the layout look, not personal `settings.json`. Leave it at 1.

### Tests/documentation

- `test/transparency.test.ts` checks configuration values, including opaque terminal opacity. **It does not prove native transparency.**
- `docs/desktop-transparency.md` documents the configuration and the current installed-app limitation.
- `ags/style.css` now contains `window.sidebar { background: #1a1b26; border-radius: 10px; }` for the opaque power menu. Do not change it as part of this work.

## Verified live failure

1. The installed app accepted the UI alpha configuration without a settings/layout parse error.
2. A compositor screenshot of the actual sidebar showed a solid dark background.
3. Temporarily changing only `colors.chrome` to `#16161e00` made its background **black**, not wallpaper-visible.
4. The original `#16161ecc` value was restored after the test. There is no intentionally temporary alpha-zero chrome change left in settings.

Artifacts, if still present:

- `/tmp/sysdef-herdr-before.png` — compositor capture of tinted chrome.
- `/tmp/sysdef-herdr-clear-chrome.png` — compositor capture with zero-alpha chrome; black backing.
- `/tmp/sysdef-herdr-transparency-status.json` — status captured during diagnosis.

The screenshots came from `grim`, not `herdr-app shot`. The latter produced an image that was actually JPEG despite a `.png` filename, so it cannot establish native surface alpha. Use compositor captures over a visibly patterned wallpaper to verify the result.

The only app status error seen was an unrelated unreachable remote machine (`desktop`, SSH port 22 timeout). Do not treat that as a transparency failure or try to fix it here.

## Source findings and leading hypothesis

Paths below are relative to the Herdr app checkout. Line numbers are approximate and must be rechecked.

### Native window backing is not explicitly transparent

`src/main.rs`, around lines 210–230, creates the main `WindowOptions` with client decorations but leaves `window_background` unset. GPUI's default native background appearance is `WindowBackgroundAppearance::Opaque`.

A minimal **candidate** fix is explicitly requesting:

```rust
window_background: WindowBackgroundAppearance::Transparent,
```

Use the actual imports/type names supported by this source revision. This is **not built or verified**. Determine whether it needs platform scoping, whether secondary windows need the same treatment, and whether the backend also needs adjustment. Do not claim this single line is sufficient before testing.

Do not introduce a new setting/API unless necessary. Read the app's instructions about core/API changes and maintainer approval before expanding scope.

### Why the earlier source-only conclusion was wrong

The checked-out Wayland backend appears capable of transparency with client decorations:

- `vendor/gpui-pre-linux/src/linux/wayland/window.rs`, around lines 645–648: `is_transparent()` returns true for client decorations **or** non-opaque background appearance.
- Around lines 2250–2281: `update_window` updates renderer transparency and clears the Wayland opaque region except for opaque server-decorated windows.

This led to an incorrect assumption that the theme alpha overrides alone would work in the installed app. **The live test disproved that assumption.** Investigate actual installed-build/backend behavior and native background options; do not repeat the source-only inference.

### Renderer investigation points

`vendor/gpui-pre-wgpu/src/wgpu_renderer.rs`:

- Around lines 408–436: supported surface alpha-mode selection and choice based on `config.transparent`.
- Around lines 1069–1089: runtime `update_transparency` changes the surface configuration.
- Around lines 1256 onward: surface/frame rendering, premultiplication and clear behavior.

Check whether the actual Wayland/Vulkan surface supports and selects a usable premultiplied alpha mode, whether an opaque region is being declared, and whether any native/root layer still paints black or forces alpha to 1.

### UI paint and alpha parsing

`src/settings.rs`:

- `parse_hex`, around lines 582–598, supports six- and eight-digit UI colors, preserving alpha.
- `Settings::compose` combines personal and layout overrides; the layout's colors override personal colors.
- `Settings::set`, around lines 706–708, applies settings overrides after theme-file colors.
- Top-level terminal palette RGB parsing is separate from UI token parsing.

`src/window.rs`:

- Around line 4989: the root paints `c("background")` beneath the layout.
- Layout `tty.json` paints `canvas` at its root and `chrome` on its sidebar.
- `tty-workspace-chrome`, sidebar and status mods can paint additional `chrome` layers.

`src/terminal.rs`:

- Around lines 1853 and 2156: terminal background fills use the terminal palette and `terminal_opacity`.
- Preserve their opacity. The desired effect is **not** whole-window fading.

## Implementation plan

1. Read the parent/app instructions; inspect Git status and identify the current source branch/commit. Preserve concurrent changes.
2. Establish build dependencies and install/obtain a Rust toolchain through an approved route. Do not silently skip a failed build dependency.
3. Reproduce in an isolated app/core session with the actual UI alpha config and a clearly patterned wallpaper behind it.
4. Make the smallest native backing/renderer fix. Start by testing explicit `WindowBackgroundAppearance::Transparent`; trace the backend if that does not work.
5. Keep the terminal palette RGB and `terminal_opacity = 1`. Do not use Hyprland whole-window opacity, widget-subtree opacity, or terminal opacity as a substitute.
6. Add appropriate tests for native window options/platform behavior. Preserve other-platform behavior; do not claim macOS/X11/Windows validation if only Wayland was tested.
7. Test and visually verify in isolation before considering an install. Report whether the fix applies at startup only and requires app restart.
8. Coordinate installation/restart with the user. Do not stop or replace the user's running app/core without coordination. Keep a rollback copy of the installed binary if deployment is authorized.
9. Update sysdef documentation to distinguish verified behavior from pending limitations. Leave working terminal applications, Hermes and the opaque power menu alone.

## Build and safe test entry points

The app's documented recipes are:

```sh
cd /home/firesquid/source/herdr-forks/herdr-app
just build  # cargo build --locked
just test   # selected Bun tests, then cargo test --locked
just check  # alias of test
```

`just install` invokes the platform installer and changes the installed desktop app. **Do not run it until deployment is coordinated.**

The app instructions require Linux UI testing through the isolated sandbox:

```sh
scripts/sandbox up
scripts/sandbox status
scripts/sandbox shot
# Consult scripts/sandbox/help/docs for exact command syntax and test setup.
scripts/sandbox down
```

It uses its own app home/core and a headless Weston/Xwayland display under `/var/tmp/herdr-app-sandbox`. Establish which backend the sandbox is exercising: an Xwayland-only result does not prove native Wayland behavior. A controlled native-Wayland test may also be needed.

Never run a bare `target/*/herdr-app` without `HERDR_APP_HOME` pointing at a scratch home on this machine. Never fake input on the real display or stop another agent's app/core.

Useful non-mutating inspection commands:

```sh
herdr-app --version
herdr-app status
readlink -f ~/.local/bin/herdr-app
hyprctl clients -j
bun test /home/firesquid/sysdef/test/transparency.test.ts
```

Determine screenshot coordinates from current compositor geometry; the old addresses, PIDs and capture rectangles are ephemeral.

## Acceptance criteria

- Patterned/animated desktop wallpaper is visibly present through the sidebar/chrome in a **compositor screenshot**, not just through an app-internal background image.
- Terminal panes are completely opaque, and text/cursors are not faded.
- Tokyo Night color identity and readable UI contrast are preserved.
- No opaque full-window root/canvas remains beneath transparent UI areas.
- The desired behavior survives a fresh app launch and config reload.
- No compositor-wide opacity workaround, terminal opacity reduction, or changes to working Alacritty/Pi/Neovim/OpenCode behavior.
- Build/tests are reported separately from actual native-Wayland visual verification.
- User sessions and concurrent agent work remain intact; test resources are cleaned up.
