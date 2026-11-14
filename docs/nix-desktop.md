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

### deisslaptop: hardware confirmation required

The GPU configuration is explicitly **unset**. Hardware, driver and graphics
compatibility have **not** been verified. Do not infer AMD, Intel or NVIDIA
hardware from a host name, old install template or monitor preference. Confirm
the actual device/driver and review graphics selection before a graphical rollout.
No remote deployment, activation or working graphics is claimed for this host.

## Deployment status and build/update procedure

**Current state:** kotoko's expanded package profile is built, checked and
installed. User menu entries, the profile font directory and native-portal
boundary drop-ins are linked with private backups. The 40 terminal addresses
present before the switch survived; core executable/PIDs and portal PIDs were
unchanged. No whole-home activation, service restart or compositor cutover occurred.
Fresh shells use Nix first; already running shells/processes retain their previous
environment/code until refreshed normally. The account login shell is unchanged.
Builds alone do not install, log in, restart or test graphics.

Example build from the persistent checkout (choose the host explicitly):

```sh
nix build --max-jobs 2 --cores 20 --no-link .#kotoko-apps
# The other host uses the same inventory, but requires hardware review first:
# nix build --no-link .#deisslaptop-apps
```

After a successful build and reviewed package checks,
`nix profile upgrade kotoko-apps` (or the matching deisslaptop entry) changes the
installed bundle. Check `nix profile list` first; do not add a duplicate output
for an already installed entry. For later dependency updates, `./nix-update.sh`
selects one of the two known workstation host names, updates the lock, builds
before upgrading and refreshes application metadata. Review/commit lock changes.
It never performs OS/Home Manager activation, sudo or restarts.

The initial closure is substantial; cached builds reuse unchanged outputs.
Successful evaluation is not evidence that downloads/builds or GPU checks finished.
Running programs keep loaded code. Reopen applications normally when appropriate;
never kill Herdr holders, restart the compositor or log out agents for migration.

## Opt-in login session (pending privileged registration)

The native SDDM entry uses an absolute native launcher; a Nix-first PATH does not
silently replace the current compositor or next login. The shared bundle provides:

- `start-nix-hyprland`
- `share/wayland-sessions/hyprland-nix.desktop`, named **Hyprland (Nix)**
- `share/nix-desktop/native-graphics.conf`

Before first login, the three native portal units need the shared
`native-graphics.conf` linked as user drop-ins named
`50-nix-graphics-boundary.conf` under each
`~/.config/systemd/user/xdg-desktop-portal{,-hyprland,-gtk}.service.d/` directory.
The shared Home Manager module declares these links. kotoko's package-only
adoption installed the same conflict-backed-up links and ran
`systemctl --user daemon-reload` without restarting services. Future hosts need
the same reviewed adoption before first login. This keeps compositor-scoped Nix GPU library overrides out
of native portal processes. User font discovery and application-menu links were also adopted on kotoko;
these steps remain necessary before deploying another host.

After the profile is built, installed and reviewed, a human must register the
additional session once:

```sh
sudo install -Dm644 \
  "$HOME/.nix-profile/share/wayland-sessions/hyprland-nix.desktop" \
  /usr/share/wayland-sessions/hyprland-nix.desktop
```

**This is not done:** it requires sudo and passwordless sudo is unavailable.
Profile installation alone cannot register SDDM sessions. Do not replace native
binaries or restart SDDM during an active session. At a future planned login,
select **Hyprland (Nix)**; retain the original **Hyprland** entry for fallback.
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
