# Personal Linux configuration

This checkout now uses a **Nix flake + standalone Home Manager** instead of
sysdef. It manages user packages, shell setup, and selected editable dotfiles on
an existing Linux distribution. It is **not NixOS** and does not change your
bootloader, kernel, display manager, system services, firewall, or login shell.

**No installation or activation is automatic.** Start with
[the migration guide](docs/nix-migration.md) and review
[the mock-grilling decisions and assumptions](docs/nix-migration-assumptions.md).
The [package mapping](docs/nix-package-mapping.md) explicitly lists substitutions,
external dependencies, and host-only exclusions.

## Layout

- `flake.nix`, `flake.lock`: pinned Nixpkgs/Home Manager and entry points.
- `nix/hosts.nix`: explicit username, home, architecture, checkout, and profile.
- `nix/profiles/{core,workstation}.nix`: headless/core vs graphical selections.
- `nix/modules/`: packages, file ownership, and shell/session environment.
- Existing `dotfiles`, `neovim`, `pi`, `claude`, `hermes`, `herdr`, `opencode`, and
  `ags` directories remain the editable sources. No private agent state is owned.
- `scripts/prepare-home.py`: read-only adoption plan by default; explicit backups
  and guarded legacy-directory detachment only with `--apply`.
- `modules/`, `providers/`, `sysdef-src/`, and `sysdef-*.json`: retained historical
  implementation/test fixtures, **not the active configuration engine**. The old
  `bin/sysdef` entry point is retired. Do not run both managers over the same files.

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

Desktop caveat: the pinned release's Hyprland/AGS are too old for this checkout's
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

`nix flake check` without `--no-build` builds all selected Home Manager generations
(and is considerably larger). ARM evaluation is not an ARM runtime test.
