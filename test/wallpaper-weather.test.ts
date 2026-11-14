import { describe, expect, test } from "bun:test"
import { parseWttr, resolveEnvironment } from "../ags/wallpaper-weather"

const now = new Date(2026, 0, 15, 12)
function fixture() {
  return { current_condition: [{ weatherCode: "308", cloudcover: "90", precipMM: "4", windspeedKmph: "40", winddirDegree: "270", temp_C: "8" }],
    nearest_area: [{ latitude: "-33.8" }], weather: [{ date: "2026-01-15", astronomy: [{ sunrise: "05:30 AM", sunset: "08:15 PM", moon_phase: "First Quarter", moon_illumination: "50" }] }] }
}
describe("wallpaper weather", () => {
  test("normalizes real wttr numeric strings, Celsius and local astronomy", () => {
    const env = resolveEnvironment(now, parseWttr(fixture(), now))
    expect(env).toMatchObject({ source: "wttr.in", season: "summer", weather: "rain", cloud: 0.9, precip: 0.5, wind: 0.5, windDirection: 270, temperature: 8, latitude: -33.8, sunrise: 5.5, sunset: 20.25, moonPhase: 0.25, moonIllumination: 0.5 })
  })
  test("selects meteorological seasons in both hemispheres", () => {
    const north = ["winter", "spring", "summer", "autumn"]
    const south = ["summer", "autumn", "winter", "spring"]
    for (let i = 0; i < 4; i++) {
      const date = new Date(2026, i * 3, 15, 12)
      const data = fixture()
      data.nearest_area[0]!.latitude = "45"
      expect(resolveEnvironment(date, parseWttr(data, date)).season).toBe(north[i])
      data.nearest_area[0]!.latitude = "-45"
      expect(resolveEnvironment(date, parseWttr(data, date)).season).toBe(south[i])
    }
  })
  test("maps named lunar phases and estimates unknown/malformed astronomy", () => {
    for (const [name, phase] of [["New Moon", 0], ["Waxing Crescent", 0.125], ["First Quarter", 0.25], ["Waxing Gibbous", 0.375], ["Full Moon", 0.5], ["Waning Gibbous", 0.625], ["Last Quarter", 0.75], ["Waning Crescent", 0.875]] as const) {
      const data = fixture(); data.weather[0]!.astronomy[0]!.moon_phase = name
      data.weather[0]!.astronomy[0]!.moon_illumination = String((1 - Math.cos(phase * Math.PI * 2)) * 50)
      expect(resolveEnvironment(now, parseWttr(data, now)).moonPhase).toBeCloseTo(phase, 10)
    }
    const data = fixture(); data.weather = []
    const env = resolveEnvironment(now, parseWttr(data, now))
    expect(env.source).toBe("wttr.in")
    expect(env.sunrise).toBeLessThan(env.sunset)
    expect(env.moonPhase).toBeGreaterThanOrEqual(0)
    expect(env.moonPhase).toBeLessThan(1)
  })
  test("reported illuminated area refines crescent geometry in both halves of the cycle", () => {
    const data = fixture(), astronomy = data.weather[0]!.astronomy[0]!
    astronomy.moon_phase = "Waxing Crescent"; astronomy.moon_illumination = "5"
    const waxing = resolveEnvironment(now, parseWttr(data, now)).moonPhase
    expect(waxing).toBeLessThan(0.125)
    expect((1 - Math.cos(waxing * 2 * Math.PI)) / 2).toBeCloseTo(0.05)
    astronomy.moon_phase = "Waning Crescent"
    expect(resolveEnvironment(now, parseWttr(data, now)).moonPhase).toBeCloseTo(1 - waxing)
  })
  test("saturates high wind/rain, estimates lunar age, and replaces invalid sun times", () => {
    const data = fixture()
    data.current_condition[0]!.precipMM = "100"
    data.current_condition[0]!.windspeedKmph = "200"
    data.current_condition[0]!.winddirDegree = "360"
    const astronomy = data.weather[0]!.astronomy[0]!
    astronomy.moon_phase = "unknown"
    astronomy.moon_illumination = "invalid"
    astronomy.sunrise = "No sunrise"; astronomy.sunset = "99:99 PM"
    const withAge = { ...data, weather: [{ ...data.weather[0], astronomy: [{ ...astronomy, moon_age: "7.38264721325" }] }] }
    const env = resolveEnvironment(now, parseWttr(withAge, now))
    expect(env).toMatchObject({ precip: 1, wind: 1, windDirection: 0, moonPhase: 0.25 })
    expect(env.moonIllumination).toBeCloseTo(0.5)
    expect(env.sunrise).toBeGreaterThan(0)
    expect(env.sunset).toBeLessThan(24)
    expect(env.sunrise).toBeLessThan(env.sunset)
  })
  test("rejects malformed current conditions, not silently inventing weather", () => {
    for (const data of [null, {}, { current_condition: [] }]) expect(() => parseWttr(data, now)).toThrow()
    for (const field of ["cloudcover", "precipMM", "windspeedKmph", "winddirDegree", "temp_C", "weatherCode"]) {
      const data = fixture(); (data.current_condition[0] as Record<string, unknown>)[field] = "garbage"
      expect(() => parseWttr(data, now)).toThrow()
    }
    const data = fixture(); data.current_condition[0]!.cloudcover = "101"
    expect(() => parseWttr(data, now)).toThrow()
  })
  test("expires observations after six hours while retaining hemisphere", () => {
    const observation = parseWttr(fixture(), now)
    expect(resolveEnvironment(new Date(+now + 6 * 3600000), observation).source).toBe("wttr.in")
    expect(resolveEnvironment(new Date(+now + 6 * 3600000 + 1), observation)).toMatchObject({ source: "fallback", weather: "clear", temperature: null, latitude: -33.8 })
    expect(resolveEnvironment(now).source).toBe("fallback")
    expect(resolveEnvironment(new Date(+now - 3600000), observation).source).toBe("fallback")
  })
  test("classifies wttr codes without treating snow or thunder as ordinary rain", () => {
    for (const [code, kind] of [[113, "clear"], [116, "cloudy"], [248, "fog"], [230, "snow"], [200, "storm"], [389, "storm"], [353, "rain"]]) {
      const data = fixture(); data.current_condition[0]!.weatherCode = String(code)
      expect(resolveEnvironment(now, parseWttr(data, now)).weather).toBe(kind)
    }
  })
  test("honors remote observation age and advances the lunar cycle across midnight", () => {
    const data = fixture()
    const old = { ...data, current_condition: [{ ...data.current_condition[0], localObsDateTime: "2026-01-15 01:00 AM" }] }
    expect(resolveEnvironment(now, parseWttr(old, now)).source).toBe("fallback")
    const late = new Date(2026, 0, 15, 23)
    const observation = parseWttr(data, late)
    expect(resolveEnvironment(new Date(+late + 2 * 3600000), observation).moonPhase).toBeGreaterThan(0.25)
  })
})
