{ pkgs, ... }: {
  # Complements personal.modules.development; no project dependency installers.
  home.packages = with pkgs; [
    bubblewrap
    jq
    ripgrep
    fd
    fzf
    gcc
    gnumake
    binutils
    pkg-config
    autoconf
    automake
    bison
    flex
    m4
    fakeroot
    groff
    bear
    boost
    gradle
    jdt-language-server
    lldb
    pnpm
    uv
    sassc
    intellij-idea
    vscode
    postman
    github-copilot-cli
    claude-code
    pi-coding-agent
    opencode
  ];
}
