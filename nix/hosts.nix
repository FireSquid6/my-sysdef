# Both desktops share one package/configuration profile. Only real host
# differences belong here. Review paths and GPU settings before remote adoption.
let
  user = {
    system = "x86_64-linux";
    username = "firesquid";
    homeDirectory = "/home/firesquid";
    checkout = "/home/firesquid/sysdef";
  };
  workstation = user // {
    profile = ./home/workstation.nix;
    workstation = true;
  };
in
{
  "firesquid@kotoko" = workstation // {
    hostname = "kotoko";
    graphics = {
      backend = "nvidia";
      version = "615.78.08";
      driverHash = "sha256-Pj9t3cLudnoIGFMAr3vjyyhuznZpjS3eNSRZl4LQf/4=";
    };
  };
  "firesquid@deisslaptop" = workstation // {
    hostname = "deisslaptop";
    # Unverified: do not reuse kotoko's NVIDIA driver or infer a GPU from a CPU.
    # Set { backend = "mesa"; } for a confirmed Mesa GPU, or provide the actual
    # NVIDIA version/hash. GUI/session launches fail clearly until configured.
    graphics = null;
  };
  "firesquid@minibox-one" = user // {
    checkout = "/home/firesquid/my-sysdef";
    profile = ./profiles/core.nix;
  };
  # Portable headless example, not an assumed physical machine.
  "firesquid@aarch64-linux" = user // {
    system = "aarch64-linux";
    checkout = "/home/firesquid/my-sysdef";
    profile = ./profiles/core.nix;
  };
}
