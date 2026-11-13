import { describe, expect, test } from "bun:test"
import { drawLandscape, lighting, mix, river, TOKYO } from "../ags/wallpaper-scene"
import { createWallpaperModel, parseWallpaperMode, type WallpaperState } from "../ags/wallpaper-model"

const date = (hour: number, minute = 0, second = 0) => new Date(2026, 0, 15, hour, minute, second)
describe("Tokyo Night pixel landscape", () => {
  test("follows local clock with smooth day, dusk and nighttime aurora weights", () => {
    expect(lighting(date(0)).night).toBe(1)
    expect(lighting(date(12)).daylight).toBe(1)
    expect(lighting(date(12)).night).toBe(0)
    expect(lighting(date(6)).dusk).toBe(1)
    expect(lighting(date(18, 30)).dusk).toBe(1)
    for (const hour of [5, 7, 17, 20]) {
      const a = lighting(date(hour - 1, 59, 59)), b = lighting(date(hour))
      expect(Math.abs(a.daylight - b.daylight)).toBeLessThan(0.001)
      expect(Math.abs(a.night - b.night)).toBeLessThan(0.001)
    }
    expect(lighting(date(23, 59, 59)).night).toBe(lighting(date(0)).night)
  })
  test("palette mixing remains bounded and river widens toward the foreground", () => {
    expect(mix(TOKYO.night, TOKYO.blue, -1)).toEqual(TOKYO.night)
    expect(mix(TOKYO.night, TOKYO.blue, 2)).toEqual(TOKYO.blue)
    expect(river(269, 480).half).toBeGreaterThan(river(160, 480).half)
  })
  test("renders deterministic animated pixel geometry at narrow, normal and ultrawide sizes", () => {
    for (const width of [152, 480, 960]) for (const hour of [0, 6, 12, 18, 23]) {
      function frame(time: number) {
        const pixels: unknown[] = []
        drawLandscape((x, y, w, h, color, alpha = 1) => {
          expect([x, y, w, h, ...color, alpha].every(Number.isFinite)).toBe(true)
          expect(w).toBeGreaterThan(0); expect(h).toBeGreaterThan(0)
          expect(alpha).toBeGreaterThanOrEqual(0); expect(alpha).toBeLessThanOrEqual(1)
          expect(color.every(c => c >= 0 && c <= 255)).toBe(true)
          pixels.push([x, y, w, h, color, alpha])
        }, width, date(hour), time)
        return pixels
      }
      const a = frame(0)
      expect(a).toEqual(frame(0))
      expect(a).not.toEqual(frame(10))
    }
  })
})
describe("wallpaper mode selection", () => {
  test("loads only known preferences", () => {
    expect(parseWallpaperMode("hyprpaper\n")).toBe("hyprpaper")
    expect(parseWallpaperMode("garbage")).toBe("animated")
  })
  test("switches, persists, and restores the previous renderer after a failure", async () => {
    const calls: string[] = [], saved: string[] = [], states: WallpaperState[] = []
    let fail = false
    const model = createWallpaperModel("animated", async mode => { calls.push(mode); if (fail && mode === "animated") throw Error("failed") }, mode => saved.push(mode), s => states.push(s))
    await model.toggle()
    expect(states.at(-1)).toEqual({ mode: "hyprpaper", busy: false, error: "" })
    fail = true
    await model.toggle()
    expect(calls).toEqual(["hyprpaper", "animated", "hyprpaper"])
    expect(saved).toEqual(["hyprpaper"])
    expect(states.at(-1)?.error).toContain("failed")
    expect(states.at(-1)?.mode).toBe("hyprpaper")
  })
  test("shutdown ignores late renderer completion and does not persist it", async () => {
    let release!: () => void
    const saved: string[] = [], states: WallpaperState[] = []
    const model = createWallpaperModel("animated", () => new Promise<void>(resolve => { release = resolve }), mode => saved.push(mode), state => states.push(state))
    const pending = model.toggle()
    model.stop(); release(); await pending
    await model.toggle()
    expect(saved).toEqual([])
    expect(states).toHaveLength(1)
  })
  test("ignores overlapping toggles and rolls back persistence failures", async () => {
    let release!: () => void
    const calls: string[] = [], states: WallpaperState[] = []
    const model = createWallpaperModel("animated", async mode => { calls.push(mode); if (calls.length === 1) await new Promise<void>(resolve => { release = resolve }) }, () => { throw Error("disk full") }, s => states.push(s))
    const switching = model.toggle()
    await model.toggle()
    expect(calls).toEqual(["hyprpaper"])
    release(); await switching
    expect(calls).toEqual(["hyprpaper", "animated"])
    expect(states.at(-1)).toEqual({ mode: "animated", busy: false, error: "Error: disk full" })
  })
})
