import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { themeFiles, updateIni } from "../scripts/apply-desktop-theme";

describe("desktop theme propagation", () => {
  test("INI updates preserve unrelated settings and sections, removing duplicate keys", () => {
    const source = "[Appearance]\nstyle=Fusion\nstyle=old\ncustom_palette=true\n[Other]\nstyle=untouched\n";
    const result = updateIni(source, "Appearance", { style: "kvantum", icon_theme: "Qogir-Dark" });
    expect(result).toBe("[Appearance]\nstyle=kvantum\ncustom_palette=true\nicon_theme=Qogir-Dark\n[Other]\nstyle=untouched\n");
    expect(updateIni(result, "Appearance", { style: "kvantum", icon_theme: "Qogir-Dark" })).toBe(result);
    expect(updateIni("", "Settings", { "gtk-theme-name": "Tokyonight-Dark" })).toBe("[Settings]\ngtk-theme-name=Tokyonight-Dark\n");
  });
  test("GTK and Qt config is consistent and repeatable, retaining custom CSS", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "sysdef-theme-"));
    try {
      const config = path.join(home, ".config"), profile = path.join(home, ".nix-profile");
      fs.mkdirSync(path.join(config, "gtk-4.0"), { recursive: true });
      fs.writeFileSync(path.join(config, "gtk-4.0/gtk.css"), "/* custom */\n");
      const files = themeFiles(config, home, profile);
      const get = (file: string) => files.get(path.join(config, file))!;
      for (const version of ["3.0", "4.0"]) {
        expect(get(`gtk-${version}/settings.ini`)).toContain("gtk-theme-name=Tokyonight-Dark");
        expect(get(`gtk-${version}/settings.ini`)).toContain("gtk-application-prefer-dark-theme=1");
      }
      expect(get("gtk-4.0/gtk.css")).toContain("Tokyonight-Dark/gtk-4.0/gtk.css");
      expect(get("gtk-4.0/gtk.css")).toEndWith("/* custom */\n");
      for (const version of [5, 6]) expect(get(`qt${version}ct/qt${version}ct.conf`)).toContain("style=kvantum");
      expect(get("Kvantum/kvantum.kvconfig")).toContain("theme=Kvantum-Tokyo-Night");
      for (const [file, content] of files) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, content);
      }
      expect(themeFiles(config, home, profile)).toEqual(files);
    } finally { fs.rmSync(home, { recursive: true, force: true }); }
  });
});
