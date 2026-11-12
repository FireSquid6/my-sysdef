import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import desktop from "../modules/desktop";

const repo = path.resolve(import.meta.dir, "..");
const configDir = path.join(repo, "dotfiles/sddm");
const script = path.join(repo, "scripts/install-sddm-theme.sh");
const read = (file: string) => fs.readFileSync(path.join(configDir, file), "utf8");
function ini(text: string) {
  return Object.fromEntries(text.split("\n").filter(line => /^[A-Za-z][A-Za-z0-9]*=/.test(line)).map(line => {
    const split = line.indexOf("=");
    return [line.slice(0, split), line.slice(split + 1).replace(/^"|"$/g, "")];
  }));
}
// Documented [General] keys in Keyitdev/sddm-astronaut-theme
// abb3163c724935af888ba5ea9ac0c4f22afd8048/Themes/astronaut.conf.
// Snapshot of the settings API only, not a vendored QML implementation.
const upstreamKeys = `ScreenWidth ScreenHeight ScreenPadding Font FontSize KeyboardSize RoundCorners Locale HourFormat DateFormat HeaderText
BackgroundPlaceholder Background BackgroundSpeed PauseBackground DimBackground CropBackground BackgroundHorizontalAlignment BackgroundVerticalAlignment
HeaderTextColor DateTextColor TimeTextColor FormBackgroundColor BackgroundColor DimBackgroundColor
LoginFieldBackgroundColor PasswordFieldBackgroundColor LoginFieldTextColor PasswordFieldTextColor UserIconColor PasswordIconColor
PlaceholderTextColor WarningColor LoginButtonTextColor LoginButtonBackgroundColor SystemButtonsIconsColor SessionButtonTextColor VirtualKeyboardButtonTextColor
DropdownTextColor DropdownSelectedBackgroundColor DropdownBackgroundColor HighlightTextColor HighlightBackgroundColor HighlightBorderColor
HoverUserIconColor HoverPasswordIconColor HoverSystemButtonsIconsColor HoverSessionButtonTextColor HoverVirtualKeyboardButtonTextColor
PartialBlur FullBlur BlurMax Blur HaveFormBackground FormPosition VirtualKeyboardPosition
HideVirtualKeyboard HideSystemButtons HideLoginButton UseRealName ForceLastUser PasswordFocus HideCompletePassword AllowEmptyPassword BypassSystemButtonsChecks RightToLeftLayout
TranslatePlaceholderUsername TranslatePlaceholderPassword TranslateLogin TranslateLoginFailedWarning TranslateCapslockWarning TranslateSuspend TranslateHibernate TranslateReboot TranslateShutdown TranslateSessionSelection TranslateVirtualKeyboardButtonOn TranslateVirtualKeyboardButtonOff`.split(/\s+/);

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sysdef-sddm-test-"));
  const root = path.join(dir, "root");
  const source = path.join(dir, "packaged theme");
  fs.mkdirSync(root);
  for (const part of ["Components", "Assets", "Themes", "Backgrounds", "Fonts", "translations"]) {
    fs.mkdirSync(path.join(source, part), { recursive: true });
  }
  fs.writeFileSync(path.join(source, "metadata.desktop"), "[SddmGreeterTheme]\nQtVersion=6\n");
  fs.writeFileSync(path.join(source, "Themes/astronaut.conf"), upstreamKeys.map(key => `${key}=""`).join("\n"));
  fs.writeFileSync(path.join(source, "Main.qml"), "// mock package runtime; not a rendering test\n");
  fs.writeFileSync(path.join(source, "Components/Input.qml"), "// mock input\n");
  fs.writeFileSync(path.join(source, "Assets/User.svg"), "<svg/>\n");
  fs.writeFileSync(path.join(source, "LICENSE"), "mock license\n");
  fs.writeFileSync(path.join(source, "translations/test.qm"), "mock translation\n");
  fs.writeFileSync(path.join(source, "Fonts/unused.ttf"), "unused font\n");
  fs.writeFileSync(path.join(source, "Backgrounds/unused.png"), "unused wallpaper\n");
  const target = path.join(root, "usr/local/share/sddm/themes/sysdef-tokyo-night");
  const conf = path.join(root, "etc/sddm.conf.d/90-sysdef-theme.conf");
  const run = (...args: string[]) => {
    const result = Bun.spawnSync(["bash", script, "--root", root, "--source", source, ...args]);
    return { code: result.exitCode, out: result.stdout.toString(), err: result.stderr.toString() };
  };
  return { dir, root, source, target, conf, run, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

describe("SDDM Astronaut integration", () => {
  test("desktop declares the Qt6 theme and its runtime dependencies", () => {
    const config = desktop({} as never);
    for (const dependency of ["sddm", "qt6-declarative", "qt6-svg", "qt6-virtualkeyboard", "qt6-multimedia-ffmpeg", "qt6-5compat", "ttf-jetbrains-mono-nerd"]) {
      expect(config.packages["arch-official"]).toContain(dependency);
    }
    expect(config.packages.aur).toContain("sddm-astronaut-theme");
  });
  test("uses only verified upstream settings and keeps authentication/session UI", () => {
    const settings = ini(read("theme.conf"));
    expect(Object.keys(settings).sort()).toEqual(upstreamKeys.toSorted());
    expect(settings).toMatchObject({
      Font: "JetBrainsMono Nerd Font", FormPosition: "center", Background: "", BackgroundColor: "#1a1b26",
      LoginFieldBackgroundColor: "#24283b", PasswordFieldBackgroundColor: "#24283b",
      LoginFieldTextColor: "#c0caf5", PasswordFieldTextColor: "#c0caf5",
      LoginButtonBackgroundColor: "#bb9af7", HighlightBorderColor: "#7aa2f7", WarningColor: "#f7768e",
      PartialBlur: "false", FullBlur: "false", HaveFormBackground: "false",
      HourFormat: "HH:mm", DateFormat: "dddd, dd MMMM yyyy", HideSystemButtons: "false",
      UseRealName: "false", ForceLastUser: "true", PasswordFocus: "true", HideCompletePassword: "true",
      AllowEmptyPassword: "false", BypassSystemButtonsChecks: "false",
    });
    expect(ini(read("metadata.desktop"))).toMatchObject({ MainScript: "Main.qml", ConfigFile: "theme.conf", QtVersion: "6" });
    const dropin = read("90-sysdef-theme.conf");
    expect(dropin).toContain("ThemeDir=/usr/local/share/sddm/themes");
    expect(dropin).toContain("Current=sysdef-tokyo-night");
    expect(dropin).toContain("InputMethod=qtvirtualkeyboard");
    expect(dropin).not.toMatch(/^(DisplayServer|Session|CompositorCommand|Autologin)=/m);
  });

  test("default dry run is read-only; staging copies runtime without modifying the package", () => {
    const f = fixture();
    try {
      expect(f.run().code).toBe(0);
      expect(fs.readdirSync(f.root)).toEqual([]);
      const result = f.run("--apply");
      expect(result.code).toBe(0);
      expect(result.out).toContain("No service was started");
      expect(fs.readFileSync(f.conf, "utf8")).toBe(read("90-sysdef-theme.conf"));
      expect(fs.readFileSync(path.join(f.target, "theme.conf"), "utf8")).toBe(read("theme.conf"));
      expect(fs.readFileSync(path.join(f.source, "metadata.desktop"), "utf8")).toBe("[SddmGreeterTheme]\nQtVersion=6\n");
      for (const part of ["Main.qml", "Components/Input.qml", "Assets/User.svg", "LICENSE", "translations/test.qm", "upstream.sha256"]) {
        expect(fs.existsSync(path.join(f.target, part))).toBe(true);
        expect(fs.lstatSync(path.join(f.target, part)).isSymbolicLink()).toBe(false);
      }
      expect(fs.statSync(f.target).mode & 0o777).toBe(0o755);
      expect(fs.statSync(f.conf).mode & 0o777).toBe(0o644);
      expect(fs.existsSync(path.join(f.target, "Backgrounds"))).toBe(false);
      expect(fs.existsSync(path.join(f.target, "Fonts"))).toBe(false);
      fs.writeFileSync(path.join(f.target, "theme.conf"), "previous local adjustment");
      expect(f.run("--apply").code).toBe(0);
      const backups = fs.readdirSync(path.dirname(f.target)).filter(name => name.startsWith(".sysdef-backup."));
      expect(backups).toHaveLength(1);
      expect(fs.readFileSync(path.join(path.dirname(f.target), backups[0]!, "theme/theme.conf"), "utf8")).toBe("previous local adjustment");
      expect(fs.readFileSync(path.join(f.target, "theme.conf"), "utf8")).toBe(read("theme.conf"));
    } finally { f.cleanup(); }
  });

  test("fails before writing for missing packages, Qt5, or incompatible settings", () => {
    const f = fixture();
    try {
      fs.writeFileSync(path.join(f.source, "metadata.desktop"), "QtVersion=5\n");
      expect(f.run("--apply").err).toContain("Qt6");
      fs.writeFileSync(path.join(f.source, "metadata.desktop"), "QtVersion=6\n");
      fs.writeFileSync(path.join(f.source, "Themes/astronaut.conf"), "Font=\n");
      expect(f.run("--apply").err).toContain("no longer documents setting");
      fs.rmSync(path.join(f.source, "Main.qml"));
      expect(f.run("--apply").err).toContain("incomplete upstream theme");
      expect(fs.readdirSync(f.root)).toEqual([]);
    } finally { f.cleanup(); }
  });

  test("preserves unmanaged destinations, symlink targets and competing local configuration", () => {
    const f = fixture();
    try {
      fs.mkdirSync(path.dirname(f.conf), { recursive: true });
      fs.writeFileSync(f.conf, "[Theme]\nCurrent=maya\n");
      expect(f.run("--apply").err).toContain("unmanaged config");
      expect(fs.readFileSync(f.conf, "utf8")).toContain("Current=maya");
      fs.rmSync(f.conf);
      fs.writeFileSync(path.join(f.root, "etc/sddm.conf"), "[Theme]\nCurrent=elarun\n");
      expect(f.run("--apply").err).toContain("competing theme/input settings");
      fs.rmSync(path.join(f.root, "etc/sddm.conf"));
      const other = path.join(path.dirname(f.conf), "99-other.conf");
      fs.writeFileSync(other, "[General]\nInputMethod=compose\n");
      expect(f.run("--apply").err).toContain("competing theme/input settings");
      fs.rmSync(other);
      fs.symlinkSync(f.source, f.conf);
      expect(f.run("--apply").err).toContain("refusing symlink");
      fs.rmSync(f.conf);
      fs.mkdirSync(f.target, { recursive: true });
      expect(f.run("--apply").err).toContain("unmanaged theme");
      expect(fs.existsSync(path.join(f.target, "Main.qml"))).toBe(false);
    } finally { f.cleanup(); }
  });

  test("validates command arguments and shell syntax", () => {
    const f = fixture();
    try {
      expect(f.run("--surprise").code).not.toBe(0);
      expect(f.run("--source").code).not.toBe(0);
      expect(Bun.spawnSync(["bash", "-n", script]).exitCode).toBe(0);
      const code = fs.readFileSync(script, "utf8");
      expect(code).not.toMatch(/^\s*(systemctl|service|curl|wget)\b/m);
      expect(code).not.toMatch(/^\s*sudo\b/m);
    } finally { f.cleanup(); }
  });
});
