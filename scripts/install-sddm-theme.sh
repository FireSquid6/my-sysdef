#!/usr/bin/env bash
# Deploy configuration around a system-installed theme, never download/run code.
set -euo pipefail
umask 022

repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
source_theme=/usr/share/sddm/themes/sddm-astronaut-theme
root=/
apply=false
usage() {
    printf '%s\n' 'Usage: bash scripts/install-sddm-theme.sh [--apply] [--root DIRECTORY] [--source THEME_DIRECTORY]' \
        'Default: validate source and print plan, without writing anything.' \
        '--root stages a complete installation in an existing directory (no root needed).' \
        '--apply with the default root / requires root; never invokes sudo or restarts SDDM.'
}
fail() { printf 'SDDM: %s\n' "$*" >&2; exit 1; }
while (($#)); do
    case "$1" in
        --apply) apply=true; shift ;;
        --root|--source)
            (($# >= 2)) && [[ -n $2 ]] || fail "$1 requires a directory"
            if [[ $1 == --root ]]; then root=$2; else source_theme=$2; fi
            shift 2 ;;
        --help|-h) usage; exit 0 ;;
        *) usage >&2; fail "unknown argument: $1" ;;
    esac
done
[[ -d $root ]] || fail "root directory must already exist: $root"
root=$(cd -- "$root" && pwd -P)
[[ -d $source_theme ]] || fail "install the AUR sddm-astronaut-theme package first (missing $source_theme)"
source_theme=$(cd -- "$source_theme" && pwd -P)
for file in Main.qml metadata.desktop Themes/astronaut.conf LICENSE; do
    [[ -f $source_theme/$file ]] || fail "incomplete upstream theme: $file"
done
for dir in Components Assets; do
    [[ -d $source_theme/$dir ]] || fail "incomplete upstream theme: $dir"
done
grep -Eq '^QtVersion=6[[:space:]]*$' "$source_theme/metadata.desktop" || fail 'source must be a Qt6 theme'
# Fail closed on package revisions that do not implement our settings.
while IFS= read -r line; do
    if [[ $line =~ ^([A-Za-z][A-Za-z0-9]*)= ]]; then
        key=${BASH_REMATCH[1]}
        grep -Eq "^${key}=" "$source_theme/Themes/astronaut.conf" || fail "upstream no longer documents setting $key; review package compatibility"
    fi
done < "$repo/dotfiles/sddm/theme.conf"

base=${root%/}
theme_parent=$base/usr/local/share/sddm/themes
target=$theme_parent/sysdef-tokyo-night
conf_parent=$base/etc/sddm.conf.d
conf=$conf_parent/90-sysdef-theme.conf
# Do not follow destination symlinks out of a staging root or into other config.
for location in "$base/usr" "$base/usr/local" "$base/usr/local/share" "$base/usr/local/share/sddm" "$theme_parent" "$target" \
    "$base/etc" "$conf_parent" "$conf" "$base/etc/sddm.conf"; do
    [[ ! -L $location ]] || fail "refusing symlink destination: $location"
done
[[ $source_theme != "$target" && $source_theme != "$target/"* ]] || fail 'source cannot be the managed destination'
if [[ -e $target ]]; then
    [[ -d $target && -f $target/.sysdef-managed ]] || fail "refusing unmanaged theme: $target"
fi
if [[ -e $conf ]]; then
    [[ -f $conf ]] && grep -Fqx "# Managed by sysdef's scripts/install-sddm-theme.sh." "$conf" || fail "refusing unmanaged config: $conf"
fi
# /etc/sddm.conf overrides all drop-ins; competing local settings are ambiguous.
shopt -s nullglob
for other in "$base/etc/sddm.conf" "$conf_parent/"*.conf; do
    [[ -f $other && $other != "$conf" ]] || continue
    if grep -Eq '^[[:space:]]*(Current|ThemeDir|InputMethod)[[:space:]]*=' "$other"; then
        fail "competing theme/input settings in $other; back up and reconcile them manually first"
    fi
done
printf 'Source: %s\nTheme: %s\nDrop-in: %s\n' "$source_theme" "$target" "$conf"
if ! $apply; then
    printf '%s\n' 'Dry run: no files written. Pass --apply to deploy. SDDM will NOT be restarted.'
    exit 0
fi
if [[ $root == / ]]; then
    ((EUID == 0)) || fail 'system deployment requires root; review the script and invoke it explicitly with sudo'
    # Staging deliberately does not require runtime packages: it is not a rendering test.
    pacman -Q sddm qt6-declarative qt6-svg qt6-virtualkeyboard qt6-multimedia-ffmpeg ttf-jetbrains-mono-nerd >/dev/null \
        || fail 'missing runtime packages; see dotfiles/sddm/README.md'
fi
mkdir -p -- "$theme_parent" "$conf_parent"
stage=$(mktemp -d "$theme_parent/.sysdef-stage.XXXXXX")
conf_stage=$(mktemp "$conf_parent/.sysdef-stage.XXXXXX")
cleanup() { rm -rf -- "$stage"; rm -f -- "$conf_stage"; }
trap cleanup EXIT
# Copy only runtime code/assets, not the repository's wallpapers or bundled fonts.
# Copies (not source-tree links) keep login independent of a user's home directory.
cp -R -- "$source_theme/Main.qml" "$source_theme/Components" "$source_theme/Assets" "$source_theme/LICENSE" "$stage/"
if [[ -d $source_theme/translations ]]; then cp -R -- "$source_theme/translations" "$stage/"; fi
install -m 0644 -- "$repo/dotfiles/sddm/theme.conf" "$repo/dotfiles/sddm/metadata.desktop" "$stage/"
printf '%s\n' 'Managed by sysdef. Runtime code copied from sddm-astronaut-theme.' > "$stage/.sysdef-managed"
# Keep provenance for reviewing/redeploying after package upgrades.
(cd -- "$source_theme" && sha256sum Main.qml Components/*.qml Themes/astronaut.conf) > "$stage/upstream.sha256"
# Ensure SDDM can traverse/read everything, independent of invoking user's umask.
chmod -R a+rX -- "$stage"
chmod 0755 -- "$stage"
install -m 0644 -- "$repo/dotfiles/sddm/90-sysdef-theme.conf" "$conf_stage"
backup=''
if [[ -e $target || -e $conf ]]; then
    backup=$(mktemp -d "$theme_parent/.sysdef-backup.XXXXXX")
    [[ ! -e $target ]] || cp -a -- "$target" "$backup/theme"
    [[ ! -e $conf ]] || cp -a -- "$conf" "$backup/90-sysdef-theme.conf"
    printf 'Previous deployment saved in %s\n' "$backup"
fi
# Activate the drop-in last. If that fails, restore the previous managed theme.
[[ ! -e $target ]] || rm -rf -- "$target"
if ! mv -- "$stage" "$target"; then
    [[ -z $backup || ! -e $backup/theme ]] || cp -a -- "$backup/theme" "$target"
    fail 'could not activate theme; previous theme restored if present'
fi
if ! mv -f -- "$conf_stage" "$conf"; then
    rm -rf -- "$target"
    [[ -z $backup || ! -e $backup/theme ]] || cp -a -- "$backup/theme" "$target"
    fail 'could not activate drop-in; previous theme restored if present'
fi
printf '%s\n' 'Deployment complete. No service was started, stopped, enabled, or restarted.'
if [[ $root != / ]]; then
    printf 'Preview (after runtime dependencies are installed):\nsddm-greeter-qt6 --test-mode --theme %q\n' "$target"
fi
