import type { ModuleGenerator } from "../sysdef-src/sysdef";


const m: ModuleGenerator = () => {
  return {
    name: "file-management",
    variables: {},
    files: {},
    directories: {},
    packages: {
      "yay": [
        "thunar",
        "thunar-archive-plugin",
        "thunar-media-tags-plugin",
        "thunar-volman",
        "file-roller",
        "gvfs",
        "gvfs-afc",
        "gvfs-gphoto2",
        "gvfs-mtp",
        "gvfs-nfs",
        "gvfs-smb",
        "libgsf",
        "libopenraw",
        "poppler-glib",
        "exo",
      ],
    }
  }
}

export default m;
