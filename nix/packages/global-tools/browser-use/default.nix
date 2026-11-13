{ pkgs, inputs }:
let
  inherit (inputs) uv2nix pyproject-nix pyproject-build-systems;
  workspace = uv2nix.lib.workspace.loadWorkspace { workspaceRoot = ./.; };
  pythonSet =
    (pkgs.callPackage pyproject-nix.build.packages {
      python = pkgs.python312;
    }).overrideScope
      (
        pkgs.lib.composeManyExtensions [
          pyproject-build-systems.overlays.wheel
          (workspace.mkPyprojectOverlay { sourcePreference = "wheel"; })
        ]
      );
  environment = pythonSet.mkVirtualEnv "browser-use-0.13.8-env" workspace.deps.default;
  package =
    pkgs.runCommand "browser-use-0.13.8"
      {
        nativeBuildInputs = [ pkgs.makeWrapper ];
        passthru = {
          inherit environment;
          tests.smoke =
            pkgs.runCommand "browser-use-smoke"
              {
                nativeBuildInputs = [ environment ];
                BROWSER_USE_CLI = "${package}/bin/browser-use";
                CHROMIUM = "${pkgs.chromium}/bin/chromium";
                # Test-only parser for checking the installed dependency metadata.
                PYTHONPATH = "${pkgs.python312Packages.packaging}/${pkgs.python312.sitePackages}";
              }
              ''
                export HOME=$TMPDIR/home
                mkdir -p "$HOME"
                export BU_NAME=nix-smoke
                export ANONYMIZED_TELEMETRY=false
                export BROWSER_USE_TELEMETRY=false
                python ${./smoke.py}
                touch $out
              '';
        };
        meta = {
          description = "Browser automation CLI with a locked Python environment";
          homepage = "https://github.com/browser-use/browser-use";
          license = pkgs.lib.licenses.mit;
          mainProgram = "browser-use";
          platforms = pkgs.lib.platforms.linux;
        };
      }
      ''
        mkdir -p $out/bin
        makeWrapper ${environment}/bin/browser-use $out/bin/browser-use \
          --set-default CHROME_PATH ${pkgs.chromium}/bin/chromium \
          --set-default BH_CHROME_PATH ${pkgs.chromium}/bin/chromium
      '';
in
package
