# Herdr forks

The root flake pins `firesquid6/herdr-core` and `firesquid6/herdr-app` as
non-flake Git inputs, including their submodules. `default.nix` reuses the
nixpkgs `herdr-core` and `herdr-desktop` recipes with these sources and separately
hashed Cargo dependencies. `herdr-desktop` produces the `herdr-app` executable;
it is not a different application. Its core dependency is overridden too, so
its packaged fallback core is the same fork installed on PATH.

The workstation profile installs these packages instead of the unmodified
nixpkgs packages. They are also exposed as `.#herdr-core` and `.#herdr-desktop`.
Configuration files under `herdr/` still have the same Home Manager ownership.

## Updating

```sh
nix flake update herdr-core herdr-app
```

Update versions in `default.nix` to match each source's Cargo package version.
If Cargo dependencies change, replace the corresponding `fetchCargoVendor`
`hash` with `pkgs.lib.fakeHash`, build its `cargoDeps`, and use Nix's reported
actual hash. Then build both applications:

```sh
nix build --no-link --impure --expr \
  '(builtins.getFlake (toString ./.)).packages.x86_64-linux.herdr-core.cargoDeps'
nix build --no-link --impure --expr \
  '(builtins.getFlake (toString ./.)).packages.x86_64-linux.herdr-desktop.cargoDeps'
nix build --no-link .#herdr-core .#herdr-desktop
nix build --no-link .#checks.x86_64-linux.desktop-contract
```

The inherited Zig dependency hash and nixpkgs source patches must also be
reviewed when the forks change Ghostty or affected source files. Do not bypass
hash failures or failing patches. Nix updates are explicit; these recipes do
not invoke a mutable application installer or activate the system.
