import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertNoSymlinks, themeFiles, updateIni } from "../scripts/apply-desktop-theme";

describe("desktop theme propagation", () => {
  test("writes reject leaf and ancestor symlinks, including dangling links", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sysdef-theme-links-"));
    try {
      const outside = path.join(root, "checkout");
      fs.mkdirSync(outside);
      fs.writeFileSync(path.join(outside, "gtk.css"), "/* shared */\n");
      fs.symlinkSync(outside, path.join(root, "gtk-4.0"));
      fs.symlinkSync(path.join(outside, "gtk.css"), path.join(root, "leaf.css"));
      fs.symlinkSync(path.join(root, "missing"), path.join(root, "dangling"));
      for (const file of ["gtk-4.0/gtk.css", "gtk-4.0/new.ini", "leaf.css", "dangling/new.ini"]) {
        expect(() => assertNoSymlinks(path.join(root, file))).toThrow("symlink");
      }
      expect(() => assertNoSymlinks(path.join(root, "new/nested/settings.ini"))).not.toThrow();
      expect(fs.readFileSync(path.join(outside, "gtk.css"), "utf8")).toBe("/* shared */\n");
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
  test("CLI rejects a symlinked config directory before changing any files", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "sysdef-theme-cli-"));
    try {
      const config = path.join(home, ".config"), outside = path.join(home, "checkout-gtk");
      fs.mkdirSync(config); fs.mkdirSync(outside);
      fs.writeFileSync(path.join(outside, "gtk.css"), "/* shared */\n");
      fs.symlinkSync(outside, path.join(config, "gtk-4.0"));
      for (const asset of ["share/themes/Tokyonight-Dark/gtk-4.0/gtk.css", "share/icons/Qogir-Dark", "share/Kvantum/Kvantum-Tokyo-Night", "lib/qt-6/plugins/styles/libkvantum.so", "lib/qt-6/plugins/platformthemes/libqt6ct.so"]) {
        const file = path.join(home, ".nix-profile", asset);
        fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, "");
      }
      const bin = path.join(home, "bin"); fs.mkdirSync(bin);
      fs.writeFileSync(path.join(bin, "gsettings"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
      const result = Bun.spawnSync([process.execPath, path.resolve(import.meta.dir, "../scripts/apply-desktop-theme.ts")], {
        env: { ...process.env, HOME: home, XDG_CONFIG_HOME: config, XDG_STATE_HOME: path.join(home, "state"), PATH: bin },
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toContain("Managed symlink");
      expect(fs.readFileSync(path.join(outside, "gtk.css"), "utf8")).toBe("/* shared */\n");
      expect(fs.existsSync(path.join(config, "gtk-3.0"))).toBe(false);
      expect(fs.existsSync(path.join(home, "state"))).toBe(false);
    } finally { fs.rmSync(home, { recursive: true, force: true }); }
  });
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
