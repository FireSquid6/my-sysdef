# Hermes desktop

Import with `import ./nix/packages/hermes { inherit pkgs; }`. This exports both
`hermes` and `hermes-desktop`, plus upstream's XDG desktop entry and icon.
The existing Hyprland startup command `hermes desktop` is preserved. Only that
subcommand is intercepted; other commands go to the upstream Nix agent.

## Provenance and dependency ownership

The previous `~/.local/bin/hermes` wrapper pointed into
`~/.hermes/hermes-agent/.hermes/bin/hermes`. Inspection of that checkout found:

- Remote: `https://github.com/NousResearch/hermes-agent.git`.
- Version: tag `v0.23.1`, commit `3b421578588243f920886e6fe79a6faa87ea026e`.
- `pyproject.toml` project name `hermes-agent`, metadata version `0.0.0`;
  current runtime dependencies target Python 3.14. The package override supplies
  the release version for the upstream install stamp.
- The upstream revision already contains a maintained Nix flake. Its `default`
  package includes the full Python dependency set, and `hermesDesktop` builds
  the Electron renderer, native node-pty, icons and desktop integration. The
  desktop points `HERMES_DESKTOP_HERMES` at that same immutable agent.
- The supplied nixpkgs source had no Hermes Agent package (only an unrelated
  Hermes Vim plugin).

`default.nix` consumes that exact upstream revision **and its own committed
flake.lock**. The source NAR hash was obtained with `nix flake metadata`, not
invented. The upstream Python/uv2nix, pnpm, Electron and native build dependency
pins are retained rather than recreated here or coupled to this host's nixpkgs.
The host's `pkgs` provides only the compatibility wrapper, package join and test.
There is no activation hook, user-checkout dependency, pip/uv/npm invocation,
or installer in our launcher. Desktop startup directly executes the prebuilt
upstream desktop instead of upstream's source-install `hermes desktop` builder.
Optional integrations retain upstream behavior; this is not a guarantee that
arbitrary user-added plugins or optional on-demand integrations work offline.

The upstream identity is `com.nousresearch.hermes` (including
`com.nousresearch.hermes.desktop` and `StartupWMClass`); it is not renamed.
No credentials or user configuration are copied into the store. Existing user
configuration remains runtime state. Updates require explicitly changing this
source pin; do not use the mutable upstream updater to update the Nix package.

## Validation

Local tests (argument forwarding, desktop dispatch, no-argument invocation and
exit-status preservation):

```sh
python3 nix/packages/hermes/test_launcher.py
```

Evaluation/build without changing the repository lockfile:

```sh
nix --extra-experimental-features 'nix-command flakes' build --impure --no-link \
  --expr 'import ./nix/packages/hermes { pkgs = import /nix/store/yxkqzvl5bf7knrh55lbl5xjxksq6ydmp-source {}; }'
```

Append `.tests.launcher` to the parenthesized import expression to build just the
sandboxed launcher contract test.

Actual validation on x86_64-linux:

- Downloaded and hashed the pinned upstream source; evaluated upstream desktop.
- Evaluated this joined package to a derivation with the supplied nixpkgs.
- Confirmed the pinned `builtins.getFlake` reference evaluates in pure mode.
- All three launcher tests passed locally **and as a Nix derivation**.
- Attempted the complete package build with a 240-second limit. It planned 485
  derivations plus 545 cache paths (~975 MiB compressed), fetched dependencies
  and built numerous pinned Python wheel derivations. The attempt timed out
  while still building dependencies (last observed: patchelf), with no reported
  build error. **The full package build has not been verified complete.**
- No live GUI/session launch, API calls, desktop startup or Hyprland window-rule
  test was performed. Other architectures have not been tested.
