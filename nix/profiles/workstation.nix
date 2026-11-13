{
  imports = [ ./core.nix ];
  personal.modules = {
    applications.enable = true;
    desktop.enable = true;
    fonts.enable = true;
    network.enable = true;
    ags.enable = true;
  };
}
