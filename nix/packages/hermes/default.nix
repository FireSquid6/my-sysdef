{ pkgs, upstream }:
let
  # Use the fork's own coordinated Python, pnpm, Electron and node-pty builds.
  agent = upstream.packages.${pkgs.stdenv.hostPlatform.system}.default;
  desktop = agent.hermesDesktop;
  launcher = pkgs.replaceVars ./launcher.sh {
    shell = pkgs.runtimeShell;
    agent = "${agent}/bin/hermes";
    desktop = "${desktop}/bin/hermes-desktop";
  };
in
pkgs.symlinkJoin {
  pname = "hermes";
  version = agent.version;
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
