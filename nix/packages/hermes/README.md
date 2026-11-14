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

The application identity remains `com.nousresearch.hermes` (including
`com.nousresearch.hermes.desktop` and `StartupWMClass`). No credentials or user
configuration are copied into the store. Existing configuration remains runtime
state. Do not use the mutable application updater to update the Nix package.

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
