# Evaluation-time contract for the SHARED standalone desktop, not an OS image.
{
  pkgs,
  homes,
  bundles,
  hosts,
  packageSources,
  outputs,
}:
let
  inherit (pkgs) lib;
  kotoko = bundles."firesquid@kotoko";
  laptop = bundles."firesquid@deisslaptop";
  required = [
    "hyprland"
    "ags"
    "gjs"
    "bun"
    "pi-coding-agent"
    "claude-code"
    "opencode"
    "chromium"
    "firefox"
    "thunderbird"
    "godot"
    "playerctl"
    "wl-clipboard"
  ];
  homeContract =
    name: home:
    let
      bundle = bundles.${name};
    in
    builtins.elem bundle home.home.packages
    && home.personal.desktopRuntimeProvided
    && !home.personal.legacySessionFiles
    && home.targets.genericLinux.enable
    && !home.targets.genericLinux.gpu.enable
    && !(home.services.hypridle.enable or false)
    && home.personal.managedLinks.".config/hypr" == "dotfiles/hypr"
    && home.personal.managedLinks.".config/ags" == "ags"
    && home.personal.managedLinks."${home.personal.paths.pi}/AGENTS.md" == "pi/AGENTS.md"
    && home.personal.managedLinks."${home.personal.paths.pi}/skills/ags" == "pi/skills/ags"
    && !(builtins.hasAttr "${home.personal.paths.pi}/skills" home.personal.managedLinks)
    && home.personal.managedLinks."${home.personal.paths.hermes}/SOUL.md" == "hermes/SOUL.md"
    &&
      lib.all
        (path: !(builtins.hasAttr "${home.personal.paths.hermes}/${path}" home.personal.managedLinks))
        [
          ".env"
          "auth.json"
          "state.db"
          "skills"
        ];
in
assert !(outputs ? nixosConfigurations);
assert !(outputs ? nixosModules);
assert lib.assertMsg (
  kotoko.managedPackages == laptop.managedPackages
) "Workstations must share one inventory; place hardware differences in host settings.";
assert lib.all (name: builtins.elem name kotoko.managedPackages) required;
# Graphics must come from each host's explicit settings, not build-time probing.
assert lib.all (
  name:
  bundles.${name}.graphicsConfigured == (hosts.${name}.graphics != null)
  &&
    bundles.${name}.graphicsBackend
    == (if hosts.${name}.graphics == null then "unconfigured" else hosts.${name}.graphics.backend)
) (builtins.attrNames homes);
assert lib.all (name: homeContract name homes.${name}) (builtins.attrNames homes);
assert kotoko.applications.hermes.upstream.outPath == packageSources.hermes.outPath;
assert kotoko.applications.herdr-core.src.outPath == packageSources.herdr-core.outPath;
assert kotoko.applications.herdr-desktop.src.outPath == packageSources.herdr-app.outPath;
pkgs.runCommand "shared-desktop-contract" { } ''
  touch "$out"
''
