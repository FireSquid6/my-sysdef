{ pkgs, ... }:
{
  networking = {
    networkmanager = {
      enable = true;
      dns = "systemd-resolved";
      plugins = with pkgs; [
        networkmanager-openconnect
        networkmanager-openvpn
      ];
    };
    # Preserve a host firewall without enabling two competing firewall managers.
    firewall.enable = true;
  };
  services = {
    resolved.enable = true;
    timesyncd.enable = true;
    blueman.enable = true;
    avahi = {
      enable = true;
      nssmdns4 = true;
    };
    printing.enable = true;
    tailscale.enable = true;
    openssh = {
      enable = true;
      # Credentials are installed by the operator, never copied from this machine.
      settings.PermitRootLogin = "no";
    };
    logrotate.enable = true;
    fwupd.enable = true;
  };
  hardware = {
    bluetooth = {
      enable = true;
      powerOnBoot = true;
    };
    enableRedistributableFirmware = true;
    firmware = with pkgs; [
      alsa-firmware
      sof-firmware
    ];
  };
  environment.systemPackages = with pkgs; [
    bluez
    dnsmasq
    iptables
    iwd
    modemmanager
    networkmanager-openconnect
    networkmanager-openvpn
    smartmontools
    usb-modeswitch
  ];
}
