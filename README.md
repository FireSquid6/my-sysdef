# Personal Linux configuration

This checkout uses a **Nix flake** instead of sysdef, with two deployment modes:

- **NixOS Hyprland workstation:** `nixosConfigurations.deisslaptop` recreates the
  native desktop, services, applications and developer tools, with integrated
  Home Manager. No Xfce, LightDM, EndeavourOS utilities or Trayscale. Start with
  [the NixOS desktop guide](docs/nixos-desktop.md), especially its required
  storage/account/checkout decisions.
- **Standalone Home Manager:** the existing `homeConfigurations` manage user
  packages, shell setup and selected editable dotfiles on another Linux distro.
  These outputs do not change the kernel, bootloader or host services.

**No installation or activation is automatic.** Start with
[the migration guide](docs/nix-migration.md) and review
[the mock-grilling decisions and assumptions](docs/nix-migration-assumptions.md).
The [package mapping](docs/nix-package-mapping.md) explicitly lists substitutions,
external dependencies, and host-only exclusions.

## Layout

- `flake.nix`, `flake.lock`: pinned Nixpkgs/Home Manager and entry points.
- `nix/hosts.nix`: explicit username, home, architecture, checkout, and profile.
- `nix/profiles/{core,workstation}.nix`: headless/core vs graphical selections.
- `nix/modules/`: shared user packages, file ownership, and shell/session environment.
- `nix/nixos/`: native desktop/services and the fresh-install host template.
- `nix/home/`: integrated workstation application/development/appearance modules.
- `nix/packages/`: reproducible packages missing from Nixpkgs and adapted upstream packages.
- `nix/tests/`: evaluated desktop inventory and session contract.
- Existing `dotfiles`, `neovim`, `pi`, `claude`, `hermes`, `herdr`, `opencode`, and
  `ags` directories remain the editable sources. No private agent state is owned.
- `scripts/prepare-home.py`: read-only adoption plan by default; explicit backups
  and guarded legacy-directory detachment only with `--apply`.
- The retired TypeScript configuration engine, providers, local selection/state
  files and engine-only tests have been removed. Live dotfiles and runtime state
  remain; the `sysdef` repository/AGS instance name is not a second package manager.

## Updating the installed applications on kotoko

```sh
./nix-update.sh
# Optional parallelism overrides:
./nix-update.sh --max-jobs 2 --cores 20
```

This updates every input in this checkout's flake lock, builds `.#kotoko-apps`
(reusing unchanged/cached packages), then upgrades the installed `kotoko-apps`
profile entry. A failed build stops before the profile upgrade. Review and commit
`flake.lock`; dependency changes may require reviewed recipe/version/vendor-hash
updates before the build succeeds. Reopen app windows normally afterward; services
keep their current processes until explicitly restarted. Never kill core holders.

**This is not an OS updater:** kotoko still runs EndeavourOS and has only an
application-level Nix deployment. Its host packages remain managed by `pacman`.
The script does not activate NixOS/Home Manager, run sudo, or garbage-collect.

## After installing Nix explicitly

Enable `nix-command` and `flakes` in your existing Nix configuration, then:

```sh
# Verify/edit nix/hosts.nix before selecting a profile.
nix flake check --no-build --all-systems
nix build '.#homeConfigurations."firesquid@minibox-one".activationPackage' --no-link
python3 scripts/prepare-home.py --configuration firesquid@minibox-one
```

The build installs nothing into your active profile. The last command does not
move files by default. Follow the guide for backup, first switch, and rollback.
Do **not** run the commands with `sudo`.

**Standalone Home Manager caveat:** its pinned release's Hyprland/AGS are too old for this checkout's
**Hyprland 0.57+ Lua / AGS 3** config. Those runtimes remain host-managed; selecting
the workstation profile does not silently install incompatible replacements.
Non-NixOS GPU integration also needs a host-specific review.

## Checks

```sh
python3 test/prepare_home_test.py
bun test
bun run scripts/typecheck-branchfork.ts
nix flake check --no-build --all-systems
nix build .#checks.x86_64-linux.migration-tests --no-link
```

`nix flake check` without `--no-build` now also builds the complete NixOS system,
all selected Home Manager generations, and package checks; it is considerably
larger. ARM evaluation is not an ARM runtime test. The complete NixOS desktop
inventory is currently x86_64-only.
