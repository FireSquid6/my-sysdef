import type { ModuleGenerator } from "../sysdef-src/sysdef";


const m: ModuleGenerator = () => {
  return {
    name: "system-core",
    variables: {},
    files: {},
    directories: {},
    packages: {
      "arch-official": [
        "base",
        "base-devel",
        "linux",
        "linux-firmware",
        "linux-headers",
        "kernel-install-for-dracut",
        "systemd-sysvcompat",
        "cryptsetup",
        "lvm2",
        "btrfs-progs",
        "e2fsprogs",
        "xfsprogs",
        "f2fs-tools",
        "jfsutils",
        "nilfs-utils",
        "ntfs-3g",
        "exfatprogs",
        "dosfstools",
        "device-mapper",
        "dmraid",
        "mdadm",
        "dracut",
        "efibootmgr",
        "efitools",
        "amd-ucode",
        "mtools",
        "logrotate",
        "man-db",
        "garcon",
        "man-pages",
      ],
    }
  }
}

export default m;
