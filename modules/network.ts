import type { ModuleGenerator } from "../sysdef-src/sysdef";


const m: ModuleGenerator = () => {
  return {
    name: "network",
    variables: {},
    files: {},
    directories: {},
    packages: {
      "yay": [
        "networkmanager",
        "network-manager-applet",
        "networkmanager-openconnect",
        "networkmanager-openvpn",
        "tailscale",
        "trayscale",
        "openssh",
        "firewalld",
        "iptables-nft",
        "iwd",
        "wpa_supplicant",
        "netctl",
        "dnsmasq",
        "nss-mdns",
        "nfs-utils",
        "xl2tpd",
        "waypipe",
        "modemmanager",
      ],
    }
  }
}

export default m;
