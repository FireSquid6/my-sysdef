# Bounded legacy package translation

This document describes the **original standalone Home Manager translation**.
The [shared workstation bundle](nix-desktop.md) supersedes the historical
runtime/application exclusions below for both kotoko and deisslaptop, including
the shared workstation Home Manager module. Its single inventory is
`nix/packages/workstation-packages.nix`, instantiated by
`nix/packages/workstation.nix`; host GPU selection lives in `nix/hosts.nix` and
wrapping in `nix/graphics/default.nix`. Headless Home Manager remains stable.
Native services, PAM/Hyprlock, portals, drivers and Steam/FHS remain host-owned.
The expanded profile is installed on kotoko; shared/profile/graphics/bundle
contracts and isolated GTK/Vulkan/config checks passed. Live compositor cutover
and real login/lock/suspend checks remain pending. deisslaptop's unverified GPU
selection is explicitly unset, and it has not been deployed.

`nix/modules/packages.nix` is a standalone Home Manager **user package** module,
not an OS deployment configuration. It targets `x86_64-linux` and `aarch64-linux`. Every
`personal.modules.<group>.enable` declared here defaults to **false**:
`applications`, `desktop`, `development`, `systemUtilities`, `fonts`, `gamedev`,
`network`, `ags`, and `herdr`. Legacy `system-utilities` becomes `systemUtilities`.
File selection lives in `nix/modules/files.nix`; the corresponding group options
select both packages and shared configuration. Nothing starts an application.
`kotoko` has no user package group: its entire legacy list belongs to host boot
configuration. Package-free `claude`, `hermes`, `opencode`, and `pi` are covered by
the file layer, not invented package installs. External application executables
and additional plugin-specific tools such as Claude hooks' `jq`/Fleet must already
be available (see each application's README); this module does not invent their
installation or silently run npm/pip updaters.

## Release inputs and evidence

The original stable input branches were verified with `git ls-remote --heads`
at migration time. This is historical source-audit evidence, not the current
desktop input/version inventory:

| Input | Actual remote ref | Observed commit |
| --- | --- | --- |
| nixpkgs | `https://github.com/NixOS/nixpkgs.git`, `refs/heads/nixos-25.11` | `b6018f87da91d19d0ab4cf979885689b469cdd41` |
| Home Manager | `https://github.com/nix-community/home-manager.git`, `refs/heads/release-25.11` | `3ee51fbdac8c8bdfe1e7e1fcaba6520a563f394f` |

The original stable translation used `github:NixOS/nixpkgs/nixos-25.11` and
`github:nix-community/home-manager/release-25.11`, with HM's nixpkgs input
following the parent nixpkgs input. These are verified refs, **not** guessed
versions or additional derivation pins. The parent's `flake.lock` is the actual
reproducibility boundary; the source audit below used the observed nixpkgs commit.
Recheck versions/platforms when updating it.

The parent imports `pkgs` with `config.allowUnfree = true` for the existing
nonfree applications (Discord, Steam, Spotify, Obsidian, unrar). This module does
not override that policy, permit insecure packages, or enable unsupported systems.

Primary-source audit (raw upstream files were fetched, not package-search snippets):

- [Top-level attributes and aliases](https://raw.githubusercontent.com/NixOS/nixpkgs/b6018f87da91d19d0ab4cf979885689b469cdd41/pkgs/top-level/all-packages.nix)
  and [removed/renamed attributes](https://raw.githubusercontent.com/NixOS/nixpkgs/b6018f87da91d19d0ab4cf979885689b469cdd41/pkgs/top-level/aliases.nix).
- For ordinary by-name attributes, the exact source convention at that commit is
  `https://raw.githubusercontent.com/NixOS/nixpkgs/b6018f87da91d19d0ab4cf979885689b469cdd41/pkgs/by-name/<first-two-characters>/<attribute>/package.nix`.
  This was checked for the by-name packages used below, including `nanorc`,
  `_7zz`, `usb-modeswitch`, `networkmanagerapplet`, fonts and desktop helpers.
  Older/non-by-name attributes are wired by `all-packages.nix` above.
- [Tailwind 4 CLI](https://raw.githubusercontent.com/NixOS/nixpkgs/b6018f87da91d19d0ab4cf979885689b469cdd41/pkgs/by-name/ta/tailwindcss_4/package.nix)
  is **4.1.18**; [TypeScript](https://raw.githubusercontent.com/NixOS/nixpkgs/b6018f87da91d19d0ab4cf979885689b469cdd41/pkgs/by-name/ty/typescript/package.nix)
  is **5.9.3**. Use `pkgs.tailwindcss_4` and `pkgs.typescript`, not guessed
  `nodePackages` paths or global Bun/npm installation hooks.
- [Python package attributes](https://raw.githubusercontent.com/NixOS/nixpkgs/b6018f87da91d19d0ab4cf979885689b469cdd41/pkgs/top-level/python-packages.nix)
  expose `defusedxml`, `packaging`, and `pyqt6`; use one
  `python3.withPackages` environment so these are importable by its interpreter.
  Top-level `jdk25` explicitly selects OpenJDK 25 (the unqualified `jdk` is 21).
  `nodejs` includes npm; it is not a separate guessed `npm` attribute.
- [Discord platform metadata](https://raw.githubusercontent.com/NixOS/nixpkgs/b6018f87da91d19d0ab4cf979885689b469cdd41/pkgs/applications/networking/instant-messengers/discord/default.nix),
  [Spotify platform metadata](https://raw.githubusercontent.com/NixOS/nixpkgs/b6018f87da91d19d0ab4cf979885689b469cdd41/pkgs/by-name/sp/spotify/package.nix),
  and [Steam binary metadata](https://raw.githubusercontent.com/NixOS/nixpkgs/b6018f87da91d19d0ab4cf979885689b469cdd41/pkgs/by-name/st/steam-unwrapped/package.nix)
  constrain these Linux desktop applications to x86_64. The explicit architecture
  split emits a warning on ARM; it does not silently filter arbitrary attributes.
  [Obsidian](https://raw.githubusercontent.com/NixOS/nixpkgs/b6018f87da91d19d0ab4cf979885689b469cdd41/pkgs/by-name/ob/obsidian/package.nix)
  explicitly supports both Linux architectures.
- [Hyprland](https://raw.githubusercontent.com/NixOS/nixpkgs/b6018f87da91d19d0ab4cf979885689b469cdd41/pkgs/by-name/hy/hyprland/package.nix)
  is **0.52.2**. The tracked `dotfiles/hypr/README.md` says the active config is
  `hyprland.lua`, requiring **0.57+**, not legacy `hyprland.conf`.
- [AGS](https://raw.githubusercontent.com/NixOS/nixpkgs/b6018f87da91d19d0ab4cf979885689b469cdd41/pkgs/by-name/ag/ags/package.nix)
  is **2.3.0**, not the tracked shell's AGS 3 API. GTK4 support alone does not
  make AGS 2 compatible with AGS 3/Gnim imports.
- [Nerd Fonts generator](https://raw.githubusercontent.com/NixOS/nixpkgs/b6018f87da91d19d0ab4cf979885689b469cdd41/pkgs/data/fonts/nerd-fonts/default.nix)
  and its [font manifest](https://raw.githubusercontent.com/NixOS/nixpkgs/b6018f87da91d19d0ab4cf979885689b469cdd41/pkgs/data/fonts/nerd-fonts/manifests/fonts.json)
  establish `nerd-fonts.jetbrains-mono`.

## Boundary and runtime prerequisites

- All package groups use `lib.mkMerge` / `lib.mkIf` and explicit `home.packages`
  lists. No blanket `builtins.hasAttr` / availability filtering. Missing or renamed
  attributes should fail evaluation and trigger a mapping update.
- No root services, systemd service enablement, bootloader, display manager,
  firewall changes, daemon activation or network-changing commands. Docker,
  Tailscale, NetworkManager and SSH **clients** require separately managed native
  host facilities as appropriate. Installing a package that also contains a
  daemon does not start it. Diagnostic tools may require privileges when invoked;
  no privilege rules are installed here.
- **Graphical runtime remains host-managed.** `desktop.enable` supplies helpers
  and a font, not a working Hyprland session. Supply Hyprland **0.57+**, its matching
  ecosystem/portal, native GPU/Wayland setup and PAM-backed locker through the
  host's normal package management. Stable's compositor is knowingly too old;
  there is no automatic unstable overlay or guessed source derivation. Its
  hyprlock 0.9.2 / hypridle 0.1.7 also differ from the README's tested 0.9.7 /
  0.1.8, so these stay native with the session rather than claiming compatibility.
- **AGS is config + helper tools only.** Read `ags/README.md` and `ags/app.tsx`:
  the sources import `ags/gtk4/app`, `ags/gtk4`, and AGS 3 reactive/Gnim APIs.
  The README records Arch `aylurs-gtk-shell 3.1.2-1` (CLI 3.1.0). Root
  `package.json` has no AGS runtime dependency and there is no `ags/package.json`
  supplying one. Supply a compatible external **AGS 3 + GJS + GTK4 + Astal +
  Gnim** distribution with its matching libraries, typelibs and import paths.
  `ags.enable` deliberately never installs `pkgs.ags` or a pile of GI libraries
  pretending to be that runtime. The separate file layer can link `ags/`, but
  cannot make it runnable alone. No automatic AGS launch is configured by this
  package module. Its warning is intentional. For type generation outside Arch,
  follow the README's `AGS_PACKAGE_DIR` instruction.
- Standalone HM cannot guarantee native graphics/PAM interoperability or host
  daemon availability. It also does not install Herdr/Hermes/Proton Mail app
  executables just because their launchers/configs are tracked. Mutable application
  sources and config symlinks are managed separately by the parent file modules.
- `fonts.enable` enables HM's **user** fontconfig and installs its font group;
  it never changes the system font configuration. Desktop's Nerd Font can also
  be installed independently. Shell initialization is the parent's HM
  `programs.bash` / `programs.fish` responsibility, not a service here.

## Complete legacy inventory

Every package entry from the historical root `modules/*.ts` (now removed; available in Git history) is accounted for below. Attributes
are under `pkgs` unless stated otherwise. **User** means installed when the named
option is enabled, on both target architectures unless explicitly marked.
**Host** means deliberately not installed in HM. **External** means no verified
compatible package source is provided in this bounded translation; it is not an
invitation to execute an unpinned network installer.

### `applications`

| Legacy package | Nix mapping / disposition |
| --- | --- |
| `chromium` | User: `chromium` |
| `firefox` | User: `firefox` |
| `discord` | User: `discord`, **x86_64-linux only**; web/external client on ARM |
| `steam` | User: `steam`, **x86_64-linux only**; host graphics/32-bit support still required; external alternative on ARM |
| `spotify-launcher` | User replacement: `spotify`, **x86_64-linux only**; upstream packaged app, not Arch's self-updating launcher; web/external client on ARM |
| `spotify-player` | User: `spotify-player` (terminal client, also on ARM) |
| `obsidian` | User: `obsidian` |
| `alacritty` | User: `alacritty` |
| `inkscape` | User: `inkscape` |

### `desktop`

| Legacy package | Nix mapping / disposition |
| --- | --- |
| `hyprland` | Host: require **0.57+** for active Lua; do **not** install stable `hyprland` 0.52.2 |
| `hypridle` | Host: matching/tested native session helper; stable version not the documented tested release |
| `hyprlock` | Host: matching native PAM-backed locker; no HM PAM policy or incompatible stable fallback |
| `util-linux` | User: `util-linux` (e.g. `flock`) |
| `hyprpicker` | Host: graphical ecosystem tool kept alongside native Hyprland |
| `hyprpaper` | Host: wallpaper daemon/config compatibility kept with native session |
| `hyprshot` | Host: screenshot integration kept with native session |
| `bun` | User: `bun` |
| `libnotify` | User: `libnotify` (`notify-send`; does not supply a notification daemon) |
| `procps-ng` | User: `procps` |
| `xdg-desktop-portal-hyprland` | Host: matching portal and host session/D-Bus integration; no stable mixed-version fallback |
| `sddm` | Host: display manager, never enabled or restarted here |
| `qt6-declarative` | Host: SDDM theme dependency; equivalent `qt6.qtdeclarative` not added to user profile |
| `qt6-svg` | Host: SDDM theme dependency; equivalent `qt6.qtsvg` not added |
| `qt6-virtualkeyboard` | Host: SDDM theme dependency; equivalent `qt6.qtvirtualkeyboard` not added |
| `qt6-multimedia-ffmpeg` | Host: SDDM theme multimedia backend; no claim that a bare user Qt package configures it |
| `qt6-5compat` | Host: SDDM theme dependency; equivalent `qt6.qt5compat` not added |
| `ttf-jetbrains-mono-nerd` | User: `nerd-fonts.jetbrains-mono` (also in `fonts`) |
| AUR `sddm-astronaut-theme` | Host/AUR: native display-manager theme deployment; tracked `dotfiles/sddm/` instructions remain explicit admin work |

### `development`

| Legacy package | Nix mapping / disposition |
| --- | --- |
| `git` | User: `git` |
| `github-cli` | User: `gh` |
| `go` | User: `go` |
| `python` | User: `python3.withPackages` environment |
| `python-defusedxml` | User: environment's `python3Packages.defusedxml` |
| `python-packaging` | User: environment's `python3Packages.packaging` |
| `python-pyqt6` | User: environment's `python3Packages.pyqt6` |
| `neovim` | User: `neovim`; existing config/plugin provisioning is separate |
| `vim` | User: `vim` |
| `meld` | User: `meld` |
| `cloc` | User: `cloc` |
| `lazygit` | User: `lazygit` |
| `lazydocker` | User: `lazydocker`; needs accessible external Docker daemon |
| `nano` | User: `nano` |
| `nano-syntax-highlighting` | User replacement: `nanorc` (Scopatz syntax files in `share/`); `nano` also ships standard syntax files. Installing files does not automatically add nanorc include directives |
| `perl` | User: `perl` |
| `npm` | User: `nodejs` includes npm |
| `docker` | User: `docker_29.override { clientOnly = true; }`; the locked default Docker 28 is marked insecure. Daemon/socket/groups stay host-owned; no insecure-package allowlist. |
| `docker-compose` | User: `docker-compose`; same external daemon requirement |
| `jdk25-openjdk` | User: `jdk25`, **not** default `jdk` 21 |
| `maven` | User: `maven`; projects can explicitly select JDK 25 with `JAVA_HOME`/their dev environment (no global Java override) |
| Bun `@tailwindcss/cli` | User: `tailwindcss_4` 4.1.18 (`tailwindcss` CLI); no Bun global install |
| Bun `typescript:5.9.3` | User: `typescript`, audited branch version **5.9.3** (`tsc`, `tsserver`); lock updates can change it, so recheck if exact version is required |

### `system-utilities` → `systemUtilities`

| Legacy package | Nix mapping / disposition |
| --- | --- |
| `htop` | User: `htop` |
| `wget` | User: `wget` |
| `tmux` | User: `tmux` |
| `zellij` | User: `zellij` |
| `fish` | User: `fish`; shell init/default login shell policy is separate |
| `starship` | User: `starship`; parent owns shell integration |
| `less` | User: `less` |
| `which` | User: `which` |
| `bash-completion` | User: `bash-completion`; parent owns shell integration |
| `diffutils` | User: `diffutils` |
| `direnv` | User: `direnv`; no automatic shell hook here |
| `unrar` | User: `unrar` (unfree allowed by parent) |
| `7zip` | User: `_7zz`, modern 7-Zip CLI |
| `unzip` | User: `unzip` |
| `xclip` | User: `xclip`; X11/XWayland tool, not a Wayland clipboard replacement |
| `wmctrl` | User: `wmctrl`; X11 window tool |
| `hwdetect` | Host/Arch-specific hardware/module detection; no verified portable equivalent mapped |
| `hwinfo` | User: `hwinfo` |
| `dmidecode` | User: `dmidecode`; hardware/privilege-dependent at runtime |
| `ethtool` | User: `ethtool` |
| `hdparm` | User: `hdparm`; no automatic disk changes |
| `sysfsutils` | User: `sysfsutils` |
| `usbutils` | User: `usbutils` |
| `usb_modeswitch` | User: `usb-modeswitch`; native udev rules/activation remain host-owned |
| `haveged` | Host: entropy daemon policy, not enabled or installed here |
| `ntp` | User: `ntp` for diagnostic/admin CLIs (`ntpq` etc.); no time-service activation/configuration |
| `s-nail` | External: no verified `s-nail` source/attribute in this branch audit; no guessed derivation or silent substitution. Install native s-nail separately if needed |
| `texinfo` | User: `texinfo` |
| `inetutils` | User: `inetutils`; no network daemons enabled |
| `bind` | User: `bind.dnsutils` + `bind.host` for `dig`, `delv`, `nslookup`, `nsupdate`, `host`; no DNS server |
| `yay` | Host/Arch-only: pacman/AUR helper, not translated to a Nix package manager |
| `yazi` | User: `yazi` |
| `downgrade` | Host/Arch-only: pacman package rollback tool |
| `pacman-contrib` | Host/Arch-only: native pacman maintenance tools |
| `pkgfile` | Host/Arch-only: native Arch package-file database |
| `rebuild-detector` | Host/Arch-only: native package ABI/rebuild checking |

### `fonts`

| Legacy package | Nix mapping / disposition |
| --- | --- |
| `ttf-jetbrains-mono-nerd` | User: `nerd-fonts.jetbrains-mono` |
| `ttf-liberation` | User: `liberation_ttf` |
| `ttf-opensans` | User: `open-sans` |
| `ttf-bitstream-vera` | User: `ttf_bitstream_vera` |
| `noto-fonts` | User: `noto-fonts` |
| `noto-fonts-cjk` | User: `noto-fonts-cjk-sans` + `noto-fonts-cjk-serif` |
| `noto-fonts-emoji` | User: `noto-fonts-color-emoji`; old Nix alias throws |
| `noto-fonts-extra` | User: covered by `noto-fonts`; `noto-fonts-extra` is a removed/throwing Nix alias, not an additional package |
| `cantarell-fonts` | User: `cantarell-fonts` |

### `gamedev`

| Legacy package | Nix mapping / disposition |
| --- | --- |
| `godot` | User: `godot` (branch's standard Godot build; project-specific versions belong in project dev environments) |
| `libresprite` | User: `libresprite` |
| `prismlauncher` | User: `prismlauncher` |

### `network`

| Legacy package | Nix mapping / disposition |
| --- | --- |
| `tailscale` | User: `tailscale` CLI; native daemon/login/policy managed separately |
| `openssh` | User: `openssh` clients; no `sshd` activation |
| `firewalld` | Host: firewall daemon and policy; no HM package or configuration changes |
| `waypipe` | User: `waypipe`; host Wayland and remote SSH setup required |

### `ags`

| Legacy package | Nix mapping / disposition |
| --- | --- |
| AUR `aylurs-gtk-shell` | External: compatible AGS **3** runtime required; stable `ags` **2.3.0 is not installed** |
| `gjs` | External runtime bundle: matching GJS and AGS import environment, not a standalone HM runtime claim |
| `gtk4` | External runtime bundle: matching GTK4 and typelibs |
| `gtk4-layer-shell` | External runtime bundle: matching layer-shell library/typelib |
| `gobject-introspection` | External runtime/type-generation environment: must resolve the matching Astal/GTK4 typelibs; package on PATH alone is insufficient |
| `npm` | User helper: `nodejs` includes npm |
| `bun` | User helper: `bun` (controller/tools, **not** the GTK widget runtime) |
| `libnotify` | User helper: `libnotify` |
| `pamixer` | User helper: `pamixer`; native audio service required |
| `networkmanager` | User helper: `networkmanager` for `nmcli`; native host daemon/policy required |
| `nm-connection-editor` | User helper: `networkmanagerapplet` supplies the editor; no autostart/service is enabled |
| `pavucontrol` | User helper: `pavucontrol` |
| `tailscale` | User helper: `tailscale`; native daemon required |
| `util-linux` | User helper: `util-linux` |
| `coreutils` | User helper: `coreutils` |

Astal and Gnim are additional AGS 3 runtime requirements from the tracked README
and imports, even though they were supplied transitively by the legacy AUR
package rather than listed individually. They are external too.

### `kotoko` — explicitly host-only

| Legacy package | Disposition |
| --- | --- |
| `os-prober` | Host: boot/OS detection |
| `intel-ucode` | Host: Intel CPU microcode, not meaningful as a user package (nor on ARM) |
| `python-jinja` | Host: legacy boot/theme templating dependency, not a user Python requirement |
| `ttf-dejavu` | Host: legacy boot/theme font dependency, not promoted into the user fonts group |
| `grub` | Host: bootloader; no installation/configuration commands |

There is deliberately no `personal.modules.kotoko.enable` package option or
empty pretend bootloader implementation. Root bootloader/microcode changes must
remain explicit native administration outside standalone HM.

### Other legacy modules

| Legacy module/package entries | Mapping / disposition |
| --- | --- |
| `herdr`: `bun`, `libnotify` | User: `personal.modules.herdr.enable` installs `bun`, `libnotify`. Selected mutable app-source links are separate; this does not manufacture an installed `herdr-app` executable |
| `claude`: empty `packages` | Config only; Claude executable remains external |
| `hermes`: empty `packages` | Config/skills only; Hermes executable remains external |
| `opencode`: empty `packages` | Config/plugins only; OpenCode executable remains external |
| `pi`: empty `packages` | Config/extensions only; Pi executable remains external |

## Validation

The raw-source/ref audit above is complete. Full validation must use the parent's
locked inputs: evaluate both standalone HM configurations with **all package
options enabled**, as well as defaults, and inspect `home.packages` and warnings.
That checks real attribute availability rather than hiding failures behind an
optional filter. Neither evaluating a derivation nor building the HM activation
package requires switching/activating it. Actual builds and native graphical
runtime behavior are separate checks; do not describe a derivation-only eval as
a successful build or a working desktop. No arbitrary network executable is
built or run by this package translation.
