# Explicit assumptions, not hardware detection. Review docs/nix-migration-assumptions.md.
# Change checkout/home here before first activation if a machine uses another path.
{
  "firesquid@minibox-one" = {
    system = "x86_64-linux";
    username = "firesquid";
    homeDirectory = "/home/firesquid";
    checkout = "/home/firesquid/my-sysdef";
    profile = ./profiles/core.nix;
  };
  "firesquid@desktop" = {
    system = "x86_64-linux";
    username = "firesquid";
    homeDirectory = "/home/firesquid";
    checkout = "/home/firesquid/my-sysdef";
    profile = ./profiles/workstation.nix;
  };
  "firesquid@deisslaptop" = {
    system = "x86_64-linux";
    username = "firesquid";
    homeDirectory = "/home/firesquid";
    checkout = "/home/firesquid/my-sysdef";
    profile = ./profiles/workstation.nix;
  };
  # Portable, explicitly selected headless example; no ARM machine is assumed to exist.
  "firesquid@aarch64-linux" = {
    system = "aarch64-linux";
    username = "firesquid";
    homeDirectory = "/home/firesquid";
    checkout = "/home/firesquid/my-sysdef";
    profile = ./profiles/core.nix;
  };
}
