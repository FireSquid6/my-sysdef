{
  pkgs,
  inputs ? { },
}:
{
  md-to-pdf = pkgs.callPackage ./md-to-pdf { };
  tommy-excalidraw-cli = pkgs.callPackage ./excalidraw-cli { };
  browser-use = import ./browser-use { inherit pkgs inputs; };
}
