import { expect, test } from "bun:test"
import { campsite, drawLandscape, mix, river, TOKYO, waterfallStrength } from "../ags/wallpaper-scene"
import { resolveEnvironment } from "../ags/wallpaper-weather"

test("campfire and its full ground glow stay back on dry land at all output widths", () => {
  for (const width of [152, 320, 480, 640, 960, 1920]) {
    const camp = campsite(width)
    expect(camp.fireY).toBeLessThan(234)
    expect(camp.tentY).toBeLessThan(212)
    for (let y = camp.fireY - camp.glowRadius; y <= camp.fireY + camp.glowRadius; y++) {
      const r = river(y, width)
      expect(camp.fireX + camp.glowRadius).toBeLessThan(r.center - r.half - 2)
    }
    for (let y = camp.tentY; y <= camp.tentY + 19; y++) {
      const r = river(y, width)
      expect(camp.tentX + 16).toBeLessThan(r.center - r.half - 2)
    }
  }
})

test("waterfall fades through the lower current and river bends have continuous tangents", () => {
  expect(waterfallStrength(207)).toBe(1)
  expect(waterfallStrength(218)).toBeGreaterThan(0.5)
  expect(waterfallStrength(230)).toBeGreaterThan(0)
  expect(waterfallStrength(236)).toBe(0)
  for (let y = 208; y <= 236; y++) {
    expect(waterfallStrength(y)).toBeLessThanOrEqual(waterfallStrength(y - 1))
    expect(waterfallStrength(y - 1) - waterfallStrength(y)).toBeLessThan(0.052)
  }
  for (const width of [152, 480, 960]) for (const y of [180, 192, 218, 230]) {
    const epsilon = 0.0001
    const left = (river(y, width).center - river(y - epsilon, width).center) / epsilon
    const right = (river(y + epsilon, width).center - river(y, width).center) / epsilon
    expect(Math.abs(left - right)).toBeLessThan(0.002)
  }
})

test("full moon stays bright under overcast skies and is drawn behind passing clouds", () => {
  const date = new Date(2026, 0, 15, 23)
  const environment = { ...resolveEnvironment(date), weather: "cloudy" as const, cloud: 1, moonPhase: 0.5, moonIllumination: 1 }
  const moonColor = mix(TOKYO.blue, TOKYO.white, 0.85)
  let overlap = false
  for (let seconds = 0; seconds <= 600 && !overlap; seconds += 20) {
    const rects: { x: number; y: number; w: number; h: number; alpha: number; moon: boolean }[] = []
    drawLandscape((x, y, w, h, color, alpha = 1) => {
      rects.push({ x, y, w, h, alpha, moon: w === 1 && h === 1 && color.every((c, i) => c === moonColor[i]) })
    }, 480, date, seconds, undefined, environment)
    const moon = rects.filter(r => r.moon)
    expect(moon.length).toBeGreaterThan(200)
    expect(moon.every(r => r.alpha === 1)).toBe(true)
    const lastMoon = rects.findLastIndex(r => r.moon)
    for (let i = 0; i < rects.length; i++) {
      const cloud = rects[i]!
      if (!((cloud.w === 34 && cloud.h === 4) || (cloud.w === 70 && cloud.h === 10))) continue
      expect(i).toBeGreaterThan(lastMoon)
      if (moon.some(pixel => pixel.x >= cloud.x && pixel.x < cloud.x + cloud.w && pixel.y >= cloud.y && pixel.y < cloud.y + cloud.h)) {
        expect(cloud.alpha).toBeGreaterThan(0)
        expect(cloud.alpha).toBeLessThan(1)
        overlap = true
      }
    }
  }
  expect(overlap).toBe(true)
})
