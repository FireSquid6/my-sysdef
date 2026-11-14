# Hermes desktop

The root flake's `hermes` input uses `firesquid6/hermes-agent`, pinned in
`flake.lock`. Import this wrapper with
`import ./nix/packages/hermes { inherit pkgs; upstream = inputs.hermes; }`.
It exports both `hermes` and `hermes-desktop`, plus the fork's XDG desktop entry
and icon. The existing Hyprland startup command `hermes desktop` is preserved.
Only that subcommand is intercepted; other commands go to the Nix agent.

## Dependency ownership

The fork's own committed dependency lock is retained: its default package builds
Python dependencies and its `hermesDesktop` builds the Electron renderer, native
node-pty, icons and desktop integration together. These inputs deliberately do
not follow the host's nixpkgs. The host's `pkgs` provides only the compatibility
wrapper, package join and test. The package version is inherited from the fork,
not forced to the historical upstream `0.23.1` release. The fork currently
reports the packaging default `0.0.0`; `flake.lock` identifies the exact revision.

There is no activation hook, user-checkout dependency, pip/uv/npm invocation,
or installer in our launcher. Desktop startup directly executes the prebuilt
desktop instead of the source-install `hermes desktop` builder. Optional
integrations retain the fork's behavior; this does not guarantee arbitrary
user-added plugins or on-demand integrations work offline.

The desktop entry remains `com.nousresearch.hermes.desktop`, with
`StartupWMClass=com.nousresearch.hermes`. The current fork's inner Electron
window advertises Wayland class `hermes` in the live kotoko check; the host
bundle adjusts its desktop entry's `StartupWMClass` accordingly. Do not assume
the desktop-file identity guarantees that compositor class. No credentials or user
configuration are copied into the store. Existing configuration remains runtime
state. Do not use the mutable application updater to update the Nix package.

## Shared workstation deployment and systemd hooks

`kotoko-apps` and `deisslaptop-apps` instantiate the same inventory with explicit
host graphics selection. kotoko uses its matching NVIDIA bridge for CLI/desktop
launch paths; deisslaptop's GPU is unset pending confirmation. See
[the shared desktop guide](../../../docs/nix-desktop.md). The expanded profile
is still building, not activated; kotoko retains the older Hermes/Herdr bundle.
No new desktop runtime/GPU test or deisslaptop deployment is claimed.
The base package also exports `hermes-gateway-stop-mark` and
`hermes-gateway-cgroup-cleanup`. These execute the fork's existing modules with
its packaged Python closure. The CLI wrapper also supplies the native Opus
library needed by Discord's ctypes codec loader (`checks.hermes-opus` exercises
that loader without connecting to a service). Local systemd drop-ins retain graceful stopping
without depending on a mutable checkout/venv. Never invoke the cleanup helper as
a general shell smoke test: it is intended for the gateway service cgroup.

## Updates and validation

```sh
nix flake update hermes
nix build --no-link .#hermes
nix build --no-link .#checks.x86_64-linux.hermes-launcher
python3 nix/packages/hermes/test_launcher.py
```

The launcher tests cover argument forwarding, desktop dispatch, no-argument
invocation and exit-status preservation. A full package build also builds the
fork's agent and Electron desktop; launcher tests alone do not validate those.
