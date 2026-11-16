import { expect, test } from "bun:test"
import { campsite, celestialVisibility, drawLandscape, mix, river, TOKYO, waterfallStrength } from "../ags/wallpaper-scene"
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

test("sun and moon progressively dim, then disappear at 90% cloud cover", () => {
  for (const hour of [12, 23]) {
    const date = new Date(2026, 0, 15, hour)
    const color = hour === 12 ? mix(TOKYO.gold, TOKYO.white, 0.4) : mix(TOKYO.blue, TOKYO.white, 0.85)
    for (const cloud of [0, 0.2, 0.55, 0.8, 0.9, 1]) {
      const environment = { ...resolveEnvironment(date), sunrise: 6, sunset: 18, cloud, moonPhase: 0.5, moonIllumination: 1 }
      const alphas: number[] = []
      drawLandscape((x, y, w, h, c, alpha = 1) => {
        if (y < 60 && c.every((v, i) => v === color[i])) alphas.push(alpha)
      }, 480, date, 0, undefined, environment)
      if (cloud >= 0.9) expect(alphas).toHaveLength(0)
      else {
        expect(alphas.length).toBeGreaterThan(0)
        expect(alphas.every(a => Math.abs(a - celestialVisibility(cloud)) < 1e-10)).toBe(true)
      }
    }
  }
  expect(celestialVisibility(0)).toBe(1)
  expect(celestialVisibility(0.55)).toBeCloseTo(0.5)
  expect(celestialVisibility(0.9)).toBe(0)
})

test("clouds have varied rounded profiles and move in front of the moon", () => {
  const date = new Date(2026, 0, 15, 23)
  const environment = { ...resolveEnvironment(date), cloud: 0.6, moonPhase: 0.5, moonIllumination: 1 }
  const moonColor = mix(TOKYO.blue, TOKYO.white, 0.85)
  let overlap = false
  for (let seconds = 0; seconds <= 1200 && !overlap; seconds += 40) {
    const rects: { x: number; y: number; w: number; h: number; alpha: number; moon: boolean }[] = []
    drawLandscape((x, y, w, h, c, alpha = 1) => {
      rects.push({ x, y, w, h, alpha, moon: c.every((v, i) => v === moonColor[i]) })
    }, 480, date, seconds, undefined, environment)
    const moon = rects.filter(r => r.moon)
    const clouds = rects.filter(r => r.y >= 25 && r.y < 125 && r.h === 2 && r.w > 5 && r.w < 140 && r.alpha > 0.4)
    expect(new Set(clouds.map(r => r.w)).size).toBeGreaterThan(10)
    const lastMoon = rects.findLastIndex(r => r.moon)
    for (const cloud of clouds) {
      expect(rects.indexOf(cloud)).toBeGreaterThan(lastMoon)
      if (moon.some(p => p.x >= cloud.x && p.x < cloud.x + cloud.w && p.y >= cloud.y && p.y < cloud.y + cloud.h)) overlap = true
    }
  }
  expect(overlap).toBe(true)
})

test("bridge spans both banks with a thin deck and open railing posts", () => {
  for (const width of [152, 480, 960]) {
    const date = new Date(2026, 0, 15, 12)
    const lip = river(192, width)
    const left = Math.floor(lip.center - lip.half - 9), right = Math.ceil(lip.center + lip.half + 9)
    const rects: { x: number; y: number; w: number; h: number }[] = []
    drawLandscape((x, y, w, h) => rects.push({ x, y, w, h }), width, date, 0)
    expect(rects.some(r => r.x === left && r.y === 187 && r.w === right - left && r.h === 4)).toBe(true)
    expect(rects.some(r => r.x === left && r.y === 181 && r.w === right - left && r.h === 1)).toBe(true)
    expect(rects.filter(r => r.y === 180 && r.w === 2 && r.h === 8).length).toBeGreaterThanOrEqual(3)
    expect(rects.filter(r => r.y === 190 && r.w === 5 && r.h === 10)).toHaveLength(2)
  }
})
