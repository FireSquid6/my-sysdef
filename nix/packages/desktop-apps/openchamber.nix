{
  lib,
  buildNpmPackage,
  fetchurl,
  nodejs_24,
  python3,
  autoPatchelfHook,
  makeWrapper,
  stdenv,
  git,
  bash,
  coreutils,
  ripgrep,
  procps,
  xdg-utils,
}:
buildNpmPackage {
  pname = "openchamber";
  version = "2.0.3";
  src = fetchurl {
    url = "https://github.com/openchamber/openchamber/releases/download/v2.0.3/openchamber-web-2.0.3.tgz";
    hash = "sha256-EGav9Y0C3AB1rttujwptShi0Dmuuq1ZSz4MbKQ9YnbU=";
  };
  nodejs = nodejs_24;
  npmDepsHash = "sha256-SX3ByJlaXOgzTAhemCI7s6tecDE7Ye3Awuh6EXUmVuU=";
  nativeBuildInputs = [
    python3
    autoPatchelfHook
    makeWrapper
  ];
  buildInputs = [ stdenv.cc.cc.lib ];

  postPatch = ''
    ${python3.interpreter} ${./patch-openchamber.py}
    cp ${./openchamber-package-lock.json} package-lock.json
  '';
  # Never run arbitrary dependency lifecycle/download scripts. The one module
  # that needs a source build is explicitly rebuilt below, against Nix Node.
  npmRebuildFlags = [ "--ignore-scripts" ];
  dontNpmBuild = true;
  buildPhase = ''
    runHook preBuild
    npm_config_build_from_source=true npm rebuild node-pty --offline
    # Discard foreign-architecture / musl prebuilds before autoPatchelf.
    rm -f node_modules/bun-pty/rust-pty/target/release/*arm64* \
      node_modules/bun-pty/rust-pty/target/release/*musl* \
      node_modules/bun-pty/rust-pty/target/release/*.dylib \
      node_modules/bun-pty/rust-pty/target/release/*.dll
    runHook postBuild
  '';
  installPhase = ''
    runHook preInstall
    app="$out/lib/openchamber"
    mkdir -p "$app"
    cp -r bin server dist public node_modules package.json "$app/"
    makeWrapper ${nodejs_24}/bin/node "$out/bin/openchamber" \
      --add-flags "$app/bin/cli.js" \
      --prefix PATH : ${
        lib.makeBinPath [
          nodejs_24
          git
          bash
          coreutils
          ripgrep
          procps
          xdg-utils
        ]
      } \
      --set-default SHELL ${bash}/bin/bash
    runHook postInstall
  '';
  doInstallCheck = true;
  installCheckPhase = ''
    runHook preInstallCheck
    export HOME="$TMPDIR/openchamber-check-home"
    export XDG_CONFIG_HOME="$HOME/.config"
    export XDG_CACHE_HOME="$HOME/.cache"
    export XDG_DATA_HOME="$HOME/.local/share"
    mkdir -p "$HOME"
    timeout 15 "$out/bin/openchamber" --version | grep -Fx '2.0.3'
    timeout 15 "$out/bin/openchamber" --help > /dev/null
    cd "$out/lib/openchamber"
    ${nodejs_24}/bin/node --input-type=module -e '
      import pty from "node-pty";
      import sherpa from "sherpa-onnx-node";
      const term = pty.spawn("${bash}/bin/bash", ["-c", "printf pty-ok"], { env: process.env });
      let output = "";
      const timer = setTimeout(() => { term.kill(); process.exit(1); }, 10000);
      term.onData(data => { output += data; });
      term.onExit(({ exitCode }) => {
        clearTimeout(timer);
        if (exitCode !== 0 || !output.includes("pty-ok")) process.exit(1);
      });
    '
    runHook postInstallCheck
  '';
  meta = {
    description = "OpenChamber CLI and web interface for OpenCode";
    homepage = "https://github.com/openchamber/openchamber";
    license = lib.licenses.mit;
    mainProgram = "openchamber";
    platforms = [ "x86_64-linux" ];
    sourceProvenance = [
      lib.sourceTypes.fromSource
      lib.sourceTypes.binaryNativeCode
    ];
  };
}
