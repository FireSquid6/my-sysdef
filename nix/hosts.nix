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
      version = "620.70.06";
      driverHash = "sha256-KRGOOr0IwHVZvMo9nHYjjQOUkK8DYqLlvPy+cgSv1LE=";
    };
  };
  "firesquid@deisslaptop" = workstation // {
    hostname = "deisslaptop";
    # Confirmed on deisslaptop: AMD Phoenix1 [1002:15bf], amdgpu kernel driver.
    # One DRM GPU; native Mesa/RADV, no NVIDIA or hybrid offload requirement.
    graphics = { backend = "mesa"; };
  };
  "firesquid@minibox-one" = user // {
    checkout = "/home/firesquid/my-sysdef";
    profile = ./home/minibox.nix;
    # Confirmed AMD Lucienne [1002:164c]; native kernel amdgpu, Mesa userspace.
    graphics = {
      backend = "mesa";
    };
  };
  # Portable headless example, not an assumed physical machine.
  "firesquid@aarch64-linux" = user // {
    system = "aarch64-linux";
    checkout = "/home/firesquid/my-sysdef";
    profile = ./profiles/core.nix;
  };
}
