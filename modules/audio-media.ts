import type { ModuleGenerator } from "../sysdef-src/sysdef";


const m: ModuleGenerator = () => {
  return {
    name: "audio-media",
    variables: {},
    files: {},
    directories: {},
    packages: {
      "arch-official": [
        "alsa-firmware",
        "alsa-plugins",
        "alsa-utils",
        "pipewire-alsa",
        "pipewire-jack",
        "pipewire-pulse",
        "pavucontrol",
        "pamixer",
        "wireplumber",
        "rtkit",
        "gst-libav",
        "gst-plugin-pipewire",
        "gst-plugins-bad",
        "gst-plugins-ugly",
        "ffmpegthumbnailer",
        "sof-firmware",
        "libdvdcss",
        "tumbler",
      ],
    }
  }
}

export default m;
