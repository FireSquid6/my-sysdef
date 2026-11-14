set fish_greeting

set -e fish_key_bindings default

# Nix is the default package source; legacy user installs remain fallback only.
if test -d "$HOME/.nix-profile/bin"
  fish_add_path --prepend --global --move "$HOME/.nix-profile/bin"
end

if status is-interactive
  # Keep the connected host in the terminal title, including over SSH. Hyprland
  # uses this prefix for machine-colored borders; tmux forwards the pane title.
  function fish_title
    set -l short_host (string split -m 1 . -- $hostname)[1]
    printf '%s: %s' "$short_host" (fish_prompt_pwd_dir_length=1 prompt_pwd)
    if set -q argv[1]
      printf ' — %s' "$argv[1]"
    end
  end

  if not set -q SSH_CONNECTION


    function starship_transient_prompt_func
      starship module character
    end
    starship init fish | source
    enable_transience
  end

  direnv hook fish | source

  fish_add_path --append --global "$HOME/.opencode/bin"
  export PATH="$PATH:$SCRIPTS_DIR"
  export PATH="$PATH:$HOME/.bun/bin"

  export ANDROID_HOME="$HOME/Android/Sdk"
  export PATH="$PATH:$ANDROID_HOME/platform-tools"
  export PATH="$PATH:$HOME/.local/bin"

  export PATH="$PATH:$HOME/.autosmith/bin"
  export PATH="$PATH:$HOME/.fly/bin"
end
