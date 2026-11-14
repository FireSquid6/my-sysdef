import { describe, expect, test } from "bun:test"
import { campfireLight, drawLandscape, lighting, mix, moonPixelLit, river, TOKYO } from "../ags/wallpaper-scene"
import { resolveEnvironment, type LandscapeEnvironment } from "../ags/wallpaper-weather"
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
  test("lunar terminator distinguishes new, full and waxing/waning halves", () => {
    for (const x of [-0.6, 0, 0.6]) {
      expect(moonPixelLit(x, 0, 0)).toBe(false)
      expect(moonPixelLit(x, 0, 0.5)).toBe(true)
    }
    expect(moonPixelLit(0.6, 0, 0.25)).toBe(true)
    expect(moonPixelLit(-0.6, 0, 0.25)).toBe(false)
    expect(moonPixelLit(0.6, 0, 0.75)).toBe(false)
    expect(moonPixelLit(-0.6, 0, 0.75)).toBe(true)
    expect(moonPixelLit(1, 1, 0.5)).toBe(false)
  })
  test("campsite lights after the reported sunset and fades before sunrise", () => {
    const environment = { ...resolveEnvironment(date(12)), sunrise: 7, sunset: 17 }
    expect(campfireLight(date(12), environment)).toBe(0)
    expect(campfireLight(date(17), environment)).toBe(0)
    expect(campfireLight(date(17, 15), environment)).toBe(1)
    expect(campfireLight(date(0), environment)).toBe(1)
    expect(campfireLight(date(7), environment)).toBe(0)
    expect(campfireLight(date(6, 50), environment)).toBeGreaterThan(0)
    expect(lighting(date(18), environment).daylight).toBe(0)
  })
  test("lower ridges leave sky open and dense woodland preserves the mill-side fire clearing", () => {
    const environment = { ...resolveEnvironment(date(12)), season: "summer" as const, weather: "clear" as const, cloud: 0, precip: 0, sunrise: 6, sunset: 18 }
    type Rectangle = { x: number; y: number; w: number; h: number; color: readonly number[]; alpha: number }
    function frame(hour: number) {
      const rectangles: Rectangle[] = []
      drawLandscape((x, y, w, h, color, alpha = 1) => rectangles.push({ x, y, w, h, color, alpha }), 480, date(hour), 123, undefined, environment)
      return rectangles
    }
    const day = frame(12), night = frame(23)
    const ridges = day.filter(r => r.w === 1 && r.h > 10 && r.y < 160)
    expect(Math.min(...ridges.map(r => r.y))).toBeGreaterThanOrEqual(114)
    expect(day.filter(r => r.w === 2 && r.h >= 9).length).toBeGreaterThan(100)
    const smokeColor = mix(TOKYO.storm, TOKYO.white, 0.65)
    const smoke = (rectangles: Rectangle[]) => rectangles.filter(r => r.color.every((v, i) => v === smokeColor[i]) && r.alpha < 0.3)
    expect(smoke(day)).toHaveLength(0)
    expect(smoke(night)).toHaveLength(10)
    expect(smoke(night).every(r => r.x < river(207, 480).center && r.y < 234)).toBe(true)
  })
  test("seasons and weather change the scene without invalid geometry", () => {
    const scenes = new Set<string>()
    for (const season of ["spring", "summer", "autumn", "winter"] as const) for (const weather of ["clear", "cloudy", "fog", "rain", "snow", "storm"] as const) {
      const environment: LandscapeEnvironment = { ...resolveEnvironment(date(12)), season, weather, cloud: weather === "clear" ? 0 : 0.85, precip: 0.9, wind: 0.8, windDirection: 240, temperature: season === "winter" ? -4 : 15 }
      let digest = "", invalid = false
      drawLandscape((x, y, w, h, color, alpha = 1) => {
        if (![x, y, w, h, ...color, alpha].every(Number.isFinite) || w <= 0 || h <= 0 || alpha < 0 || alpha > 1 || color.some(c => c < 0 || c > 255)) invalid = true
        digest += `${x},${y},${w},${h},${color.join(",")},${alpha};`
      }, 480, date(23), 120, undefined, environment)
      expect(invalid).toBe(false)
      scenes.add(digest)
    }
    // Storm and rain may share geometry at identical supplied intensity, but
    // each season and each major atmospheric presentation must be distinct.
    expect(scenes.size).toBeGreaterThanOrEqual(20)
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
