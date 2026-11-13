{ config, lib, ... }:
let
  cfg = config.personal;
  # Inventory from the flake's tracked sources; links point to the editable checkout.
  directories =
    directory:
    lib.attrNames (lib.filterAttrs (_: type: type == "directory") (builtins.readDir directory));
  linkChildren =
    target: source: names:
    lib.listToAttrs (
      map (name: {
        name = "${target}/${name}";
        value = "${source}/${name}";
      }) names
    );
  mattSkills = lib.filter (
    name: builtins.pathExists (../../hermes/skills/aihero + "/${name}/SKILL.md")
  ) (directories ../../hermes/skills/aihero);
in
{
  personal.managedLinks = lib.mkMerge [
    (lib.mkIf cfg.modules.systemUtilities.enable {
      ".config/starship.toml" = "dotfiles/starship.toml";
      ".config/yazi/yazi.toml" = "dotfiles/yazi/yazi.toml";
      ".config/yazi/keymap.toml" = "dotfiles/yazi/keymap.toml";
      ".config/fish/functions/envsource.fish" = "dotfiles/functions/envsource.fish";
    })
    (lib.mkIf cfg.modules.development.enable {
      ".config/lazygit/config.yml" = "dotfiles/lazygit.yml";
      ".gitconfig" = "dotfiles/gitconfig";
      ".tmux.conf" = "dotfiles/tmux.conf";
      ".config/zellij/config.kdl" = "dotfiles/zellij.kdl";
      ".config/nvim" = "neovim";
    })
    (lib.mkIf cfg.modules.applications.enable {
      ".config/kitty/kitty.conf" = "dotfiles/kitty.conf";
      ".config/alacritty/alacritty.toml" = "dotfiles/alacritty.toml";
      ".config/foot/foot.ini" = "dotfiles/foot.ini";
    })
    (lib.mkIf cfg.modules.desktop.enable {
      ".config/i3/config" = "dotfiles/i3";
      ".config/picom/picom.conf" = "dotfiles/picom.conf";
      ".config/polybar/config.ini" = "dotfiles/polybar.ini";
      ".config/swaylock/config" = "dotfiles/swaylock/config";
      ".config/betterlockscreen/betterlockscreenrc" = "dotfiles/betterlockscreenrc";
      ".config/hypr" = "dotfiles/hypr";
      "wallpapers" = "dotfiles/wallpapers";
    })
    (lib.mkIf cfg.modules.ags.enable { ".config/ags" = "ags"; })
    (lib.mkIf cfg.agents.pi.enable (
      {
        "${cfg.paths.pi}/AGENTS.md" = "pi/AGENTS.md";
        "${cfg.paths.pi}/settings.json" = "pi/settings.json";
        "${cfg.paths.pi}/subagents.json" = "pi/subagents.json";
        "${cfg.paths.pi}/agent-tool-description.md" = "pi/agent-tool-description.md";
        "${cfg.paths.pi}/extensions" = "pi/extensions";
        "${cfg.paths.pi}/themes" = "pi/themes";
      }
      // linkChildren "${cfg.paths.pi}/skills" "pi/skills" (directories ../../pi/skills)
    ))
    (lib.mkIf cfg.agents.claude.enable {
      "${cfg.paths.claude}/settings.json" = "claude/settings.json";
      "${cfg.paths.claude}/agents" = "claude/agents";
      "${cfg.paths.claude}/skills" = "claude/skills";
      "${cfg.paths.claude}/output-styles" = "claude/output-styles";
    })
    (lib.mkIf cfg.agents.hermes.enable (
      {
        "${cfg.paths.hermes}/SOUL.md" = "hermes/SOUL.md";
        "${cfg.paths.hermes}/skins/tokyonight-night.yaml" = "hermes/skins/tokyonight-night.yaml";
        "${cfg.paths.hermes}/skills/aihero/AIHERO-LICENSE.txt" = "hermes/skills/aihero/AIHERO-LICENSE.txt";
        "${cfg.paths.hermes}/skills/creative/impeccable" = "hermes/skills/creative/impeccable";
      }
      // linkChildren "${cfg.paths.hermes}/skills/aihero" "hermes/skills/aihero" mattSkills
    ))
    (lib.mkIf cfg.agents.opencode.enable (
      {
        "${cfg.paths.opencode}/opencode.jsonc" = "opencode/opencode.jsonc";
        "${cfg.paths.opencode}/cli.json" = "opencode/cli.json";
        "${cfg.paths.opencode}/tui.json" = "opencode/tui.json";
      }
      // linkChildren "${cfg.paths.opencode}/agents" "opencode/agents" (
        lib.attrNames (builtins.readDir ../../opencode/agents)
      )
      // linkChildren "${cfg.paths.opencode}/plugins" "opencode/plugins" (
        lib.attrNames (builtins.readDir ../../opencode/plugins)
      )
      // linkChildren "${cfg.paths.opencode}/skills" "opencode/skills" (directories ../../opencode/skills)
    ))
    (lib.mkIf cfg.herdr.enable (
      {
        "${cfg.paths.herdr}/keys.json" = "herdr/keys.json";
        "${cfg.paths.herdr}/settings.json" = "herdr/settings.json";
      }
      // linkChildren "${cfg.paths.herdr}/layouts" "herdr/layouts" (
        lib.attrNames (builtins.readDir ../../herdr/layouts)
      )
      // linkChildren "${cfg.paths.herdr}/themes" "herdr/themes" (
        lib.attrNames (builtins.readDir ../../herdr/themes)
      )
      // linkChildren "${cfg.paths.herdr}/mods" "herdr/mods" (directories ../../herdr/mods)
    ))
  ];
}
