import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ags from "../modules/ags";
import { trayPixels } from "../ags/tray-model";
import desktop from "../modules/desktop";
import { normalFilesystem } from "../sysdef-src/connections";
import { dryShell, syncFiles, VariableStore } from "../sysdef-src/sysdef";
import { batteryClass, batteryLabel, networkLabel, nmFields } from "../ags/system-model";
const root = path.resolve(import.meta.dir, "..");
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

describe("AGS module and integration", () => {
  test("links only its config directory, respects XDG, and is repeatable", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "sysdef-ags-")); dirs.push(home);
    const previous = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = home;
    try {
      const module = await ags(dryShell);
      const source = path.join(home, "ags");
      expect(module.name).toBe("ags");
      expect(module.directories).toEqual({ [source]: "./ags" });
      expect(module.packages.aur).toContain("aylurs-gtk-shell");
      fs.mkdirSync(path.join(home, "other-app"));
      fs.writeFileSync(path.join(home, "other-app/settings"), "untouched");
      for (let i = 0; i < 2; i++) await syncFiles([module], new VariableStore(), normalFilesystem, root);
      expect(fs.realpathSync(source)).toBe(path.join(root, "ags"));
      expect(fs.readFileSync(path.join(home, "other-app/settings"), "utf8")).toBe("untouched");
    } finally { if (previous === undefined) delete process.env.XDG_CONFIG_HOME; else process.env.XDG_CONFIG_HOME = previous; }
  });
  test("desktop no longer manages old shell dependencies or their files", async () => {
    const module = await desktop(dryShell);
    const packages = Object.values(module.packages).flat();
    for (const obsolete of ["waybar", "fuzzel", "rofi", "wofi", "dunst", "python-gobject", "gtk-layer-shell"])
      expect(packages).not.toContain(obsolete);
    expect(Object.keys(module.files).join("\n")).not.toMatch(/waybar|fuzzel|rofi|dunst/);
  });
  test("startup and shortcuts route through the single AGS shell", () => {
    const hypr = fs.readFileSync(path.join(root, "dotfiles/hypr/hyprland.lua"), "utf8");
    for (const menu of ["sidebar", "notifications", "projects", "monitors", "windows"]) expect(hypr).toContain(`ags .. "${menu}"`);
    expect(hypr).not.toMatch(/rofi|fuzzel|monitor-menu\.py/);
    expect(hypr).not.toContain("workspace-manager.ts daemon");
    expect(hypr).toContain(':find("--verify-config", 1, true)');
    expect(hypr).toContain('hl.env("PATH", (os.getenv("HOME") or "/home/firesquid") .. "/.bun/bin:"');
    expect(hypr).toContain('if os.getenv("WAYLAND_DISPLAY") and not');
    expect(hypr.indexOf('hl.env("PATH",')).toBeLessThan(hypr.indexOf('hl.on("hyprland.start"'));
    const startup = fs.readFileSync(path.join(root, "scripts/hypr-startup.sh"), "utf8");
    expect(startup).toContain("ags/start.sh");
    expect(hypr).toContain('hl.bind("SUPER + B", hl.dsp.exec_cmd(ags .. "notifications"))');
    expect(hypr).toContain('hl.bind("SUPER + P", hl.dsp.exec_cmd(ags .. "sidebar"))');
    expect(startup).not.toMatch(/waybar|dunst/);
    const launcher = fs.readFileSync(path.join(root, "ags/start.sh"), "utf8");
    expect(launcher).toContain("flock 9");
    expect(launcher).toContain("2>&1 9>&- &");
    expect(launcher).toContain("desktop.json");
    expect(launcher).toContain("export GDK_BACKEND=wayland");
    expect(launcher.indexOf("flock 9")).toBeLessThan(launcher.indexOf('bun "$root/scripts/workspace-manager.ts" daemon'));
    expect(launcher.indexOf("desktop.json")).toBeLessThan(launcher.indexOf('ags request --instance "$instance" ping'));
  });
});

describe("AGS sidebar styling", () => {
  test("matches the configured Hyprland outer gap, border and corner radius", () => {
    const hypr = fs.readFileSync(path.join(root, "dotfiles/hypr/hyprland.lua"), "utf8");
    const sidebar = fs.readFileSync(path.join(root, "ags/sidebar.tsx"), "utf8");
    const css = fs.readFileSync(path.join(root, "ags/style.css"), "utf8");
    const gap = Number(hypr.match(/gaps_out = (\d+)/)![1]);
    const border = Number(hypr.match(/border_size = (\d+)/)![1]);
    const rounding = Number(hypr.match(/rounding = (\d+)/)![1]);
    for (const edge of ["Top", "Bottom", "Left"]) expect(sidebar).toContain(`margin${edge}={${gap}}`);
    const panel = css.match(/\.sidebar-panel\s*\{([^}]+)\}/)![1]!;
    expect(panel).toContain(`border: ${border}px solid`);
    expect(panel).toContain(`border-radius: ${rounding}px`);
  });
});

describe("AGS bar presentation", () => {
  test("no logo, transparent status items, divider widgets and fixed-width ellipsized fields", () => {
    const bar = fs.readFileSync(path.join(root, "ags/bar.tsx"), "utf8");
    const css = fs.readFileSync(path.join(root, "ags/style.css"), "utf8");
    expect(bar).not.toContain('class="launcher"');
    expect(bar).toContain("Gtk.Separator");
    expect(bar.match(/<Divider \/>/g)!.length).toBeGreaterThanOrEqual(7);
    for (const item of ["audio", "battery", "notifications"]) expect(bar).toContain(`widthRequest={BAR_WIDTHS.${item}}`);
    expect(bar).toContain("widthRequest={workspaceWidth}");
    expect(bar.match(/maxWidthChars=\{1\}/g)!.length).toBe(4);
    expect(css).toMatch(/\.status-chip, \.status-readout[^}]*background: transparent[^}]*border: none/);
    expect(css).toContain(".status-chip:hover");
    expect(css).not.toMatch(/\.battery\.(warning|critical|charging)[^}]*background:/);
  });
});

describe("AGS system status", () => {
  test("tray pixmaps convert ARGB safely and reject oversized or malformed data", () => {
    expect(trayPixels([[1, 1, [128, 255, 64, 32]]])?.rgba).toEqual(new Uint8Array([255, 64, 32, 128]));
    expect(trayPixels([[10000, 10000, []]] )).toBeNull();
    expect(trayPixels([[2, 2, [255]]])).toBeNull();
    expect(trayPixels(null)).toBeNull();
  });
  test("NetworkManager escaping and connected-device preference", () => {
    expect(nmFields("wifi:connected:Office\\: north\\\\west")).toEqual(["wifi", "connected", "Office: north\\west"]);
    expect(networkLabel("ethernet:connected:Wired\nwifi:connected:Home")).toBe(" Home");
    expect(networkLabel("wifi:disconnected:\nloopback:connected:lo")).toBe("󱚼 Offline");
    expect(networkLabel("ethernet:connected:Wired")).toBe("󰈀 Wired");
  });
  test("battery thresholds and charging match the previous Tokyo Night bar", () => {
    expect(batteryLabel(99, "Charging")).toBe("󰂄 99%");
    expect(batteryLabel(140, "Full")).toBe(" 100%");
    expect(batteryClass(15, "Discharging")).toBe("critical");
    expect(batteryClass(30, "Discharging")).toBe("warning");
    expect(batteryClass(10, "Charging")).toBe("charging");
  });
});
