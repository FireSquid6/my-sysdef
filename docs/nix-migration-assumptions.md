# Nix migration: mock grilling and assumed answers

The user asked for self-directed grilling, recommended answers, and implementation
on `nix-migration`, with questions recorded for later review. These are **chosen
assumptions, not user confirmations**. No Nix installation, home adoption, or
Home Manager activation is authorized by this record.

## Original migration decisions

This table records the original stable/configuration-only migration. The current
[shared desktop guide](nix-desktop.md) supersedes its workstation runtime and
agent-package exclusions: kotoko/deisslaptop share one inventory and profile
builder with current desktop Home Manager/Nixpkgs. Headless Home Manager remains
stable. Native services, drivers, PAM/Hyprlock, portals and Steam/FHS remain native.
The expanded shared package profile is now installed on kotoko with backed-up
user launcher/font/portal-boundary adoption. GTK widgets, isolated Vulkan rendering
and Lua config parsing were checked without restarting the live desktop/services.
deisslaptop's GPU remains explicitly unset pending hardware confirmation; there
has been no remote deployment or full compositor/login acceptance test.

| Question / challenge | Chosen answer and rationale | Where to revise |
| --- | --- | --- |
| What deployment boundary? | Userspace packages and standalone Home Manager on existing Linux. Existing machines and root-owned setup must not be reinstalled as an implicit side effect. No OS deployment layer is provided. | `flake.nix`, shared desktop guide |
| Which platforms? | `x86_64-linux` and `aarch64-linux`; no macOS claim. Evaluate both; do not silently pretend proprietary x86 applications run on ARM. | `flake.nix`, package module |
| Which machines and identities? | `firesquid@minibox-one` is inferred headless/core; `firesquid@desktop` and `firesquid@deisslaptop` use workstation. All assume `/home/firesquid/my-sysdef`. ARM output is an example, not discovered hardware. This checkout's ignored config enabled desktop/apps too, so making minibox headless is deliberate and needs review. | `nix/hosts.nix` |
| What release channel? | Verified `nixos-25.11` and HM `release-25.11`, sharing one Nixpkgs input and committing a generated lock. Prefer bounded, reviewable changes over unpinned unstable. | `flake.nix`, `flake.lock` |
| What state version? | Start this new HM deployment at `25.11`. This is a compatibility baseline, not something to bump with each package update. | `nix/modules/default.nix` |
| Store snapshots or editable configuration? | Keep configuration in the persistent checkout via `mkOutOfStoreSymlink`, so agent tools, Neovim lockfiles, and desktop edits remain writable. Packages and generated shell initialization are pinned/snapshotted; dotfile contents are intentionally live. A generation rollback is **not** a rollback of Git edits. | `nix/modules/files.nix`, Git history |
| What replaces local `config.yaml` and providers? | Explicit tracked host/profile selections, default-false options, Nixpkgs packages; no runtime YAML/provider discovery. Machine-specific secrets remain local and outside the flake. | `nix/hosts.nix`, `nix/profiles/` |
| Can missing packages be silently dropped? | No. Explicit translations/exclusions and architecture warnings. Docker 28 in the lock is insecure, so use Docker 29 client-only instead of allowing insecure packages. | `docs/nix-package-mapping.md` |
| Allow nonfree applications? | Yes, to preserve existing selections (Discord, Steam, Spotify, Obsidian, unrar). No insecure-package or unsupported-system bypasses. | `pkgsFor` in `flake.nix` |
| Can stable replace the compositor and shell? | No: stable Hyprland 0.52.2 and AGS 2.3.0 cannot execute the active 0.57+ Lua / AGS 3/Gnim configuration. Preserve compatible native runtimes; install Nix helper tools only and emit evaluation warnings. | Package mapping; future separately pinned compatible inputs |
| Guess GPU hardware or install drivers? | No. Disable HM's automatic generic-Linux GPU bridge by default (also broken on ARM in the pin due to x86-only Intel packages). Review native GPU/nixGL/driver integration before relying on Nix GUI apps. | `targets.genericLinux.gpu`, host-specific module |
| Who owns services, PAM, sessions, login shell and boot? | Native distribution. No sudo activation hooks, `chsh`, service enables, SDDM theme install, Docker daemon, tailscaled, networking daemon, firewall, NTP service, or bootloader changes. Existing services are neither enabled nor disabled. | Host administration, not HM |
| Which agents are installed by Nix? | None of Pi/Claude/Hermes/OpenCode/Herdr itself is newly packaged. Preserve existing installations and manage reviewed configuration/helper dependencies only. Do not introduce moving npm/pip installers into activation. | Agent options and external installation docs |
| What private state is synchronized? | None. Hermes persona/skin/individual vendored skills only, no Hermes config.yaml. Pi live state, sessions, auth, inbox and package state stay local. No whole agent-home or whole Hermes-skills link. Herdr/OpenCode use granular shared entries, leaving the application root local. | File module allowlist |
| How do environment overrides work? | Explicit home-relative `personal.paths.*` options replace impure evaluation of environment variables. HM exports matching `PI_CODING_AGENT_DIR`, `CLAUDE_CONFIG_DIR`, `HERMES_HOME`, `HERDR_APP_HOME`. Nondefault XDG roots require module edits/review; nothing reads the invoking shell's XDG variables during evaluation. | `nix/modules/default.nix` |
| Preserve `~/sysdef` assumptions? | No: `SYSTEM_CONFIG_DIR`/`SCRIPTS_DIR` are generated from the explicit checkout, Lua uses that environment with `~/my-sysdef` fallback, Fish no longer adds legacy sysdef/bin, and Bash uses `$HOME` for Fly/OpenCode. Existing variable names remain compatibility APIs for scripts. | Shell module and shared shell/Lua files |
| How are shell files handled? | HM generates Bash/Fish login/session-variable plumbing and includes existing interactive snippets. Fish's direnv hook is supplied exactly once by HM; Bash retains its existing hook. Vendor completions stay enabled; generating completions from every package's manpages is disabled to keep configuration-only builds small. No forced `SHELL` export or change to the account's login shell. | `nix/modules/shell.nix` |
| Overwrite old links automatically? | Never. `force` stays false. Adoption is dry-run-first; `--apply` renames conflicts into a private local backup. Known legacy Herdr/OpenCode root symlinks require a second explicit flag after apps are stopped; materialization preserves local runtime files without moving tracked checkout files. Unknown symlink ancestors block. | `scripts/prepare-home.py` |
| Keep the old engine? | Removed after the application migration: engine/providers/root modules, local engine metadata, development-copy scripts and engine-only tests. Editable application configs, runtime names/state and Git history remain. This does not imply whole-home activation or OS deployment. | Git history, `README.md` |
| Automatically install, adopt, switch, uninstall old packages, or push? | No. Validate/build only in temporary tool/cache directories; no user profile mutation or credential/runtime synchronization. Native packages may coexist during staged migration and are not automatically removed. | Migration guide |

## Review before the first real switch

1. Confirm minibox is intended to be headless and verify actual desktop/laptop names,
   CPU architectures, username, home, and checkout location.
2. Approve the nonfree package policy and the explicit host-only/external package
   list. The legacy i3 assets remain available, but the pinned desktop group does
   not install a complete i3 session either.
3. Verify compatible Hyprland/AGS/PAM/portal/native GPU setup on workstations.
4. Verify external AI/Herdr executables are installed and their application paths
   agree with `personal.paths` and the process environment after a fresh login.
5. Review the adoption inventory, stop Herdr/OpenCode before detaching their root
   links, retain backups, and do a build before moving any conflicts.

## Historical verification boundary

The following records earlier migration validation, not the current shared desktop
checks. Current build/runtime observations are recorded in the shared desktop guide.

At that stage, actual Nix evaluation was performed using a disposable rootless nix-portable tool
and store under temporary directories, not a system Nix install. The initial
`/tmp` store hit a tmpfs user quota; validation was moved to `/var/tmp` without
installing `/nix` or activating anything. See the migration guide for the final
commands/results. Live graphical startup, native GPU behavior, service setup,
and a real home switch remain deliberately untested until authorized.
