import { expect, test } from "bun:test"
import { campsite, drawLandscape, mix, precipitationLanding, precipitationPhase, river, TOKYO } from "../ags/wallpaper-scene"
import { resolveEnvironment } from "../ags/wallpaper-weather"

test("precipitation lands on terrain, water, and the front-facing building surfaces", () => {
  for (const width of [152, 480, 960]) {
    const surfaces = new Set<string>()
    const camp = campsite(width)
    const millX = Math.floor(river(207, width).center - river(207, width).half - 1) - 35
    for (let i = 0; i < 2000; i++) {
      const hit = precipitationLanding(i, width)
      expect(hit.x).toBeGreaterThanOrEqual(0)
      expect(hit.x).toBeLessThan(width)
      expect(hit.y).toBeGreaterThanOrEqual(176)
      expect(hit.y).toBeLessThan(270)
      surfaces.add(hit.surface)
      if (hit.surface === "roof") expect(hit.y).toBe(176 + Math.ceil(Math.abs(hit.x - millX - 14) / 1.5))
      if (hit.surface === "tent") expect(hit.y).toBe(camp.tentY + Math.ceil(Math.abs(hit.x - camp.tentX) / 0.72))
      if (hit.surface === "water") expect(Math.abs(hit.x - river(hit.y, width).center)).toBeLessThan(river(hit.y, width).half)
    }
    expect([...surfaces].sort()).toEqual(["ground", "roof", "tent", "water"])
  }
})

test("rain and snow transition from falling to impact and repeat deterministically", () => {
  for (const snow of [false, true]) for (const width of [152, 480, 960]) {
    const hit = precipitationLanding(7, width)
    let previous = precipitationPhase(7, 0, snow, 0.8, hit.y)
    let transitions = 0
    for (let step = 1; step <= 4000; step++) {
      const seconds = step / 100
      const phase = precipitationPhase(7, seconds, snow, 0.8, hit.y)
      expect(phase).toEqual(precipitationPhase(7, seconds, snow, 0.8, hit.y))
      expect(phase.progress).toBeGreaterThanOrEqual(0)
      expect(phase.progress).toBeLessThan(1)
      if (previous.falling && !phase.falling) {
        expect(previous.progress).toBeGreaterThan(0.98)
        expect(phase.progress).toBeLessThan(0.04)
        transitions++
      }
      previous = phase
    }
    expect(transitions).toBeGreaterThan(0)
  }
})

test("snow coats the roof and tent slopes without coating walls or the tent entrance", () => {
  const date = new Date(2026, 6, 15, 12)
  const environment = { ...resolveEnvironment(date), season: "summer" as const, cloud: 0, precip: 0.9, sunrise: 6, sunset: 18, temperature: 5 }
  const width = 480, camp = campsite(width)
  const millX = Math.floor(river(207, width).center - river(207, width).half - 1) - 35
  for (const weather of ["clear", "rain", "snow"] as const) {
    const roof: { x: number; y: number; h: number }[] = [], tent: typeof roof = []
    const roofColor = mix(TOKYO.night, TOKYO.white, 0.8 * 1.1)
    const tentColor = mix(TOKYO.night, TOKYO.white, 0.8 * 1.05)
    drawLandscape((x, y, w, h, c) => {
      if (w !== 1) return
      if (x >= millX - 2 && x <= millX + 30 && y < 190 && c.every((v, i) => Math.abs(v - roofColor[i]!) < 1e-9)) roof.push({ x, y, h })
      if (c.every((v, i) => Math.abs(v - tentColor[i]!) < 1e-9)) tent.push({ x, y, h })
    }, width, date, 123, undefined, { ...environment, weather })
    if (weather !== "snow") { expect(roof).toHaveLength(0); expect(tent).toHaveLength(0); continue }
    expect(roof).toHaveLength(33)
    expect(tent).toHaveLength(23)
    expect(roof.every(r => r.y === 175 + Math.ceil(Math.abs(r.x - millX - 14) / 1.5) && r.y + r.h <= 190)).toBe(true)
    expect(tent.every(r => r.y === camp.tentY - 1 + Math.ceil(Math.abs(r.x - camp.tentX) / 0.72))).toBe(true)
    expect(tent.filter(r => r.y > camp.tentY + 5).every(r => Math.abs(r.x - camp.tentX) >= 5)).toBe(true)
  }
})
