# SDDM: Tokyo Night, using Astronaut (Qt6)

This is a **configuration of the maintained [sddm-astronaut-theme](https://github.com/Keyitdev/sddm-astronaut-theme)**, not a custom QML login screen. The runtime comes from the system-installed package. Nothing here changes PAM, sessions, autologin, the greeter display server, or Hyprland/Hyprlock. SDDM and Hyprlock are separate authentication surfaces.

## Appearance

`theme.conf` uses the upstream configuration API:

- Flat `#1a1b26` background; no image/video, dimming, form panel, or blur.
- `#24283b` input colors, `#c0caf5` text, `#bb9af7` accent/login/power icons, `#7aa2f7` focus/hover, `#f7768e` warnings.
- System-wide **JetBrainsMono Nerd Font**, centered clock/date, username and password, session chooser and power actions. Username rather than GECOS avoids ambiguous real names. Last user is selected and password is focused/masked immediately.
- Power actions follow SDDM's capability checks; they are not forcibly exposed. Session selection uses SDDM's session model. The virtual keyboard remains available.

**Upstream visual limitations:** Astronaut's `Components/Input.qml` fixes input background opacity at `0.2` and lightens focused text. Thus `#24283b` is the configured color, but the rendered field is blended over `#1a1b26`, not an opaque Hyprlock-identical swatch. Focus borders share that background opacity. Clock/input sizes and spacing are upstream-defined and scale with the screen/font; this is a coordinated palette/layout, not a pixel-identical Hyprlock clone. There is no supported input-opacity setting. We intentionally do not patch/vend custom QML to hide this limitation. Review at your actual resolution (including narrow/multi-monitor displays) before enabling.

## Packages

System packages and privileged theme deployment remain host-managed; the
[shared Nix workstation bundle](../../docs/nix-desktop.md) does not install or
activate a system greeter. On EndeavourOS, the Arch
dependencies are `sddm`, `qt6-declarative`, `qt6-svg`, `qt6-virtualkeyboard`,
`qt6-multimedia-ffmpeg`, `qt6-5compat`, `ttf-jetbrains-mono-nerd`, and the reviewed
AUR `sddm-astronaut-theme` package. The application-only Nix updater does not
install or activate a system greeter.

Qt modules must be a consistent Arch installation, **Qt >= 6.8** per upstream. Do not use Qt5 greeter/theme packages. `qt6-multimedia` is a transitive dependency of the FFmpeg backend, not an alternative to specifying that backend. `qt6-5compat` is retained to match the package's declared dependencies even though the verified upstream revision no longer imports Qt5Compat. No extra video codecs or upstream bundled fonts are needed for our flat background and system font.

### Verification evidence / primary sources

The implementation was checked against upstream revision **`abb3163c724935af888ba5ea9ac0c4f22afd8048`** (the HEAD returned by GitHub during implementation):

- [Upstream README](https://github.com/Keyitdev/sddm-astronaut-theme/blob/abb3163c724935af888ba5ea9ac0c4f22afd8048/README.md): Qt6, minimum SDDM/Qt versions, exact Arch dependencies, metadata `ConfigFile` selection, test-mode command.
- [Upstream settings](https://github.com/Keyitdev/sddm-astronaut-theme/blob/abb3163c724935af888ba5ea9ac0c4f22afd8048/Themes/astronaut.conf): all keys in our `theme.conf` are documented here. An offline key snapshot is in `test/sddm.test.ts`; deployment additionally checks every key against the installed package.
- [Main.qml](https://github.com/Keyitdev/sddm-astronaut-theme/blob/abb3163c724935af888ba5ea9ac0c4f22afd8048/Main.qml): unconditional QtMultimedia import, QtQuick.Effects, background palette and center form anchor. An empty `Background` leaves the palette visible. [LoginForm.qml](https://github.com/Keyitdev/sddm-astronaut-theme/blob/abb3163c724935af888ba5ea9ac0c4f22afd8048/Components/LoginForm.qml) includes clock, input, system and session controls. [Input.qml](https://github.com/Keyitdev/sddm-astronaut-theme/blob/abb3163c724935af888ba5ea9ac0c4f22afd8048/Components/Input.qml) confirms actual color/focus bindings and the opacity limitation.
- [AUR PKGBUILD](https://aur.archlinux.org/cgit/aur.git/tree/PKGBUILD?h=sddm-astronaut-theme) and [AUR RPC](https://aur.archlinux.org/rpc/v5/info?arg[]=sddm-astronaut-theme): package name is **`sddm-astronaut-theme`**, **not** `sddm-astronaut-theme-git` (the latter was absent). PKGBUILD reports `62.8f41a83-1` but uses an **unpinned Git source and computes pkgver at build time**; that displayed version is not a guarantee of installed source. It installs to `/usr/share/sddm/themes/sddm-astronaut-theme` and declares the dependencies above, including Qt5Compat. Review AUR build scripts as usual. For source-reproducible builds, pin the reviewed PKGBUILD's Git `source` to `git+https://github.com/Keyitdev/sddm-astronaut-theme#commit=abb3163c724935af888ba5ea9ac0c4f22afd8048` before building with `makepkg`; retain the resulting package/build recipe. The deployment script itself never downloads or builds anything.
- `pacman -Si sddm qt6-declarative qt6-svg qt6-virtualkeyboard qt6-multimedia-ffmpeg ttf-jetbrains-mono-nerd qt6-5compat` confirmed all official package names. `pacman -Q` confirmed installed SDDM `0.21.0-7`, Qt declarative `6.12.0-4`, SVG `6.12.0-1`, Nerd Font `3.5.1-2`. `fc-match 'JetBrainsMono Nerd Font'` resolved `JetBrainsMonoNerdFont-Regular.ttf`.
- [SDDM 0.21 configuration manual](https://github.com/sddm/sddm/blob/v0.21.0/data/man/sddm.conf.rst.in): `ThemeDir`, `Current`, `InputMethod`, and configuration precedence. In particular `/etc/sddm.conf` has higher precedence than local drop-ins.

## Safe deployment

Deployment is explicit and privileged, separate from user package updates. User-owned symlinks into a home checkout are a poor dependency for a system greeter:

```sh
# From this checkout, after separately installing the host dependencies:
bash scripts/install-sddm-theme.sh --help
bash scripts/install-sddm-theme.sh                 # validation + dry run; no writes

# Root-free staging/preview. The root must already exist.
stage=$(mktemp -d)
bash scripts/install-sddm-theme.sh --root "$stage" --apply
QT_LOGGING_TO_CONSOLE=1 QT_FORCE_STDERR_LOGGING=1 \
  sddm-greeter-qt6 --test-mode --theme "$stage/usr/local/share/sddm/themes/sysdef-tokyo-night"
```

Do **not** enter a real password in test mode. Check the logs for import errors or **“Fallback to embedded theme”**: an open preview or a timed-out process alone does not prove the selected theme loaded. Check the clock/date, password focus, username/session selection, warnings, keyboard navigation, and power controls. Test mode cannot validate real PAM or actual power actions.

After review/preview, a human may explicitly deploy:

```sh
sudo bash scripts/install-sddm-theme.sh --apply
```

No privileged deployment was performed during implementation; passwordless sudo is unavailable. This command is documentation, not part of a user-profile update/test. The script never invokes sudo itself and **never enables, starts, stops or restarts SDDM**. Do not restart a running display manager to test it: that ends graphical sessions. Use a normal later login/reboot only after reviewing the configuration and preparing TTY recovery.

### What the script owns

- `/usr/local/share/sddm/themes/sysdef-tokyo-night/`: runtime `Main.qml`, `Components`, `Assets`, license and optional translations **copied unmodified** from the installed package, plus our `metadata.desktop`/`theme.conf`. No upstream wallpapers, bundled fonts or entire repository are vendored. Files are readable/traversable by the SDDM user, without depending on the checkout/home directory.
- `/etc/sddm.conf.d/90-sysdef-theme.conf`: only `ThemeDir`, `Current`, `InputMethod`. Staging uses the same absolute paths in the drop-in; it is a deployment image, **not a chroot configuration to run SDDM inside**. The preview is pointed explicitly at the staged theme.
- Managed theme contains `.sysdef-managed` and `upstream.sha256` (hashes of the deployed package QML and upstream default settings). Re-running refreshes the snapshot, saving the previous theme/drop-in together in a private `.sysdef-backup.*` directory alongside the theme. Keep backups until a real login succeeds. Upgrades to the packaged theme do not change the snapshot automatically: review source/settings and re-run staging/deployment. For identical deployments, use the same retained theme package and sysdef revision; unknown/removed keys fail closed, but key presence alone cannot prove semantic compatibility with future QML.

The installer refuses unmanaged destinations, symlinked destination components, non-Qt6/incomplete packages, unsupported settings, or competing `Current`/`ThemeDir`/`InputMethod` assignments in `/etc/sddm.conf` or other local drop-ins. It does not silently replace existing theme choices: back up and manually reconcile only those settings first (keep all unrelated configuration). `--source PATH` can select a reviewed package/extracted theme for staging. Normal use prefers the installed system package. No source downloads occur at deployment.

### Rollback / TTY recovery

Before first activation retain your existing SDDM configuration and record the old theme. If the greeter fails, switch to a TTY and remove **only** `/etc/sddm.conf.d/90-sysdef-theme.conf`, then restore the theme/input settings you manually reconciled above. Removing this drop-in relinquishes `ThemeDir`/`Current`/`InputMethod`; it does not invent an old choice. The stock `/usr/share/sddm/themes/{elarun,maldives,maya}` and installed Astronaut theme are never changed. If necessary explicitly select a stock theme with `ThemeDir=/usr/share/sddm/themes` and `Current=elarun` in your local configuration. Do not change PAM/session files.

For a previous **managed** deployment, restore `theme/` and `90-sysdef-theme.conf` from the printed `.sysdef-backup.*` directory to the owned paths above. Backups are mode 0700 and theme directories are mode 0755. The managed theme snapshot can be removed after its drop-in has been disabled/restored. Restarting the display manager is deliberately left to the operator, with the session-loss warning above.

## Tests and current validation limits

```sh
bun test test/sddm.test.ts
bash -n scripts/install-sddm-theme.sh
git diff --check
```

Tests use a synthetic package and temporary root; they verify documented setting names, palette/authentication flags, dry-run behavior, runtime-only copying, readable permissions, repeat deployment/backups, and rejection/preservation of conflicting or unmanaged files. They do not call sudo or control any service.

A second root-free staging run used the **actual upstream QML/assets at the revision above**, successfully exercising the installed-settings compatibility checks and deployment. An offscreen SDDM 0.21 smoke run read our `theme.conf` but reported **`module "QtMultimedia" is not installed`** and **fell back to the embedded theme**. `qt6-multimedia`, `qt6-multimedia-ffmpeg` and `qt6-virtualkeyboard` are not currently installed on this host; installing system runtime dependencies requires operator authorization. Consequently **rendering/visual acceptance, virtual keyboard, real authentication, session launch, and power actions are not validated**. A timeout exit (124) from that smoke run was not counted as a pass. No system files, packages, or running SDDM service were changed.
