# Moving from sysdef to Nix + Home Manager

## Scope and current status

**This guide covers the standalone Home Manager outputs.** For a fresh NixOS
installation with the native Hyprland/AGS runtime, services and expanded package
inventory, use [the NixOS desktop guide](nixos-desktop.md). Its
`nixosConfigurations.deisslaptop` output is separate from the outputs below.

The flake is the new configuration entry point. The old TypeScript engine is
retained for comparison/tests, not used by the new system. No native packages
are removed. No Nix installation, real home adoption, or Home Manager switch has
been performed as part of this migration.

Read [assumptions](nix-migration-assumptions.md) before deploying and
[the complete legacy package mapping](nix-package-mapping.md) for exclusions.
This is **standalone Home Manager on existing Linux**, not an OS conversion.

## Application-only migration on an existing Linux desktop

To move only Hermes and Herdr to Nix, use the root flake's package outputs;
there is no need to activate Home Manager or switch to NixOS. The inputs pin
`firesquid6/hermes-agent`, `firesquid6/herdr-core` and `firesquid6/herdr-app`.
Run from the persistent checkout after installing Nix and enabling flakes:

```sh
# Build first. This does not replace running applications or their binaries.
nix build --max-jobs 2 --cores 2 --no-link .#hermes .#herdr-core .#herdr-desktop
# Explicitly install the validated outputs in the user's profile (never sudo).
nix profile add .#hermes .#herdr-core .#herdr-desktop
```

Verify `~/.nix-profile/bin/{hermes,hermes-desktop,herdr-core,hc,herdr-app}`
before redirecting launchers. Existing `~/.local/bin` launchers and desktop
entries can shadow the profile. Back them up before replacing them; stable
links to `~/.nix-profile/bin/<command>` follow subsequent profile generations.
Keep the original source/venv installs for rollback, and do not stop an active
Herdr core or terminate agent sessions to change future launch resolution.
Running processes keep their old code until deliberately restarted. Hermes
systemd units with absolute venv paths also need a separately reviewed migration;
installing the CLI package does not rewrite or restart them.

Native GPU/Wayland compatibility still needs validation on non-NixOS hosts;
a successful build or `--version` check is not a graphical startup test. No
credentials, application homes, sessions, or runtime databases need moving for
this package-only migration. In particular, do not detach the legacy Herdr or
OpenCode directory links unless separately adopting the Home Manager files.

### kotoko (EndeavourOS, RTX 5070)

This host uses **one** installed profile entry, `.#kotoko-apps`, rather than the
three bare packages above. `nix/packages/kotoko-apps.nix` joins the same fork
packages with a pinned nixGL bridge for the verified native NVIDIA **615.78.08**
module. It installs userspace libraries only, not a kernel driver. Both command
and desktop-entry launch paths use the graphics wrappers; non-desktop Hermes
commands, including gateway/dashboard services, do not enable graphics wrappers.

```sh
nix build --max-jobs 2 --cores 2 --no-link .#kotoko-apps
nix profile add .#kotoko-apps  # initial install only
# After reviewing fork/dependency pin updates and rebuilding:
nix profile upgrade kotoko-apps
```

Do not use this host output on another GPU/driver configuration. After a native
NVIDIA update, review `/proc/driver/nvidia/version` and update the version and
verified archive hash in the host recipe **before** launching these applications.
The pinned nixGL source has two explicit compatibility patches for this nixpkgs
pin: the removed `kernel` argument and renamed Vulkan ICD JSON. Hermes selects
OpenGL for its outer Electron process on Wayland. In the isolated graphical test,
both Electron processes reported RTX 5070 hardware compositing; its inner process
still emitted GBM-sandbox/Vulkan-on-Wayland warnings. No GPU sandbox was disabled.

The local `.local/bin` commands and canonical desktop entries point to the Nix
profile. Hermes gateway/dashboard units use local `service.d/nix.conf` overrides
for profile executables and the Nix-packaged stop/cleanup hooks. Credentials,
ports, restart policy and application homes remain unchanged. These host-local
overrides are not a Home Manager activation. Original launchers/units and desktop
userdata/SQLite backups are recorded in the private deployment receipt directory:
`~/.local/state/sysdef-nix-migration.SUkXDMI7/`.

The live core was handed over with the **explicit Nix** `hc server restart`, not
`stop`, `--fresh` or a release downloader. All 20 existing terminals and their
holder survived; holders drain naturally and must not be killed to replace their
old executable. Herdr's GUI and Hermes' GUI/services were then started from Nix.

For updates, review `nix flake update hermes herdr-core herdr-app`, rebuild, then
use `nix profile upgrade` with the entry names shown by `nix profile list`.
Use `nix profile history` and `nix profile rollback` for installed package
rollback; these do not roll back application data, local launcher/unit overrides,
or writable config files. Restore original launchers/units only after reviewing
`backup-manifest.json`; stop the affected GUI/service normally before restoring
its data, and never kill a live Herdr holder.

## 1. Review identity and boundaries

Edit `nix/hosts.nix` if necessary:

| Output | Architecture | Selection |
| --- | --- | --- |
| `firesquid@minibox-one` | x86_64 Linux | Core/headless (an assumption; current legacy YAML also enabled desktop/apps) |
| `firesquid@desktop` | x86_64 Linux | Workstation |
| `firesquid@deisslaptop` | x86_64 Linux | Workstation |
| `firesquid@aarch64-linux` | ARM Linux | Explicit portable core example, not discovered hardware |

Each specifies the Unix user, home directory, and **persistent writable checkout**.
The checkout is currently `/home/firesquid/my-sysdef`, not `~/sysdef`. Flake purity
means another machine's `$HOME`/`hostname`/environment never silently selects a
profile. Do not switch a profile for a different account.

`personal.modules.<group>.enable` options default false. Profiles select package
and file groups explicitly. The new spelling is `systemUtilities` rather than
`system-utilities`. Agent configuration uses `personal.agents.<name>.enable`;
Herdr uses `personal.herdr.enable`, which also enables its helper packages.

Standalone HM cannot enable native services, install a session/bootloader, add
PAM integration or Docker groups, set the account login shell, or grant access
to system daemons. Retain your existing host configuration. `kotoko` is host-only.
The i3 files are retained, but a complete i3 session is not provisioned by the
new desktop package group.

## 2. Install Nix deliberately

If Nix is absent, follow the [official installation instructions](https://nixos.org/download/)
for the distribution. Review the installer first. Installation may require root
and is a **separate explicit action**, not something this repo runs for you.
Use a supported current Nix version. Enable these features in your existing Nix
configuration (for example, `~/.config/nix/nix.conf`); merge, don't overwrite it:

```ini
experimental-features = nix-command flakes
```

Do not run Home Manager or the preparation script with `sudo`.
Temporary nix-portable was used for validation, but its virtual store is **not**
the recommended persistent Home Manager deployment.

## 3. Evaluate and build before touching conflicts

From the persistent checkout:

```sh
nix flake metadata
nix flake check --no-build --all-systems
nix build '.#homeConfigurations."firesquid@minibox-one".activationPackage' --no-link
```

Replace the configuration name explicitly for a workstation. Evaluation covers
all four outputs and all optional groups on both architectures. `--no-build`
checks derivations, not package compilation. Building an activation package
creates store outputs only; it does not run activation. Full core/workstation
closures can be large (JDK, Python/Qt, browsers, fonts, etc.).

### Graphical compatibility is not automatic

- The active Lua config needs **Hyprland 0.57+**; the pin has 0.52.2.
- The AGS code needs **AGS 3 + GJS + GTK4 + Astal + Gnim**; the pin has AGS 2.3.0.
- Workstation modules deploy config/helper tools, emit warnings, and retain those
  compatible native runtimes. They do not install the wrong versions or start a
  second shell/session. Keep portal, PAM locker, and matching compositor tools
  native as documented in the package mapping.
- Native GPU details were not provided. HM's default generic-Linux GPU bridge
  is disabled, avoiding guessed drivers and its ARM evaluation failure in this
  pin. Review GPU integration before using Nix GUI applications; on appropriate
  x86 hosts `targets.genericLinux.gpu.enable = true` provides HM's bridge, but
  setup/driver compatibility must still be reviewed and performed explicitly.
  Other hosts may need a pinned nixGL solution. No NVIDIA version is guessed.

Pi, Claude, Hermes, OpenCode and Herdr executables remain externally installed;
this migration shares their selected configuration, not installers or private data.

## 4. Preview adoption (read-only)

```sh
python3 scripts/prepare-home.py --configuration firesquid@minibox-one
# Equivalent packaged command, once Nix is available:
nix run .#prepare-home -- --configuration firesquid@minibox-one
```

The script evaluates a manifest from the same `home.file` inventory Home Manager
will use. It includes generated shell files, not just custom links. It reports
absent, already-HM-managed, and backup candidates. It validates account, HOME,
checkout sources, relative paths, overlaps and directory symlinks before moving
anything. You can review a manifest separately, without Python invoking Nix:

```sh
nix eval --json '.#homeConfigurations."firesquid@minibox-one".config.personal.migrationManifest' > /tmp/home-manifest.json
python3 scripts/prepare-home.py --manifest /tmp/home-manifest.json
```

A legacy Herdr/OpenCode root symlink produces exit **2** and a blocker. This is
intentional: blindly moving child links through it could mutate tracked files.
Only recognized roots pointing at this checkout can be detached automatically.
Unknown symlink ancestors fail closed and need manual review.

## 5. Back up/adopt explicitly, then switch explicitly

First stop affected Herdr/OpenCode processes if their legacy roots need
detachment. Do not detach Herdr from an actively needed Herdr terminal: use an
independent TTY/SSH shell so application shutdown does not interrupt adoption.
Keep a recovery shell open. Preview the detachment:

```sh
python3 scripts/prepare-home.py --configuration firesquid@minibox-one --detach-legacy-dirs
```

After reviewing the output and completing the build, the following commands are
**mutating and must be invoked deliberately by you**, not by an automated agent:

```sh
# Use --detach-legacy-dirs only when the preview requires it and apps are stopped.
python3 scripts/prepare-home.py --configuration firesquid@minibox-one --detach-legacy-dirs --apply
nix run .#home-manager -- switch --flake '.#firesquid@minibox-one'
```

Without legacy root links, omit `--detach-legacy-dirs`. `--apply` only moves
unmanaged conflicts into a private backup under
`~/.local/state/home-manager-migration/<timestamp>-<id>/`; it does not install,
activate, uninstall, launch applications, or change focus. It uses flat `objects/`
slots and a private `manifest.json` journal mapping slots back to original paths.
Regular files and directory symlinks are renamed, not dereferenced or deleted.
Already-HM-managed links remain for HM's own generation cleanup.

Detachment copies the known legacy application's root into a private staging
directory, preserving local state and symlinks, then replaces the root symlink
with a local directory. Only managed entries are moved aside afterward. Source
checkout files are never moved. Sockets/FIFOs/devices are deliberately not copied
and are listed in the journal; restart the application after activation. Never
check these backups or application state into Git or feed them into a flake.

Interrupted adoption can leave some conflicts already backed up: inspect all
journals before retrying. Resources/backups are retained, not automatically
rolled back or garbage-collected. Run the preview again; new backups have unique
names. Stop applications/concurrent configuration writers during adoption; this
is not a transactional online migration against hostile filesystem changes.

Start a fresh login shell afterward. HM supplies session variables and writable
source paths; Fish/Bash initialization preserves existing interactive behavior.
No account shell is changed. The active Lua config uses `SYSTEM_CONFIG_DIR` and
includes the Nix profile on its PATH. If a display manager does not read `.profile`,
arrange the native session's environment explicitly before launching Hyprland.

## 6. Ownership, edits and future changes

- Edit the original tracked sources, not the generated shell files. Home Manager
  uses out-of-store links for writable config. Git controls their contents;
  generations control package versions and file ownership, not live file contents.
- `personal.paths.{pi,claude,hermes,herdr,opencode}` are home-relative overrides.
  Set them in a host module and keep the process environment consistent. The
  standard layout assumes `~/.config`; other XDG layouts need explicit review.
- Pi auth, sessions, npm installs, snapshots/inbox/receipts and local registries
  remain outside managed entries. Hermes only owns SOUL, skin, the 27 individual
  vendored AI Hero skills/license, and Impeccable/assets. Hermes runtime
  `config.yaml`, credentials, sessions, memory, databases and caches stay local.
- Herdr/OpenCode root directories remain local. Only tracked shared children are
  linked; runtime databases, sockets, auth, updater metadata and other skill
  namespaces are not owned. Never turn an application home into a whole-root link.
- The exported `homeManagerModules.default` can be imported by another flake;
  provide username, homeDirectory, personal.checkout and explicit group choices.
- Keep old native packages until the new profile is verified; removal is a later
  manual host-management step. Do not run the legacy sysdef writer concurrently.

To update pins deliberately: `nix flake update`, review `flake.lock`, recheck the
package compatibility table and run the checks/builds before switching. Do not
bump `home.stateVersion` just because a channel changed. New files must be tracked
by Git before a Git-backed flake can see them.

## 7. Recovery

After a successful switch, use `home-manager generations` and run the chosen old
generation's `activate` executable to roll back. `home-manager` is installed by
the profile, or invoke it through `nix run .#home-manager -- generations`.

For first-adoption recovery without a usable generation, inspect the backup's
`manifest.json`. Stop affected applications. Restore individual recorded objects
by renaming them to their recorded home-relative targets **only after inspecting
and moving aside any newly generated destination**; do not blindly overwrite.
Restore leaf objects before restoring an original legacy root symlink. A detached
local root can contain newer private state: preserve that directory separately
before replacing it with its backed-up symlink. Retain the backup until verified.
No restore or delete command is automatically run for you.

A generation rollback cannot reverse edits to writable checkout files, an
application's runtime data, a Git checkout, or native service/package changes.
Use Git/backups appropriate to those separate responsibilities.

## Validation performed on this branch

- Generated `flake.lock` using actual Nix fetching, not guessed hashes.
- `nix flake check --no-build --all-systems`: all profiles and optional groups
  evaluated successfully on both supported architectures.
- **9 Python adoption tests passed**, both directly and as a Nix build check.
  They cover read-only planning, private backups, leaf/root symlinks, unknown
  ancestors, nested legacy roots, path escapes/overlaps, missing sources,
  runtime preservation and special-file handling.
- Built `prepare-home` and the minibox generated `config.home-files` output
  successfully, without activation. Full activation closures were evaluated,
  not built; building full package closures remains the pre-switch step above.
- Nix formatting, Statix and Deadnix passed. Existing Bun suite: **517 passed,
  0 failed**; focused branchfork typecheck passed.
- Real minibox manifest evaluated; a read-only preview found the expected legacy
  Herdr/OpenCode root links and stopped with exit 2. No real files were adopted.
- No real activation, graphical login, service change, GPU test or ARM execution
  is claimed. Validation build/suite results are reported with the branch handoff.
