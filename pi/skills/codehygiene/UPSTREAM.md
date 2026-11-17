# Upstream

Vendored unchanged from https://github.com/brianbell-x/codehygiene/tree/0221af718b51a56b6ee0fbea52f0bf42afa381bb/codehygiene
(commit `0221af718b51a56b6ee0fbea52f0bf42afa381bb`). Upstream declares MIT in `pyproject.toml`; no license file is supplied.

The runtime needs Python with NumPy. For a Nix-provided environment:

```sh
nix shell --impure --expr 'let pkgs = builtins.getFlake "nixpkgs"; in pkgs.legacyPackages.${builtins.currentSystem}.python3.withPackages (ps: [ ps.numpy ])' --command python3 -B ~/.pi/agent/skills/codehygiene --no-update-check --check --no-color <touched-files>
```

`--no-update-check` disables the upstream release network check. Updates to this vendored copy must be made in this checkout rather than with `npx skills update`.
