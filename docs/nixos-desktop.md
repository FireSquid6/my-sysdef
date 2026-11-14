# Recreating the Hyprland workstation on NixOS

## Scope

`nixosConfigurations.deisslaptop` is a **fresh-install NixOS configuration** for
this machine's x86_64 AMD Hyprland desktop, with integrated Home Manager. It is
separate from the older standalone `homeConfigurations` outputs. Those outputs
remain on NixOS/Home Manager 25.11 and deliberately do not provision native
sessions or services.

The NixOS output includes the user applications and development tools identified
in the installed-package audit, the current AGS desktop, named-workspace
launchers, and native facilities needed on an otherwise fresh system.

It does **not** include Xfce, LightDM, EndeavourOS packages, Arch package-manager
utilities, or Trayscale. Historical files remain in Git for reference but the
NixOS profile does not link the old i3/picom/polybar/swaylock configuration.
Dolphin replaces the Xfce file manager; LibreOffice and other non-Xfce apps are
retained. Alternative launchers and recorders remain available, but no second
bar, notification daemon, or launcher is autostarted.

No configuration in this change is installed or activated automatically. Building
an output writes to the Nix store; it does not switch the running OS, alter
partitions, remove pacman packages, or restart the display manager.

## Structure

| Path | Responsibility |
| --- | --- |
| `nix/nixos/default.nix` | Account, locale, Nix, base administration and filesystem tools |
| `nix/nixos/desktop.nix` | Hyprland session, SDDM theme, PAM locking, graphics, audio, desktop integration |
| `nix/nixos/services.nix` | NetworkManager/VPN, DNS, firewall, Bluetooth, printing, SSH, Tailscale, firmware |
| `nix/nixos/development.nix` | Docker daemon, Steam host support, database binaries without database services |
| `nix/nixos/hosts/deisslaptop.nix` | Hostname, observed AMD platform, **installation-template** mounts/boot settings |
| `nix/home/workstation.nix` | Compose shared HM configuration and all desktop extras, including gamedev |
| `nix/home/development.nix` | Additional developer tools, build tools, editors, and coding-agent executables |
| `nix/home/applications.nix` | Communication, productivity, gaming, recording, and optional desktop tools |
| `nix/home/utilities.nix` | Additional CLI/diagnostic/media tools |
| `nix/home/desktop.nix` | GTK/Qt/cursor appearance, user directories, startup directories |
| `nix/packages/` | Missing packages and explicitly adapted upstream packages |
| `nix/tests/desktop-contract.nix` | Required/excluded packages, native services, config links, and Lua session contract |

`nixosModules.desktop` exports the composed native + Home Manager module for
reuse. Use it with the locked `nixpkgs-desktop` input; the complete workstation
inventory is currently supported on **x86_64-linux only**. The existing portable
standalone Home Manager profiles still evaluate on aarch64-linux.

## Version and source boundaries

The top-level `flake.lock` pins:

- `nixpkgs-desktop` on `nixos-unstable`: Hyprland **0.57.2**, hyprlock **0.9.7**,
  hypridle **0.1.8** at the initial pin. This is deliberately newer than the
  standalone HM input because the active configuration requires Hyprland's Lua API.
- Matching current Home Manager for the integrated NixOS profile.
- Upstream **AGS 3.1.0** and Astal. The AGS/Astal ecosystem is no longer packaged
  by this Nixpkgs input. Use the upstream flake rather than a guessed `pkgs.ags`.

Hermes uses a verified NAR-hash-pinned upstream flake at its installed **v0.23.1**
revision. Its own lockfile pins its Python/Electron build closure. Browser-use
reuses the uv2nix/pyproject build-tool inputs from that same pinned upstream
lockfile, plus its own committed `uv.lock`. Nothing resolves a new Python/npm
closure on activation.

The standalone Home Manager outputs deliberately retain their original pins and
warnings; selecting one of those is **not** equivalent to selecting the NixOS
workstation.

### Packages added outside Nixpkgs

| Export under `packages.x86_64-linux` | Source / purpose |
| --- | --- |
| `ags-desktop` | Upstream AGS flake, with matching GJS/GTK/Astal/Gnim runtime |
| `hermes` | Upstream pinned agent + Electron desktop; preserves `hermes desktop` |
| `emdash-app` | Upstream EmDash **0.4.16** AppImage |
| `youtube-music-for-desktop` | **Venipa/ytmdesktop2 0.17.13**, not the unrelated Nixpkgs YouTube Music clients |
| `mdserve` | **FireSquid6/noteview 1.0.0** `mdserve` binary, not the unrelated Nixpkgs `mdserve` project |
| `openchamber` | **2.0.3** web/CLI distribution, with locked npm dependencies and a source-built node-pty |
| `openchamber-desktop` | Matching **2.0.3** upstream desktop AppImage |
| `md-to-pdf` | **5.2.5**, using Nix Chromium rather than a Puppeteer browser download |
| `browser-use` | **0.13.8**, locked Python 3.12 environment with Nix Chromium defaults |
| `tommy-excalidraw-cli` | Exact **@tommywalkie/excalidraw-cli 0.5.0**, source-built Cairo canvas renderer |
| `s-nail` | Upstream **14.9.25**, built from the verified release archive |
| `kvantum-tokyo-night` | Pinned theme matching the locally used upstream project |
| `glances-cli` | Nixpkgs Glances without insecure optional python-jose JWT support |

All of these are installed by the NixOS workstation, not merely exported for
manual builds. Standard available packages are reused for Proton Mail, Copilot,
Herdr, Pi, Claude Code, OpenCode, Pixelorama, Modrinth, Wayfarer, and other apps.
No insecure-package allowlist or blanket missing-attribute filtering is used.

Glances' removed optional dependency is marked insecure for **CVE-2026-120459**
in the pin. Local terminal monitoring remains available; JWT authentication is
not. Its upstream remaining test suite passes without that dependency.

**Binary-package caveats:** the preserved AppImages bundle upstream Electron and
native dependencies; Nix hashes ensure identity, not a security audit or future
support. Their upstream desktop entries use `--no-sandbox`. OpenChamber web's
self-update/OpenCode-install paths are disabled in the package; its desktop
AppImage does not receive those web-source patches. Update these packages through
reviewed Nix definitions; do not use in-app installers as the source of truth.
The old experimental Excalidraw renderer also retains deprecated dependencies.
See each package directory's README for exact build/test limits.

## Desktop behavior

- SDDM defaults to **Hyprland (sysdef)**. Its packaged session explicitly executes
  `start-hyprland -- -c "$HOME/.config/hypr/hyprland.lua"`; the retained legacy
  `hyprland.conf` is not selected accidentally.
- The session exports the editable checkout environment and loads HM session
  variables. The checkout is `/home/firesquid/my-sysdef` by default.
- Hyprland starts the existing workspace controller, AGS, hypridle, hyprpaper,
  nm-applet and tmux workflow. No duplicate HM hypridle/AGS services are enabled.
- The normal account/PAM policy authenticates hyprlock. No credentials, automatic
  login/unlock, or weakened PAM policy are introduced.
- SDDM uses maintained Astronaut Qt6 QML with the repository's exact Tokyo Night
  theme settings, packaged into the store rather than deployed with a sudo script.
- GTK uses Tokyonight-Dark/Qogir-dark; Qt uses Kvantum Tokyo Night through qt6ct.
  The GoogleDot-Black cursor spelling is consistent between config and startup.
- Required startup commands `herdr-app`, `hermes desktop`, `proton-mail`, and
  `obsidian` are supplied. Dolphin, Thunderbird, playerctl, brightnessctl, and
  clipboard tools referenced by bindings are also present.
- The `notes` and `source` directories expected by the tmux/project workflow are
  created during HM activation. Notes, repositories and all private application
  state still need restoring separately.
- Shell sandbox scripts use portable Bash shebangs and bind the immutable Nix
  store/current system read-only, without exposing all of `/run`. They are not a
  newly audited security boundary; review extra bind mounts before using them.

## Native facilities and deliberate replacements

Enabled host facilities include NetworkManager with OpenConnect/OpenVPN plugins,
systemd-resolved, time synchronization, the NixOS firewall, Bluetooth, Avahi,
CUPS printing, power profiles, PipeWire/WirePlumber, Tailscale, SSH, Docker,
firmware updates, and SSD trimming. Review this list before installing.

- NixOS's native firewall replaces firewalld. SSH is enabled; review its and
  Avahi's service-specific firewall defaults before installing. Steam
  streaming/server ports are not opened by default.
- NetworkManager replaces the installed legacy netctl setup.
- The kernel/systemd supply entropy, boot/device management and normal time
  synchronization; no haveged, Arch dracut integration, or hardware-detection
  scripts are translated into fake user packages.
- PostgreSQL and MariaDB binaries are installed, but database services are not
  enabled and no database data is copied.
- Filesystem/admin utilities are retained, but the presence of a tool never
  imports or activates old mounts, RAID arrays, printers, VPN secrets or services.
- Kernel, firmware, AMD microcode, systemd, native udev/audio integration, XWayland
  and relevant codec dependencies are supplied by NixOS rather than by translating
  Arch package names one-for-one.
- `base-devel` is represented by explicit build tools. Projects needing headers,
  compiler libraries or particular SDK versions should use Nix dev shells rather
  than assume Arch's `/usr/include` layout.
- `nopt`, `semver`, and npm's internal node-gyp installation are npm support
  dependencies, not independently preserved global application installs.

## Before installation: required operator decisions

**Do not run `nixos-install` or `nixos-rebuild switch` on this running Arch system
using this template without a separate installation plan and backups.**

1. Back up the entire home/private state, authentication material and any database
   data. This flake shares configuration; it does not back up or recreate secrets.
2. Prepare the target storage deliberately. The host file assumes an ext4 root
   labeled **`nixos`** and a FAT EFI partition labeled **`EFI`**, mounted at
   **`/boot`**. These labels are an installation contract, **not observations of
   the existing disk**. The live Arch installation uses a different layout.
   Generate `hardware-configuration.nix` on the mounted target, import it from the
   host file and replace/override template mounts and boot settings. Do not format
   existing partitions just to satisfy the defaults. Review EFI/systemd-boot,
   dual-boot, encryption and swap/hibernation requirements separately.
3. Check the account name, locale/timezone, hostname and checkout path. AMD
   graphics/CPU assumptions match this machine; the module is not a portable
   hardware detector.
4. Put the persistent writable checkout at the configured path **before the first
   integrated Home Manager activation**. On a fresh install, stage it into the
   mounted target home (for example `/mnt/home/firesquid/my-sysdef`), retain the
   sources and ensure the account owns it. Managed config links depend on that
   checkout continuing to exist. A store-only flake clone is not sufficient.
5. Set the `firesquid` password explicitly from the installer/TTY. There is no
   default password/hash and no automatic SSH authorized key. Root SSH login is
   disabled. Keep TTY recovery access while testing the greeter and lock screen.
6. Restore data and sign into applications/Tailscale/VPNs deliberately. No keys or
   enrollment commands are embedded. Membership in `docker` is root-equivalent;
   it is preserved intentionally for the development workflow.
7. If reusing an existing home, follow the adoption preview in
   `docs/nix-migration.md` before activation. The standalone preview can be used
   for shared files, but the integrated NixOS home has additional generated GTK,
   Qt and cursor files: inspect/back up those conflicts too. Nothing uses
   `force = true` to overwrite unknown home files.

New source files must be tracked before a Git-backed flake sees them. During
local development, `path:.` includes untracked source files; production deployment
should use a reviewed, tracked checkout.

## Validation without activation

```sh
# Evaluate every output (does not build/activate the OS).
nix flake check --no-build --all-systems path:.

# Small checks and custom package checks; no service/login activation.
nix build --no-link \
  'path:.#checks.x86_64-linux.desktop-contract' \
  'path:.#checks.x86_64-linux.desktop-apps' \
  'path:.#checks.x86_64-linux.ags-bundle' \
  'path:.#checks.x86_64-linux.browser-use' \
  'path:.#checks.x86_64-linux.md-to-pdf' \
  'path:.#checks.x86_64-linux.excalidraw' \
  'path:.#checks.x86_64-linux.hermes-launcher'

# Full closure build is a separate, potentially large pre-install step.
nix build --no-link 'path:.#nixosConfigurations.deisslaptop.config.system.build.toplevel'
```

The desktop contract checks selected packages/services, rejects the excluded
stacks, verifies the config links and confirms that the actual packaged session
selects Lua. It does **not** prove interactive graphical functionality.

### Validation performed

- Flake evaluation, including the complete NixOS derivation and all existing
  standalone outputs/checks on both architectures: passed (`--no-build`).
- Built the desktop contract, custom desktop-app checks, AGS bundle, browser-use
  local Chromium/CDP smoke test, md-to-pdf rendering test, exact Excalidraw PNG
  rendering test, and Hermes launcher tests.
- Built the upstream AGS 3 runtime and the configured SDDM theme package.
- Built Kvantum Tokyo Night, Glances (963 upstream tests passed), and s-nail
  (631 upstream tests passed, plus installed executable/version verification).
- Full Bun suite: **517 passed**, using the desktop's selected **Bun 1.4.4**.
  Older host/stable-dev-shell Bun versions fail the pre-existing large data-URL
  notification test fixture; use the desktop runtime when reproducing this result.
- Adoption tests: **9 passed**. Shell syntax, Nix formatting, Statix and Deadnix
  checks passed.
- Full Hermes agent + Electron closure build was attempted with bounded resources
  but timed out while building dependencies, without a reported builder failure.
  Its package and upstream pin evaluate and the launcher tests pass; a completed
  full Hermes build is **not claimed**.

A full-system build, installed-system boot, real SDDM/PAM authentication,
Hyprland login, suspend/resume, multi-monitor behavior, GUI rendering, tray,
portals, and application credentials still require validation on the target.
YouTube Music's display-less runtime probe did not pass: it attempted graphical
initialization and timed out; its package and desktop integration built, but GUI
behavior is unverified. Never equate successful evaluation or a CLI smoke test
with a working graphical login.
