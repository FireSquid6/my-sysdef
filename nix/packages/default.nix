{ pkgs, packageSources }:
let
  hermes = import ./hermes {
    inherit pkgs;
    upstream = packageSources.hermes;
  };
in
(import ./global-tools {
  inherit pkgs;
  # Reuse the Python build tooling already pinned by Hermes' upstream lockfile.
  inherit (hermes.upstream) inputs;
})
// pkgs.lib.optionalAttrs pkgs.stdenv.hostPlatform.isx86_64 (
  import ./desktop-apps { inherit pkgs; }
)
// (import ./herdr { inherit pkgs packageSources; })
// {
  inherit hermes;
  glances-cli = pkgs.callPackage ./glances-cli.nix { };
  s-nail = pkgs.callPackage ./s-nail.nix { };
  kvantum-tokyo-night = pkgs.callPackage ./kvantum-tokyo-night.nix { };
}
