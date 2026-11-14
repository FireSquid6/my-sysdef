{
  config,
  lib,
  ...
}:
let
  cfg = config.personal;
  relativePath = lib.types.addCheck lib.types.str (
    value:
    value != ""
    && lib.all (
      part:
      !(builtins.elem part [
        ""
        "."
        ".."
      ])
    ) (lib.splitString "/" value)
  );
  pathOption =
    default:
    lib.mkOption {
      type = relativePath;
      inherit default;
      description = "Location relative to the managed home. Keep application environment overrides consistent with it.";
    };
in
{
  imports = [
    ./packages.nix
    ./files.nix
    ./shell.nix
  ];

  options.personal = {
    desktopRuntimeProvided = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = "The shared workstation package profile provides compatible Nix compositor/AGS runtimes.";
    };
    legacySessionFiles = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = "Also link historical i3/picom/polybar/swaylock configuration.";
    };
    checkout = lib.mkOption {
      type = lib.types.str;
      description = "Absolute path of the editable, persistent configuration checkout; never a Nix store path.";
    };
    paths = {
      pi = pathOption ".pi/agent";
      claude = pathOption ".claude";
      hermes = pathOption ".hermes";
      herdr = pathOption ".config/herdr-app";
      opencode = pathOption ".config/opencode";
    };
    agents = lib.genAttrs [ "pi" "claude" "hermes" "opencode" ] (name: {
      enable = lib.mkEnableOption "shared ${name} configuration (not installation or private state)";
    });
    herdr.enable = lib.mkEnableOption "shared Herdr configuration without owning its runtime directory";
    managedLinks = lib.mkOption {
      type = lib.types.attrsOf relativePath;
      default = { };
      internal = true;
      description = "Home-relative target to checkout-relative source; shared by links and migration tooling.";
    };
    migrationManifest = lib.mkOption {
      type = lib.types.attrs;
      readOnly = true;
      internal = true;
      description = "Evaluated adoption inventory, including Home Manager-generated shell files.";
    };
  };

  config = {
    assertions = [
      {
        assertion =
          lib.hasPrefix "/" cfg.checkout
          && cfg.checkout != "/nix/store"
          && !(lib.hasPrefix "/nix/store/" cfg.checkout);
        message = "personal.checkout must be an absolute, editable checkout path outside the Nix store.";
      }
    ];
    xdg.enable = true;
    targets.genericLinux.enable = lib.mkDefault true;
    # No GPU hardware is inferred. HM 25.11's default bridge also pulls x86-only
    # Intel drivers on ARM; opt into a reviewed host GPU/nixGL setup separately.
    targets.genericLinux.gpu.enable = lib.mkDefault false;
    programs.home-manager.enable = true;
    personal.modules.herdr.enable = lib.mkDefault cfg.herdr.enable;

    home = {
      stateVersion = lib.mkDefault "25.11";
      # An explicit environment contract replaces the old hardcoded ~/sysdef paths.
      sessionVariables = {
        SYSTEM_CONFIG_DIR = cfg.checkout;
        SCRIPTS_DIR = "${cfg.checkout}/scripts";
        EDITOR = "nvim";
        PI_CODING_AGENT_DIR = "${config.home.homeDirectory}/${cfg.paths.pi}";
        CLAUDE_CONFIG_DIR = "${config.home.homeDirectory}/${cfg.paths.claude}";
        HERMES_HOME = "${config.home.homeDirectory}/${cfg.paths.hermes}";
        HERDR_APP_HOME = "${config.home.homeDirectory}/${cfg.paths.herdr}";
      };
      sessionPath = [
        "${config.home.homeDirectory}/.local/bin"
        "${cfg.checkout}/scripts"
      ];

      # Fail before the write boundary if the persistent checkout was moved/removed.
      activation.checkEditableSources = lib.hm.dag.entryBefore [ "writeBoundary" ] ''
        if [[ ! -d ${lib.escapeShellArg cfg.checkout} ]]; then
          errorEcho "The editable configuration checkout is missing; fix personal.checkout before switching."
          exit 1
        fi
        for source in ${
          lib.concatMapStringsSep " " (source: lib.escapeShellArg "${cfg.checkout}/${source}") (
            lib.attrValues cfg.managedLinks
          )
        }; do
          if [[ ! -e "$source" ]]; then
            errorEcho "Missing editable configuration source: $source"
            exit 1
          fi
        done
      '';

      # No force=true: an unmanaged collision must be explicitly reviewed/backed up.
      file = lib.mapAttrs (_: source: {
        source = config.lib.file.mkOutOfStoreSymlink "${cfg.checkout}/${source}";
      }) cfg.managedLinks;
    };

    personal.migrationManifest = {
      version = 1;
      inherit (config.home) username;
      home = config.home.homeDirectory;
      inherit (cfg) checkout;
      legacyDirectoryLinks =
        lib.optionalAttrs cfg.herdr.enable {
          "${cfg.paths.herdr}" = "${cfg.checkout}/herdr";
        }
        // lib.optionalAttrs cfg.agents.opencode.enable {
          "${cfg.paths.opencode}" = "${cfg.checkout}/opencode";
        };
      targets = lib.mapAttrsToList (_: file: {
        inherit (file) target;
        source =
          if builtins.hasAttr file.target cfg.managedLinks then
            "${cfg.checkout}/${cfg.managedLinks.${file.target}}"
          else
            null;
      }) (lib.filterAttrs (_: file: file.enable) config.home.file);
    };
  };
}
