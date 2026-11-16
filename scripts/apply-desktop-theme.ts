#!/usr/bin/env bun
// Scoped alternative to whole-home activation for the package-profile desktop.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function updateIni(source: string, section: string, values: Record<string, string>): string {
  const lines = source.trimEnd().split("\n");
  let start = lines.findIndex(line => line.trim() === `[${section}]`);
  if (start < 0) { lines.push(`[${section}]`); start = lines.length - 1; }
  let end = lines.findIndex((line, i) => i > start && /^\s*\[/.test(line));
  if (end < 0) end = lines.length;
  for (const [key, value] of Object.entries(values)) {
    const indices = lines.flatMap((line, i) => i > start && i < end && line.split("=", 1)[0].trim() === key ? [i] : []);
    if (indices.length) {
      lines[indices[0]!] = `${key}=${value}`;
      for (const i of indices.slice(1).reverse()) { lines.splice(i, 1); end--; }
    } else { lines.splice(end++, 0, `${key}=${value}`); }
  }
  return lines.join("\n").trimStart() + "\n";
}

export function themeFiles(configHome: string, home: string, profile: string): Map<string, string> {
  const read = (file: string) => fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const files = new Map<string, string>();
  for (const version of ["3.0", "4.0"]) {
    const file = path.join(configHome, `gtk-${version}/settings.ini`);
    files.set(file, updateIni(read(file), "Settings", {
      "gtk-theme-name": "Tokyonight-Dark",
      "gtk-application-prefer-dark-theme": "1",
      "gtk-icon-theme-name": "Qogir-Dark",
      "gtk-font-name": "Noto Sans 10",
    }));
  }
  // GTK4/libadwaita doesn't reliably honor gtk-theme-name. Import the packaged
  // stylesheet explicitly, preserving user CSS after it. No GTK_THEME override.
  const cssFile = path.join(configHome, "gtk-4.0/gtk.css");
  const css = read(cssFile).replace(/^@import url\([^\n]*\); \/\* sysdef desktop theme \*\/\n?/gm, "");
  const uri = pathToFileURL(path.join(profile, "share/themes/Tokyonight-Dark/gtk-4.0/gtk.css")).href;
  files.set(cssFile, `@import url("${uri}"); /* sysdef desktop theme */\n${css}`);
  const gtk2 = path.join(home, ".gtkrc-2.0");
  let rc = read(gtk2);
  for (const [key, value] of Object.entries({ "gtk-theme-name": "Tokyonight-Dark", "gtk-icon-theme-name": "Qogir-Dark", "gtk-font-name": "Noto Sans 10" })) {
    rc = rc.replace(new RegExp(`^\\s*${key}\\s*=.*\\n?`, "gm"), "");
    rc += `${rc && !rc.endsWith("\n") ? "\n" : ""}${key}="${value}"\n`;
  }
  files.set(gtk2, rc);
  for (const version of [5, 6]) {
    const file = path.join(configHome, `qt${version}ct/qt${version}ct.conf`);
    files.set(file, updateIni(read(file), "Appearance", { style: "kvantum", icon_theme: "Qogir-Dark" }));
  }
  const kvantum = path.join(configHome, "Kvantum/kvantum.kvconfig");
  files.set(kvantum, updateIni(read(kvantum), "General", { theme: "Kvantum-Tokyo-Night" }));
  return files;
}

if (import.meta.main) {
  const dryRun = process.argv.includes("--dry-run");
  if (process.argv.slice(2).some(arg => arg !== "--dry-run")) throw Error("Usage: bun scripts/apply-desktop-theme.ts [--dry-run]");
  const home = os.homedir(), profile = path.join(home, ".nix-profile");
  for (const asset of ["share/themes/Tokyonight-Dark/gtk-4.0/gtk.css", "share/icons/Qogir-Dark", "share/Kvantum/Kvantum-Tokyo-Night", "lib/qt-6/plugins/styles/libkvantum.so", "lib/qt-6/plugins/platformthemes/libqt6ct.so"]) {
    if (!fs.existsSync(path.join(profile, asset))) throw Error(`Missing Nix theme asset: ${asset}. Update the shared workstation profile with nix-update.sh first.`);
  }
  if (!Bun.which("gsettings")) throw Error("Missing required tool: gsettings");
  const configHome = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
  const changes = [...themeFiles(configHome, home, profile)].filter(([file, content]) => !fs.existsSync(file) || fs.readFileSync(file, "utf8") !== content);
  // Don't replace Home Manager links or write through any existing symlink.
  for (const [file] of changes) {
    if (fs.lstatSync(file, { throwIfNoEntry: false })?.isSymbolicLink()) throw Error(`Managed symlink: ${file}. Apply its owning Home Manager configuration instead.`);
  }
  const backup = path.join(process.env.XDG_STATE_HOME || path.join(home, ".local/state"), "sysdef/theme-backups", new Date().toISOString().replaceAll(":", "-"));
  for (const [file, content] of changes) {
    console.log(`${dryRun ? "Would update" : "Updating"} ${file}`);
    if (dryRun) continue;
    if (fs.existsSync(file)) {
      const dest = path.join(backup, file.replace(/^\/+/, ""));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(file, dest);
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  for (const [key, value] of [["gtk-theme", "Tokyonight-Dark"], ["icon-theme", "Qogir-Dark"], ["font-name", "Noto Sans 10"], ["color-scheme", "prefer-dark"]]) {
    if (dryRun) { console.log(`Would set org.gnome.desktop.interface ${key}=${value}`); continue; }
    const result = Bun.spawnSync(["gsettings", "set", "org.gnome.desktop.interface", key!, value!]);
    if (result.exitCode !== 0) throw Error(result.stderr.toString());
  }
  if (!dryRun) console.log(`Theme applied. Backups (if files existed): ${backup}\nReopen applications to pick up GTK4/Qt styling. No compositor or services restarted.`);
}
