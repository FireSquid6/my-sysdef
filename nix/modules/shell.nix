{ config, lib, ... }:
let
  cfg = config.personal;
in
{
  config = lib.mkIf cfg.modules.systemUtilities.enable {
    # Let HM generate the login/session-variable plumbing; retain the existing
    # interactive behavior rather than replacing it with a second set of hooks.
    programs = {
      bash = {
        enable = true;
        enableCompletion = true;
        initExtra = builtins.readFile ../../dotfiles/bashrc;
        profileExtra = ''
          if [ -n "''${BASH_VERSION:-}" ] && [ -f "$HOME/.bashrc" ]; then
            . "$HOME/.bashrc"
          fi
        '';
      };
      fish = {
        enable = true;
        # Vendor completions still work. Avoid deriving completions from every
        # package's manpages just to build the generated configuration files.
        generateCompletions = false;
        # HM 25.11 always integrates direnv with Fish; do not register it twice.
        interactiveShellInit = lib.replaceStrings [ "  direnv hook fish | source\n" ] [ "" ] (
          builtins.readFile ../../dotfiles/config.fish
        );
      };
      direnv = {
        enable = true;
        nix-direnv.enable = true;
        enableBashIntegration = false;
        enableZshIntegration = false;
      };
    };
    home.sessionPath = [
      "${config.home.homeDirectory}/.opencode/bin"
      "${config.home.homeDirectory}/.bun/bin"
      "${config.home.homeDirectory}/.fly/bin"
    ];
  };
}
