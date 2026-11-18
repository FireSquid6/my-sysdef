# Shared Nix desktop on existing Linux

kotoko and deisslaptop share one workstation configuration with minor explicit
host differences. `packages.x86_64-linux.kotoko-apps` and
`packages.x86_64-linux.deisslaptop-apps` instantiate the **same inventory**;
the output names remain for installed-profile compatibility, not separate
package lists. Neither installs an operating system.

## Ownership and architecture

- `nix/packages/workstation-packages.nix`: shared desktop/application/tool inventory.
- `nix/packages/workstation.nix`: shared profile builder, including the fork
  packages and opt-in session launcher.
- `nix/graphics/default.nix`: generic scoped graphics wrapping.
- `nix/hosts.nix`: identity, persistent checkout and explicit host GPU selection.
- `nix/home/workstation.nix`: shared home module using the same bundle with current
  desktop Home Manager/Nixpkgs. Headless Home Manager remains stable.

Hyprland/Aquamarine, AGS 3/GJS/GTK4, helpers, applications and development tools
come from the shared bundle. Nix is the default source for new user packages;
project-local dependency installation is unaffected. Existing editable config
links stay in place. This rollout does **not** hand an entire home to Home Manager
or move credentials, sessions, databases or application state.

### Deliberate native exceptions

The distribution retains boot/kernel, kernel drivers, device/seat access,
login/display manager, PAM/polkit, audio services, portals and privileged daemons
such as Docker, NetworkManager and tailscaled. User-facing Nix clients do not
replace those daemons. Continue normal distribution security/system updates.

**Keep native Hyprlock and PAM.** The bundle's `hyprlock` command delegates to
`/usr/bin/hyprlock`, clearing inherited Nix graphics library overrides. Native PAM
policy and `/usr/bin/unix_chkpwd` integration are not interchangeable with Nix's
helpers. No authentication behavior, permissions or grace period is changed.
A package contract check is not a real lock/unlock test.

**Keep native Steam**, including 32-bit/FHS graphics support. Its bundle launcher
uses a clean environment rather than installing Nix Steam. Retain native app
copies for fallback until replacements are validated. Custom executables outside
the manifest remain outside this migration.

## Host-specific graphics

### kotoko: EndeavourOS, NVIDIA

The recorded native NVIDIA userspace/kernel version is **615.78.08** (RTX 5070).
Its reviewed NVIDIA archive hash in `nix/hosts.nix` is
`sha256-Pj9t3cLudnoIGFMAr3vjyyhuznZpjS3eNSRZl4LQf/4=`. Keep it paired with
version **615.78.08**; recheck both when the native driver changes rather than
reusing this hash for a different release. The shared graphics wrapper scopes
nixGL/OpenGL/Vulkan libraries to graphical commands; it does not install a kernel
driver. After a native driver update, compare `/proc/driver/nvidia/version` and
review the version **and archive hash** before launching the Nix session.

The shared package profile is installed on kotoko. The Nix GTK widget/controller
smoke passed with desktop actions mocked, an isolated window used
`Gsk.VulkanRenderer`, and Nix Hyprland parsed the editable Lua config successfully.
These checks do not prove a real compositor seat/login, every application's GPU
behavior, or lock/suspend. The live compositor/AGS were not restarted.

### deisslaptop: AMD Phoenix1 / Mesa

Laptop inventory on 2026-11-14 confirmed AMD Phoenix1 **1002:15bf** with the
**amdgpu** kernel driver (native kernel **7.3.4-arch1-1**). PCI and DRM inventory
showed one GPU, with no NVIDIA device or hybrid-offload requirement. Native
Mesa and vulkan-radeon were **26.2.7**. Its explicit graphics backend in
`nix/hosts.nix` is therefore **mesa**; the nixGL Intel-named Mesa wrappers also
support AMD. This selection does not replace the native kernel driver.

The wrapped AGS widget smoke passed with desktop actions mocked; a temporary
GTK window selected **GskVulkanRenderer** and **AMD Radeon 760M / RADV PHOENIX**
through Nix Mesa 26.3.0. Isolated Nix Hyprland Lua parsing passed, with live IPC
healthy afterward. These are not real session/login, lock or suspend acceptance.
The laptop bundle, workstation contract, graphics-wrapper contract, shared
desktop contract and AGS bundle built successfully with Herdr Core pinned to
`92a49ad643c830920675de603d318ed57b1e7620` (the suspend-sensitive sweep test fix).
Flake evaluation, Nix linting, 9 Python adoption tests and 457 workstation-Bun
tests passed. The candidate's dedicated `start-nix-hyprland --version` check
passed in a scratch environment without launching a desktop.

The user confirmed authenticated SSH and a recovery path before package adoption.
The **deisslaptop-apps** profile entry is now installed at priority 4 alongside the
retained legacy Home Manager entry (priority 5), without whole-home activation.
44 stable application/font/portal links were installed with three conflicting
files backed up privately; Chromium/Godot native desktop IDs redirect to the Nix
entries. Font/menu caches were refreshed and only user `daemon-reload` was run.
Fresh fish/bash shells resolve the reviewed tools through `~/.nix-profile/bin`;
the installed session launcher's `--version` and installed AGS widget smoke pass.
All nine local terminal addresses present immediately before adoption survived,
with original core/holder and portal/audio PIDs unchanged. Native locker/PAM,
portals and audio remain distribution-owned. The user registered the custom
SDDM entry; its installed file matches the profile source byte-for-byte and has
the correct Name/Exec. The user completed a successful Nix login, and the live
compositor executable was verified under `/nix/store`. Detailed app/monitor,
lock/unlock and suspend/wake acceptance remain separate. Native Hyprland removal
was authorized; its package has no reverse dependencies and a non-recursive
removal preview contains only `hyprland`, but removal still requires user sudo.

## Deployment status and build/update procedure

**Package-stage state:** both workstation package profiles are built, checked
and installed. User menu entries, profile fonts and native-portal boundary drop-ins
are linked with private backups. kotoko's 40 original terminal addresses and the
laptop's nine pre-adoption local addresses survived their respective package
changes; core/holder and portal/audio PIDs were unchanged. Neither package-stage
rollout performed whole-home activation, service restart or compositor cutover.
Kotoko's subsequent user-coordinated Nix login is distinct from laptop acceptance.
Fresh shells use Nix first; already running shells/processes retain their previous
environment/code until refreshed normally. The account login shell is unchanged.
Builds alone do not install, log in, restart or test graphics.

Example build from the persistent checkout (choose the host explicitly):

```sh
nix build --max-jobs 2 --cores 20 --no-link .#kotoko-apps
# Laptop: same inventory, with its confirmed Mesa host settings:
nix build --no-link .#deisslaptop-apps
```

After a successful build and reviewed package checks,
`nix profile upgrade kotoko-apps` (or the matching deisslaptop entry) changes the
installed bundle. Check `nix profile list` first; do not add a duplicate output
for an already installed entry. For later dependency updates, `./nix-update.sh`
selects one of the two known workstation host names, updates the lock, builds
before upgrading and refreshes application metadata. Review/commit lock changes.
It never performs OS/Home Manager activation, sudo or restarts.

Check custom package pins without changing files:

```sh
./check-package-updates.sh
./check-package-updates.sh --package herdr-desktop  # or -p
```

The checker covers locally pinned release packages, browser-use's Python pin,
Kvantum's Git revision and the Hermes/Herdr/Nanosync flake source pins. Pure
wrappers around nixpkgs packages have no independent version to check. It queries
npm, PyPI, GitHub and the s-nail download index. GitHub release checks ignore
prereleases/drafts and require the packaged asset, searching the latest 100
releases; a missing asset is an error, not a claim that the package is current.
`UPDATE` means a newer stable version is available; `PIN DIFFERS` means the Git
branch tip differs, not necessarily that it is a newer compatible version.
Network/API failures are reported per package and exit nonzero; available updates
alone still exit zero. GitHub requests are unauthenticated and subject to rate
limits. This does not update files, verify upgrade compatibility or build packages.

To refresh all 15 hashes maintained in local package recipes after changing pins
or package versions:

```sh
nix flake update
./regenerate-hashes.sh
./nix-update.sh --no-refresh
```

To regenerate only one package, use `./regenerate-hashes.sh --package herdr-desktop`
(or `-p herdr-desktop`). All source and dependency hashes for that package are
included; `--help` lists the available package names.

`regenerate-hashes.sh` builds each source/Cargo/npm fetch with a placeholder hash,
records Nix's actual hash, then verifies that fetch again. It does not update
versions, inputs, lockfiles or profiles, and does not compile full applications.
A failed fetch or Ctrl-C restores the current hash; earlier verified updates stay.
Review the resulting diff: regenerated hashes trust the bytes fetched now.
Do not edit recipes or run other Nix updates concurrently: placeholders briefly
exist in the checkout. An uncatchable kill or power loss can leave a placeholder;
restore it from Git before retrying.

Scope is local package recipes only. Upstream nixpkgs/flake-owned hashes
(including inherited Herdr Zig dependencies), the host NVIDIA driver hash and
language lockfiles stay with their existing owners. New local hash assignments
require an inventory entry; the script stops rather than silently skipping them.

The initial closure is substantial; cached builds reuse unchanged outputs.
Successful evaluation is not evidence that downloads/builds or GPU checks finished.
Running programs keep loaded code. Reopen applications normally when appropriate;
never kill Herdr holders, restart the compositor or log out agents for migration.

## Opt-in login session (registered; laptop login passed)

**A native launcher path alone is not a safe fallback.** The native SDDM entry
calls `/usr/bin/start-hyprland`, but that launcher can resolve `Hyprland` through
PATH and select the unwrapped Nix compositor. This caused a post-authentication
black screen on kotoko after adopting a Nix-first login PATH. Before profile
adoption changes login-time command resolution, verify a recovery path (prefer
XFCE X11, TTY or authenticated SSH). Keep native packages until the replacement
and recovery path have been validated and removal is separately authorized.

The shared bundle provides:

- `start-nix-hyprland`
- `share/wayland-sessions/hyprland-nix.desktop`, named **Hyprland (Nix)**
- `share/nix-desktop/native-graphics.conf`

Before first login, the three native portal units need the shared
`native-graphics.conf` linked as user drop-ins named
`50-nix-graphics-boundary.conf` under each
`~/.config/systemd/user/xdg-desktop-portal{,-hyprland,-gtk}.service.d/` directory.
The shared Home Manager module declares these links. Both workstations'
package-only adoptions installed the same conflict-backed-up links and ran
`systemctl --user daemon-reload` without restarting services. This keeps
compositor-scoped Nix GPU library overrides out of native portal processes.
Both also adopted font discovery and application-menu links. Future hosts need
the same reviewed integration before first login.

After the profile is built, installed and reviewed, a human must register the
additional session once:

```sh
sudo install -Dm644 \
  "$HOME/.nix-profile/share/wayland-sessions/hyprland-nix.desktop" \
  /usr/share/wayland-sessions/hyprland-nix.desktop
```

Kotoko subsequently registered the correct custom entry and reached a working
Nix desktop; that is not laptop acceptance. On deisslaptop the user registered the
custom entry with sudo; the installed file was verified byte-identical to the
profile source, with the expected Name/Exec. The user then completed a successful
Nix login; the live compositor path was verified in `/nix/store`.
Profile installation alone cannot register SDDM sessions. Copy
**hyprland-nix.desktop**, never the upstream
`hyprland.desktop` under a renamed destination. Inspect the installed destination:

```sh
grep -E '^(Name|Exec)=' /usr/share/wayland-sessions/hyprland-nix.desktop
# Name=Hyprland (Nix)
# Exec=/home/firesquid/.nix-profile/bin/start-nix-hyprland
"$HOME/.nix-profile/bin/start-nix-hyprland" --version
```

A successful non-graphical launcher check is necessary but does not validate a
real seat or login. Do not replace native binaries or restart SDDM during an
active session. At a future planned login, select **Hyprland (Nix)** only after
saving work and verifying recovery. Do not assume the old Hyprland entry works
just because its native packages remain installed.
Review checkout/environment and host graphics selection before that login.
The launcher should reject incompatible/unset graphics rather than guessing a GPU.
Driver repairs may require a TTY and native `/usr/bin/...` tools.

## Verification and rollback

- Evaluate with `nix flake check --no-build --all-systems`; inspect package/session
  contracts before an explicit build. Contracts do not start a compositor or
  authenticate and are not runtime acceptance tests.
- After installation, inspect command resolution in a fresh shell with
  `command -v bun pi ags Hyprland opencode`; inspect actual paths, not just versions.
- Real login, acceleration, PAM lock/unlock, portals, Steam/FHS, audio, suspend and
  monitor behavior remain pending. Preserve the native session for recovery.
- `nix profile history` / `nix profile rollback` concern package generations only,
  not writable config, data, local desktop links or SDDM registration. The older
  Hermes/Herdr generation lacks `start-nix-hyprland`; use the native session.
- Keep private deployment receipts, application backups, native fallbacks and
  old generations until the desktop has been exercised. Do not garbage-collect
  or delete private state to finish a build. Never kill live terminal holders.
