# Personal Linux configuration

This checkout uses a **Nix flake for userspace on existing Linux hosts**. It does
not install an operating system or manage OS deployment.

- **Shared workstation:** kotoko and deisslaptop use the same desktop runtime,
  applications, development tools and editable configuration, with minor explicit
  host differences. `.#kotoko-apps` and `.#deisslaptop-apps` are thin instantiations
  of the **same inventory**, retaining their names for profile compatibility.
  See [the shared desktop guide](docs/nix-desktop.md).
- **Standalone Home Manager:** the shared workstation home uses current desktop
  Home Manager/Nixpkgs and the same package bundle. Headless/core homes retain
  stable Home Manager. Neither mode changes the kernel, bootloader or services.

**kotoko's shared package profile is installed.** Fresh shells resolve Bun, Pi,
Claude, OpenCode, AGS, Hyprland and editors through `~/.nix-profile/bin`. User
application links, fonts and native-portal graphics boundaries are adopted with
private backups. The live compositor/AGS and services were not restarted.
The Nix GTK widget smoke, Vulkan-rendered test window and Hyprland Lua config
check passed; a real compositor login/lock/suspend cycle remains untested.
SDDM session registration still needs sudo. deisslaptop has not been deployed;
its GPU setting remains explicitly unset until the actual hardware is confirmed.

Start with [the migration guide](docs/nix-migration.md),
[decisions and assumptions](docs/nix-migration-assumptions.md), and
[the historical package mapping](docs/nix-package-mapping.md). Building is not
installation, profile upgrade, Home Manager activation or a graphical test.

## Layout

- `flake.nix`, `flake.lock`: pinned inputs and entry points.
- `nix/hosts.nix`: explicit account, checkout, profile and host GPU selection.
- `nix/packages/workstation-packages.nix`: shared workstation inventory.
- `nix/packages/workstation.nix`: shared bundle/profile builder.
- `nix/graphics/default.nix`: generic graphics wrapper driven by host selection.
- `nix/home/workstation.nix`: shared workstation Home Manager module.
- `nix/profiles/`, `nix/modules/`: core/workstation choices and shared user modules.
- `nix/packages/`: reproducible/adapted application packages.
- `nix/tests/`: package and session contracts, not runtime acceptance tests.
- Existing `dotfiles`, `neovim`, `pi`, `claude`, `hermes`, `herdr`, `opencode`, and
  `ags` directories remain editable sources. Private agent state is not owned.
- `scripts/prepare-home.py`: read-only adoption plan by default; explicit private
  backups and guarded legacy-directory detachment only with `--apply`.

The retired TypeScript configuration engine and engine-only tests have been
removed. Live dotfiles, backups and runtime state remain.

## Workstation package updates (explicit mutation)

```sh
# On a reviewed, known workstation host only:
./nix-update.sh
# Optional build parallelism:
./nix-update.sh --max-jobs 2 --cores 20
```

The updater chooses one of the two known workstation names, updates the flake
lock, builds that host's bundle, then upgrades its user-profile entry only after
a successful build. Review and commit lock/recipe changes. This is an update
procedure for an existing installed entry; it does not adopt another host's home.

No OS activation, wholesale Home Manager activation, sudo, compositor/service
restarts or garbage collection occurs. Running applications retain their old
code. Never kill Herdr holders or log out active agents to complete migration.
The base system, drivers, PAM/Hyprlock, portals, Steam/FHS integration and
privileged services remain native. Keep native fallbacks and private backups.
The separate `start-nix-hyprland` launcher and **Hyprland (Nix)** login session
require reviewed graphics setup and a future planned login; package installation
does not switch the live compositor.

## Standalone home adoption

Enable `nix-command` and `flakes` in your existing Nix configuration, then review
`nix/hosts.nix` before evaluating or building a specific home:

```sh
nix flake check --no-build --all-systems
nix build '.#homeConfigurations."firesquid@minibox-one".activationPackage' --no-link
python3 scripts/prepare-home.py --configuration firesquid@minibox-one
```

These commands do not activate a home or move conflicts by default. Follow the
migration guide for reviewed backup, first switch and rollback; never use sudo
for user-profile/Home Manager commands. Existing workstation editable links stay
in place: the current desktop rollout does not require whole-home activation.

## Validation boundary

Evaluation checks derivations; builds download/compile outputs without testing
login, GPU acceleration, PAM, portals, Steam, suspend or monitor behavior. A full
`nix flake check` can build large package and Home Manager closures. ARM evaluation
is not an ARM runtime test. Current validation includes full flake evaluation,
Nix linting, built shared/profile/graphics/bundle contracts, 457 Bun tests and
9 home-adoption tests. The full Bun run used the installed Bun 1.4.4; its live
Neovim test requires the temporary `/tmp/opencode` parent directory.
