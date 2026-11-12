#!/usr/bin/env bash
set -euo pipefail
here="$(cd -- "$(dirname -- "$(readlink -f -- "${BASH_SOURCE[0]}")")" && pwd)"
command -v ags >/dev/null || { echo 'Install AGS before generating its types.' >&2; exit 1; }
# Deliberately do not use --update: that overwrites the tracked tsconfig.
ags types 'Astal-4.0' --directory "$here"
mkdir -p "$here/node_modules"
package="${AGS_PACKAGE_DIR:-/usr/share/ags/js}"
for name in ags gnim; do
  target="$package"
  [[ "$name" != gnim ]] || target="$package/node_modules/gnim"
  [[ -d "$target" ]] || { printf 'Missing AGS package: %s\n' "$target" >&2; exit 1; }
  link="$here/node_modules/$name"
  if [[ -e "$link" || -L "$link" ]]; then
    [[ -L "$link" && "$(readlink -f "$link")" == "$(readlink -f "$target")" ]] || { printf 'Refusing conflicting package link: %s\n' "$link" >&2; exit 1; }
  else ln -s "$target" "$link"; fi
done
