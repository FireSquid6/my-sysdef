# Herdr status

OpenCode V2 TUI-only plugin, discovered globally from this directory.
Reports OSC 7501 `idle`, `working`, and `blocked` for the displayed session
and its helper sessions. Home/plugin screens report idle. Herdr decides
whether a completed turn should appear as Done or Idle.

Runs only with a terminal on stdout. No server plugin, shell wrapper,
network service, or Herdr sidebar changes are needed. Restart OpenCode's
TUI after installation and resume your conversation.

Test: `bun test ./plugins/herdr-status/state.test.ts` from the OpenCode config folder.
