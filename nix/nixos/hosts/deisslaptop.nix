{ lib, ... }:
{
  # Installation contract, NOT a copy of the live Arch partition table.
  # Generate/import hardware-configuration.nix on the target and override these
  # mkDefault mounts if using different labels/layout. Never reformat the live
  # machine merely to satisfy this example.
  networking.hostName = "deisslaptop";
  nixpkgs.hostPlatform = "x86_64-linux";
  boot = {
    loader = {
      systemd-boot.enable = lib.mkDefault true;
      efi.canTouchEfiVariables = lib.mkDefault true;
    };
    initrd.availableKernelModules = [
      "nvme"
      "xhci_pci"
      "usb_storage"
      "sd_mod"
    ];
    kernelModules = [ "kvm-amd" ];
  };
  hardware.cpu.amd.updateMicrocode = true;
  fileSystems."/" = {
    device = lib.mkDefault "/dev/disk/by-label/nixos";
    fsType = lib.mkDefault "ext4";
  };
  fileSystems."/boot" = {
    device = lib.mkDefault "/dev/disk/by-label/EFI";
    fsType = lib.mkDefault "vfat";
  };
  # Fresh-install state compatibility, independent of subsequent channel updates.
  system.stateVersion = "26.11";
}
