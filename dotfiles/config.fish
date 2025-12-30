set fish_greeting

set -e fish_key_bindings default

if status is-interactive
  if not set -q SSH_CONNECTION


    function starship_transient_prompt_func
      starship module character
    end
    starship init fish | source
    enable_transience
  end

  direnv hook fish | source

  export PATH="$PATH:$SCRIPTS_DIR"
  export PATH="$PATH:$HOME/.bun/bin"
  export PATH="$PATH:$HOME/sysdef/bin"

  export ANDROID_HOME="$HOME/Android/Sdk"
  export PATH="$PATH:$ANDROID_HOME/platform-tools"
  export PATH="$PATH:$HOME/.local/bin"
end
