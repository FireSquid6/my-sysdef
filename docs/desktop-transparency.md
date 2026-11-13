# Desktop transparency

Wallpaper visibility is controlled by background colors, not compositor-wide
opacity rules. Text and cursors are not faded.

| App | Configuration | Behavior |
| --- | --- | --- |
| Alacritty | `dotfiles/alacritty.toml`, `[window].opacity = 0.90` | Default background is 90% opaque, keeping Tokyo Night's tint. |
| Neovim | Tokyo Night options in `neovim/lua/plugins.lua` | Main buffers, inactive windows and sidebars inherit the terminal background. Floating dialogs retain a solid background. |
| Pi | `pi/themes/tokyonight-night.json` | Message/tool panels use the terminal-default background (`""`). Selections and search matches retain their contrasting fills; HTML export colors are unchanged. |
| OpenCode | `opencode/cli.json` and `opencode/themes/tokyonight-transparent.json` | Main canvas, panels and unchanged diff lines inherit the terminal background (`"none"`). Menus and added/removed diff lines retain contrast. |
| Herdr | UI alpha overrides in `herdr/settings.json`; `terminal_opacity = 1` in `herdr/layouts/tty.json` | Alpha configuration is prepared, but the installed 0.1.15 native window remains opaque. A native app fix is still required; terminal panes must stay fully opaque. |
| Power menu | `window.sidebar` in `ags/style.css` | The entire menu window has a fully opaque Tokyo Night background, including behind the scroller. |
| Hermes Desktop | No change on Linux | The installed build disables translucency on Linux. Sidebar-only glass needs an application patch/rebuild; whole-window opacity is not an acceptable substitute. |

## Herdr's two backgrounds

Keep the theme's **top-level** `background` as the six-digit terminal color
`#1a1b26`. The `settings.json` **UI paint token** named `colors.background` is
a separate setting; its alpha must be zero, as must `colors.canvas`, so there is
no solid full-window layer underneath translucent chrome. Other UI surfaces use
80–90% alpha. Nested surfaces can compound to a more opaque appearance.

The current installed Herdr 0.1.15 is **not transparent**, even on native
Wayland. A live desktop capture with `colors.chrome` temporarily set to zero
alpha rendered black instead of showing the wallpaper. The diagnostic setting
was restored afterward. Source inspection of client-decoration handling was not
sufficient evidence of installed-binary transparency support.

Herdr's main `WindowOptions` leaves `window_background` at its opaque default.
The native app needs an explicit transparent backing and renderer verification;
there is no exposed settings/command option for that backing. A candidate native
fix is `window_background: WindowBackgroundAppearance::Transparent`, but this
has not been built or verified. The Rust toolchain is not installed locally.
Do not work around this with compositor-wide opacity: that would fade terminal
panes too. Config tests below validate alpha values, not native transparency.

Pi, Neovim and OpenCode inherit **their host terminal's** background. Therefore
they are translucent in Alacritty but remain opaque inside Herdr, intentionally.
Restart Neovim/OpenCode after changing their configuration. Alacritty and the
active Pi theme normally reload live; Herdr settings/layout changes reload live.

## Hermes Desktop limitation

The installed Hermes Desktop sources explicitly gate `translucencySupportedOn`
and `glassSupportedOn` to macOS/Windows in
`apps/shared/src/translucency.ts`. Both the renderer
(`apps/desktop/src/store/translucency.ts`) and native opacity application
(`apps/desktop/electron/translucency.ts`) enforce the Linux restriction. The
renderer resolves imported/persisted settings to intensity/fade zero, so changing
`~/.config/Hermes/translucency.json` would not enable the requested effect.

Keep the main area opaque. Do not add compositor opacity or change Hermes's CLI
skin: neither implements sidebar-only desktop transparency. Enabling the desired
Linux effect requires a transparent Electron backing and Linux-capable scoped
surface painting, followed by an app rebuild.

## OpenCode compatibility

The custom theme preserves OpenCode v2.2.5's bundled Tokyo Night palette. It uses
the V1-compatible theme document, which that version explicitly loads and
migrates to V2 tokens. Only `background`, `backgroundPanel` and `diffContextBg`
are changed to `"none"`. V2 migration makes floating dialog backgrounds solid
for readability.

Palette source:
https://github.com/anomalyco/opencode/blob/v2.2.5/packages/tui/src/theme/assets/tokyonight.json

Loader/migration:
https://github.com/anomalyco/opencode/blob/v2.2.5/packages/tui/src/theme/index.ts
https://github.com/anomalyco/opencode/blob/v2.2.5/packages/theme/src/tui/v1-migrate.ts

## Checks

```sh
bun test test/transparency.test.ts
alacritty migrate --dry-run --config-file dotfiles/alacritty.toml
herdr-app status # check for settings/layout errors; does not change terminals
```
