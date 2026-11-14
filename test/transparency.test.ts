import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
const root = path.resolve(import.meta.dir, "..")
const text = (file: string) => fs.readFileSync(path.join(root, file), "utf8")
const json = (file: string) => JSON.parse(text(file))

describe("background-only desktop translucency", () => {
  test("Alacritty supplies subtle background opacity without whole-window fading", () => {
    expect(text("dotfiles/alacritty.toml")).toMatch(/\[window\]\s+opacity = 0\.90/)
    expect(text("dotfiles/alacritty.toml")).toContain('background = "#1a1b26"')
  })
  test("the power menu window itself stays opaque, not just its inner panel", () => {
    expect(text("ags/style.css")).toMatch(/window\.sidebar\s*\{[^}]*background:\s*#1a1b26;/)
    expect(text("ags/sidebar.tsx")).toContain('class="sidebar"')
  })
  test("Neovim inherits the terminal background while floats retain contrast", () => {
    const spec = text("neovim/lua/plugins.lua")
    expect(spec).toContain("transparent = true")
    expect(spec).toContain('styles = { sidebars = "transparent", floats = "dark" }')
  })
  test("Pi conversation and tool panels use terminal defaults, not fake alpha colors", () => {
    const theme = json("pi/themes/tokyonight-night.json")
    for (const role of ["userMessageBg", "customMessageBg", "toolPendingBg", "toolSuccessBg", "toolErrorBg"]) expect(theme.colors[role]).toBe("")
    expect(theme.colors.selectedBg).toBe("selection")
    expect(theme.colors.searchMatchBg).toMatch(/^#[0-9a-f]{6}$/i)
    expect(theme.export).toEqual({ pageBg: "bg", cardBg: "bgDark", infoBg: "bgHighlight" })
  })
  test("Herdr keeps chrome opaque with translucent terminal backgrounds", () => {
    const settings = json("herdr/settings.json")
    expect(settings.theme).toBe("tokyonight-night")
    expect(settings.colors).toEqual({ background: "#1a1b2600", canvas: "#16161e00", chrome: "#16161eff" })
    const layout = json("herdr/layouts/tty.json")
    expect(layout.terminal_opacity).toBeGreaterThan(0)
    expect(layout.terminal_opacity).toBeLessThan(1)
    expect(layout.children.find((node: { id: string }) => node.id === "work").children
      .find((node: { id: string }) => node.id === "work-body").children[0].content.pane.background).toBe("#00000000")
    expect(text("herdr/mods/tty-changes/main.js")).toContain(".bg(t.chrome)")
    const theme = json("herdr/themes/tokyonight-night.json")
    expect(theme.colors.chrome).toBe("#16161e")
    expect(theme.colors.canvas).toBe("#16161e")
    for (const color of Object.values(theme.colors)) expect(color).toMatch(/^#[0-9a-f]{6}$/i)
    expect(theme.background).toBe("#1a1b26")
    expect(theme.ansi.every((color: string) => /^#[0-9a-f]{6}$/i.test(color))).toBe(true)
  })
  test("Herdr sidebar mods paint the theme chrome over a clear layout container", () => {
    const layout = json("herdr/layouts/tty.json")
    const sidebar = layout.children.find((node: { id: string }) => node.id === "sidebar")
    expect(sidebar.background).toBe("#00000000")
    for (const mod of ["tty-spaces", "tty-agents", "tty-workspace-chrome"]) {
      expect(text(`herdr/mods/${mod}/main.js`)).toContain(".bg(t.chrome)")
    }
  })
  test("OpenCode selects its custom Tokyo Night theme and only clears main surfaces", () => {
    expect(json("opencode/cli.json").theme.name).toBe("tokyonight-transparent")
    const { theme, defs } = json("opencode/themes/tokyonight-transparent.json")
    for (const role of ["background", "backgroundPanel", "diffContextBg"]) expect(theme[role]).toBe("none")
    expect(theme.backgroundElement.dark).toBe("darkStep3")
    expect(theme.diffAddedBg.dark).toBe("#20303b")
    expect(theme.diffRemovedBg.dark).toBe("#37222c")
    // Every reference resolves; no unsupported RGBA values in the V1-compatible theme.
    const check = (value: unknown): void => {
      if (typeof value === "object" && value) { Object.values(value).forEach(check); return }
      expect(typeof value).toBe("string")
      if (typeof value === "string" && value !== "none" && !/^#[0-9a-f]{6}$/i.test(value)) expect(defs[value]).toMatch(/^#[0-9a-f]{6}$/i)
    }
    check(theme)
  })
})
