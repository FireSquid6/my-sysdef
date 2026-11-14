{ pkgs, upstream }:
let
  # Use the fork's own coordinated Python, pnpm, Electron and node-pty builds.
  agent = upstream.packages.${pkgs.stdenv.hostPlatform.system}.default;
  desktop = agent.hermesDesktop;
  # Keep systemd's graceful-stop/cleanup hooks on the same Python closure as
  # the agent, rather than depending on a mutable source checkout's venv.
  stopMark = pkgs.writeShellScriptBin "hermes-gateway-stop-mark" ''
    exec ${agent.hermesVenv}/bin/python3 -m gateway.systemd_stop_mark "$@"
  '';
  cleanup = pkgs.writeShellScriptBin "hermes-gateway-cgroup-cleanup" ''
    exec ${agent.hermesVenv}/bin/python3 -m gateway.cgroup_cleanup "$@"
  '';
  # Discord loads Opus with ctypes rather than an ELF dependency, so the
  # Python wheel's automatic RPATH patching cannot discover this runtime need.
  agentCommand = pkgs.writeShellScript "hermes-with-codecs" ''
    export LD_LIBRARY_PATH=${
      pkgs.lib.makeLibraryPath [ pkgs.libopus ]
    }"''${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
    exec ${agent}/bin/hermes "$@"
  '';
  launcher = pkgs.replaceVars ./launcher.sh {
    shell = pkgs.runtimeShell;
    agent = agentCommand;
    desktop = "${desktop}/bin/hermes-desktop";
  };
in
pkgs.symlinkJoin {
  pname = "hermes";
  inherit (agent) version;
  paths = [
    agent
    desktop
    stopMark
    cleanup
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
    tests.opus =
      pkgs.runCommand "hermes-opus-test"
        {
          nativeBuildInputs = [ pkgs.gcc ];
          LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath [ pkgs.libopus ];
        }
        ''
          export HOME="$TMPDIR/home"
          mkdir -p "$HOME"
          ${agent.hermesVenv}/bin/python3 -c 'from plugins.platforms.discord.adapter_opus import load_opus_codec; import discord; load_opus_codec(); assert discord.opus.is_loaded()'
          touch "$out"
        '';
  };
  meta = agent.meta // {
    description = "Hermes Agent and upstream Electron desktop with hermes desktop compatibility";
    mainProgram = "hermes";
  };
}
