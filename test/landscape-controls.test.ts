import { describe, expect, test } from "bun:test"
import { DEFAULT_LANDSCAPE, manualScene, parseLandscapeSettings, seedManual, setManual, SLIDERS } from "../ags/landscape-controls-model"
import { advanceCrops } from "../ags/wallpaper-crops"
import { resolveEnvironment } from "../ags/wallpaper-weather"
import { drawLandscape, river, TOKYO } from "../ags/wallpaper-scene"
const date = new Date(2026, 5, 15, 13, 30), environment = resolveEnvironment(date), crops = advanceCrops(null, date)
const manual = () => ({ ...DEFAULT_LANDSCAPE, sync: false, manual: { ...DEFAULT_LANDSCAPE.manual } })

describe("landscape manual controls", () => {
  test("sync defaults on and bypasses manual settings without changing the farm", () => {
    const scene = manualScene(DEFAULT_LANDSCAPE, date, environment, crops)
    expect(scene.date).toBe(date); expect(scene.environment).toBe(environment); expect(scene.crops).toBe(crops)
    expect(setManual(DEFAULT_LANDSCAPE, "growth", 0.9)).toBe(DEFAULT_LANDSCAPE)
  })
  test("manual mode starts from the current real scene and normalizes ranges", () => {
    const seed = seedManual(date, environment, crops, 0.35)
    expect(seed.hour).toBe(13.5); expect(seed.growth).toBe(crops.growth); expect(seed.cpu).toBe(0.35)
    const settings = setManual(manual(), "hour", 50)
    expect(settings.manual.hour).toBe(23.99)
    expect(setManual(settings, "hour", NaN)).toBe(settings)
    expect(setManual(manual(), "season", 2.8).manual.season).toBe(3)
  })
  test("crop preview does not mutate persistent farm state; seasons choose crop types", () => {
    const before = JSON.stringify(crops)
    let settings = setManual(manual(), "growth", 0.9)
    for (const [season, crop] of [[0, "peas"], [1, "wheat"], [2, "pumpkins"], [3, "fallow"]] as const) {
      settings = setManual(settings, "season", season)
      const preview = manualScene(settings, date, environment, crops)
      expect(preview.crops.crop).toBe(crop)
      expect(preview.crops.growth).toBe(season === 3 ? 0 : 0.9)
    }
    expect(JSON.stringify(crops)).toBe(before)
    expect(manualScene({ ...settings, sync: true }, date, environment, crops).crops).toBe(crops)
  })
  test("harvest/growth stay consistent and weather presets remain editable", () => {
    let settings = setManual(manual(), "harvest", 0.5)
    expect(settings.manual.growth).toBe(1)
    settings = setManual(settings, "growth", 0.3)
    expect(settings.manual.harvest).toBe(0)
    settings = setManual(settings, "weather", 4)
    expect(settings.manual).toMatchObject({ temperature: -3, precip: 0.7, cloud: 0.8 })
    settings = setManual(settings, "cloud", 0.95)
    expect(settings.manual.cloud).toBe(0.95)
    expect(setManual(settings, "weather", 4)).toBe(settings)
  })
  test("manual time/moon/weather freeze independently of real conditions", () => {
    let settings = setManual(manual(), "hour", 23.5)
    settings = setManual(settings, "moonPhase", 0.25)
    settings = setManual(settings, "weather", 3)
    const scene = manualScene(settings, date, environment, crops)
    expect(scene.date.getHours()).toBe(23); expect(scene.date.getMinutes()).toBe(30)
    expect(scene.environment).toMatchObject({ weather: "rain", moonPhase: 0.25 })
    expect(scene.environment.moonIllumination).toBeCloseTo(0.5)
    expect(manualScene(settings, new Date(2026, 11, 15), { ...environment, windDirection: 90 }, crops).environment.windDirection).toBe(scene.environment.windDirection)
  })
  test("settings round-trip and reject corrupted/unknown files", () => {
    const settings = manual()
    expect(parseLandscapeSettings(JSON.stringify(settings))).toEqual(settings)
    for (const bad of [null, {}, { ...settings, version: 99 }, { ...settings, sync: 1 }, { ...settings, manual: {} }]) expect(() => parseLandscapeSettings(JSON.stringify(bad))).toThrow()
    for (const { key } of SLIDERS) expect(() => parseLandscapeSettings(JSON.stringify({ ...settings, manual: { ...settings.manual, [key]: null } }))).toThrow()
    expect(parseLandscapeSettings(JSON.stringify({ ...settings, manual: { ...settings.manual, wind: 10 } })).manual.wind).toBe(1)
  })
})

test("water shimmer interpolates between phases previously rounded to the same step", () => {
  function water(flow: number) {
    const marks: unknown[] = []
    drawLandscape((x, y, w, h, color, alpha) => {
      const channel = river(y, 480)
      if (y >= 192 && y <= 218 && color === TOKYO.white && Math.abs(x - channel.center) < channel.half) marks.push([x, y, w, h, alpha])
    }, 480, date, 120, { flow }, environment, crops)
    return marks
  }
  expect(Math.floor(0.01 * 6)).toBe(Math.floor(0.02 * 6))
  expect(water(0.01).length).toBeGreaterThan(50)
  expect(water(0.01)).not.toEqual(water(0.02))
})
