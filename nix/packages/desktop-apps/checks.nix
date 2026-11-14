# Standalone checks; deliberately not exported as installable desktop packages.
# nix-build --no-out-link nix/packages/desktop-apps/checks.nix \
#   --arg pkgs 'import /path/to/nixpkgs {}'
{ pkgs }:
let
  apps = import ./default.nix { inherit pkgs; };
in
pkgs.runCommand "desktop-apps-checks"
  {
    nativeBuildInputs = [
      pkgs.desktop-file-utils
      pkgs.nodejs_24
    ];
  }
  ''
      export HOME="$TMPDIR/home"
      export XDG_CONFIG_HOME="$HOME/.config"
      export XDG_CACHE_HOME="$HOME/.cache"
      export XDG_DATA_HOME="$HOME/.local/share"
      mkdir -p "$HOME"

      ${pkgs.lib.concatMapStringsSep "\n"
        (
          name:
          let
            app = apps.${name};
          in
          ''
            desktop-file-validate ${app}/share/applications/${name}.desktop
            test -x ${app}/bin/${app.meta.mainProgram}
            grep -F 'Exec=${app}/bin/${app.meta.mainProgram} ' \
              ${app}/share/applications/${name}.desktop
            test -n "$(find ${app}/share/icons/hicolor -name '${name}.*' -type f -print)"
          ''
        )
        [
          "emdash-app"
          "openchamber-desktop"
          "youtube-music-for-desktop"
        ]
      }

      ${apps.mdserve}/bin/mdserve --help | grep -F 'Serve a directory of markdown files'
      ${apps.openchamber}/bin/openchamber --version | grep -Fx '2.0.3'
      ${apps.openchamber}/bin/openchamber --help | grep -F 'USAGE:'

      # These public module APIs must reject before any network fetch or installation.
      cd ${apps.openchamber}/lib/openchamber
      node --input-type=module <<'JS'
      import assert from 'node:assert/strict';
      import { getUpdateCommand, executeUpdate } from './server/lib/package-manager.js';
      import { installOpenCodeV2 } from './server/lib/opencode/v2-install.js';
      for (const fn of [getUpdateCommand, executeUpdate]) {
        assert.throws(() => fn('npm'), /managed by Nix/);
      }
      let fetched = false;
      await assert.rejects(installOpenCodeV2({
        fetchImpl: () => { fetched = true; throw new Error('unexpected network access'); },
      }), /Install OpenCode separately through Nix/);
      assert.equal(fetched, false);
    JS
      touch "$out"
  ''
