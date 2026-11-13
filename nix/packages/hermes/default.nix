{ pkgs }:
let
  # Upstream v0.23.1, matching the existing installation. Keep upstream's
  # flake.lock: its Python 3.14/uv2nix, pnpm, Electron and native node-pty
  # builds are maintained together, not re-resolved against our nixpkgs.
  upstream = builtins.getFlake "github:NousResearch/hermes-agent/3b421578588243f920886e6fe79a6faa87ea026e?narHash=sha256-wGv%2BkNpiOGa1k%2FQxN7njXSF3wmlwPGtQ02Frnp6hP18%3D";
  agent = upstream.packages.${pkgs.stdenv.hostPlatform.system}.default.override {
    version = "0.23.1";
  };
  desktop = agent.hermesDesktop;
  launcher = pkgs.replaceVars ./launcher.sh {
    shell = pkgs.runtimeShell;
    agent = "${agent}/bin/hermes";
    desktop = "${desktop}/bin/hermes-desktop";
  };
in
pkgs.symlinkJoin {
  name = "hermes-0.23.1";
  paths = [
    agent
    desktop
  ];
  postBuild = ''
    rm "$out/bin/hermes"
    install -m755 ${launcher} "$out/bin/hermes"
  '';
  passthru = {
    inherit upstream agent desktop;
    tests.launcher =
      pkgs.runCommand "hermes-launcher-tests"
        {
          nativeBuildInputs = [ pkgs.python3 ];
          TEST_SHELL = pkgs.runtimeShell;
        }
        ''
          python3 ${./.}/test_launcher.py
          touch "$out"
        '';
  };
  meta = agent.meta // {
    description = "Hermes Agent and upstream Electron desktop with hermes desktop compatibility";
    mainProgram = "hermes";
  };
}
