# Tokyo Night across GTK and Qt

The shared workstation Nix profile already supplies `tokyonight-gtk-theme`,
`qogir-icon-theme`, `kdePackages.qt6ct`, `kdePackages.qtstyleplugin-kvantum`, and
our `kvantum-tokyo-night` package. No mutable theme installer is needed.

## Apply on a package-profile workstation

Installing the package profile alone does **not** activate Home Manager settings.
For the package-only desktop deployment, run:

```sh
bun scripts/apply-desktop-theme.ts --dry-run
bun scripts/apply-desktop-theme.ts
```

This updates only theme settings, preserving unrelated INI entries and custom
GTK4 CSS. Existing changed files are copied under
`~/.local/state/sysdef/theme-backups/<timestamp>/` (or `$XDG_STATE_HOME`). Backup
paths mirror the absolute original paths beneath that directory. Restore the
needed files manually, and reset GNOME interface settings with `gsettings` if
rolling back. The script refuses to replace changed managed symlinks: activate
their owning configuration instead.

- GTK2/GTK3/GTK4 select **Tokyonight-Dark**, **Qogir-Dark** icons, Noto Sans 10.
- GTK4 imports the packaged stylesheet through `~/.config/gtk-4.0/gtk.css` so
  libadwaita applications also receive the styling. Custom CSS follows the import.
  This is an application CSS override, not officially supported libadwaita theme
  integration; app updates may introduce styling mismatches.
- GNOME interface dconf settings select the same theme and `prefer-dark` for
  portal consumers. No global `GTK_THEME` override is used.
- Qt6ct selects **kvantum**; Kvantum selects **Kvantum-Tokyo-Night**. Hyprland
  already exports `QT_QPA_PLATFORMTHEME=qt6ct`.
- Qt5ct configuration is prepared too, but the current Nix workstation runtime
  supplies Qt6 plugins only. Legacy Qt5 applications need compatible Qt5ct and
  Kvantum plugins and a per-app `QT_QPA_PLATFORMTHEME=qt5ct`. Never add a global
  `QT_PLUGIN_PATH` pointing at another Qt version's plugins.

Reopen GTK4/Qt applications after applying. GTK3 apps may update live. No
compositor, portal, or application process is restarted by the script.
Native applications must be able to discover the Nix themes via
`XDG_DATA_DIRS` (the Nix desktop launcher includes `~/.nix-profile/share`). Qt
applications additionally need compatible platform/style plugins in their own
runtime; installing a Nix plugin does not inject it into distribution Qt apps.
Flatpak sandboxes, Electron/web apps, and applications with custom styling may
not follow these settings. This command does not alter their permissions or
force their palettes.

## Home Manager

`nix/home/desktop.nix` declares the corresponding GTK, dconf, Qtct, and Kvantum
settings; `nix/home/workstation.nix` links the packaged Kvantum theme. Keep the
scoped command and these declarations aligned. Do not activate the entire home
just to apply themes during a package-only migration.

## Checks

```sh
bun test test/desktop-theme.test.ts test/transparency.test.ts
gsettings get org.gnome.desktop.interface gtk-theme
gsettings get org.gnome.desktop.interface color-scheme
QT_QPA_PLATFORM=offscreen python3 -c '
from PyQt6.QtWidgets import QApplication, QProxyStyle
app = QApplication([])
s = app.style()
print(s.objectName())
print(s.baseStyle().objectName() if isinstance(s, QProxyStyle) else "not a proxy")
'
```

On kotoko, the Qt check reports `qt6ct-style` with base style `kvantum`.
This verifies plugin selection, not visual correctness of every application.
