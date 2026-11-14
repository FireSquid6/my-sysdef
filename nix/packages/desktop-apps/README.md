# Desktop application packages

`default.nix` exports five independent x86_64-linux packages. It does not enable
a desktop environment, display manager, service, or autostart entry. The parent
configuration decides which packages to install.

| Attribute | Upstream | Version | Executable |
| --- | --- | --- | --- |
| `emdash-app` | generalaction/emdash | 0.4.16 | `emdash` |
| `youtube-music-for-desktop` | Venipa/ytmdesktop2 | 0.17.13 | `youtube-music-for-desktop` |
| `mdserve` | FireSquid6/noteview (renamed from mdserve) | 1.0.0 | `mdserve` |
| `openchamber` | openchamber/openchamber, web release | 2.0.3 | `openchamber` |
| `openchamber-desktop` | openchamber/openchamber, Electron release | 2.0.3 | `openchamber-desktop` |

The web and desktop OpenChamber packages are separate products, not aliases.
The web package uses Nix Node 24, builds node-pty against that runtime, and
patches its self-update and OpenCode install/upgrade entry points to refuse
mutable installations. Supply a compatible OpenCode separately through PATH or
`OPENCODE_BINARY`, or configure an external server. The Electron AppImage is an
upstream binary and does **not** receive those JavaScript patches.

## Reproduce validation

From the repository root, with an unpacked nixpkgs source:

```sh
nix-build --no-out-link nix/packages/desktop-apps/checks.nix \
  --arg pkgs 'import /nix/store/yxkqzvl5bf7knrh55lbl5xjxksq6ydmp-source {}'
```

This builds all five packages and checks:

- freedesktop desktop-file validity, installed executable references, and icons;
- `mdserve --help`, `openchamber --help`, and `openchamber --version`;
- OpenChamber web's update/install refusal APIs, including rejection before any
  installer network fetch.

OpenChamber's package install check additionally imports sherpa-onnx-node and
spawns a real node-pty terminal, requiring successful output and exit within ten
seconds. CLI install checks use temporary homes and timeouts. No daemon, browser,
user startup configuration, or software updater is invoked by these checks.

## Actual validation and limits

Validated against the nixpkgs source above on x86_64-linux:

- All five packages built successfully. Existing four release-file hashes and
  the mdserve release-file hash were accepted; the OpenChamber npm dependency
  hash also built successfully. No placeholder hashes remain.
- Final standalone check output:
  `/nix/store/18yvc1by8qq688dq299rg8k4pj9rr892-desktop-apps-checks`.
- Native dependency fixup reported zero unresolved dependencies for OpenChamber
  web; the native import/PTY install check passed.
- Outside the build sandbox, EmDash and OpenChamber Desktop wrappers completed
  `ELECTRON_RUN_AS_NODE=1 ... --version`, reporting embedded Node `v20.16.0` and
  `v24.21.0` respectively. This checks their FHS wrappers/runtime, **not** their UI
  or application version.
- YouTube Music did not honor Electron Node mode (apparently disabled by the
  upstream Electron fuse). Its attempted headless launch reported missing X
  display and required the 20-second timeout. This is **not** a passing CLI or
  GUI smoke test; do not use that probe as a safe CLI check for this app.

No graphical Hyprland session was exercised: window creation, Wayland/XWayland,
GPU acceleration, audio, login, desktop portals, keyring, tray integration, and
agent/OpenCode workflows still need interactive testing on the target Linux
workstation. No web server or OpenCode server was started. AppImage desktop entries
retain upstream `--no-sandbox`; do not interpret the FHS bubblewrap environment
as an Electron security sandbox. Binary AppImages and mdserve are not rebuilt
from source. No OS deployment or flake integration is implied by these package
checks.
