import { describe, expect, test } from "bun:test"
import { advanceMotion, cpuUsage, filesystemUsage, parseCpu, resourceLevel, type Resources } from "../ags/wallpaper-resources"
import { advanceCrops, type CropState } from "../ags/wallpaper-crops"
import { campsite, drawLandscape, mix, river, supplyCounts, supplyYard, TOKYO } from "../ags/wallpaper-scene"
import { resolveEnvironment } from "../ags/wallpaper-weather"

describe("wallpaper resource sampling", () => {
  test("uses aggregate CPU deltas, includes iowait in idle, and excludes duplicate guest counters", () => {
    const first = parseCpu("cpu  100 20 30 400 50 6 7 8 90 10\ncpu0 1 2 3 4")!
    expect(first).toEqual({ total: 621, idle: 450 })
    const next = parseCpu("cpu  150 20 40 420 60 6 7 8 100 10")!
    expect(cpuUsage(first, next)).toBeCloseTo(2 / 3)
    expect(cpuUsage(null, next)).toBeNull()
    expect(cpuUsage(next, first)).toBeNull()
    expect(cpuUsage(first, first)).toBeNull()
    expect(parseCpu("cpu0 1 2 3 4")).toBeNull()
    expect(parseCpu("cpu 1 bad 3 4")).toBeNull()
    expect(parseCpu("cpu 1 -2 3 4")).toBeNull()
  })
  test("smooths changing load and integrates phase without jumps or reversing", () => {
    const start = { cpu: 0, flow: 10 }
    const idle = advanceMotion(start, { cpu: 0 }, 0.125)
    const loaded = advanceMotion(start, { cpu: 1 }, 0.125)
    expect(idle.flow).toBeGreaterThan(start.flow)
    expect(loaded.flow).toBeGreaterThan(idle.flow)
    expect(loaded.cpu).toBeGreaterThan(0)
    expect(loaded.cpu).toBeLessThan(1)
    const slowing = advanceMotion({ cpu: 1, flow: 20 }, { cpu: 0 }, 0.125)
    expect(slowing.cpu).toBeLessThan(1)
    expect(slowing.cpu).toBeGreaterThan(0)
    expect(slowing.flow).toBeGreaterThan(20)
    expect(advanceMotion(start, { cpu: NaN }, NaN)).toEqual(start)
    expect(advanceMotion(start, { cpu: 1 }, 3600)).toEqual(advanceMotion(start, { cpu: 1 }, 1))
    const full = advanceMotion(start, { cpu: 1 }, 1)
    let stepped = start
    for (let i = 0; i < 8; i++) stepped = advanceMotion(stepped, { cpu: 1 }, 0.125)
    expect(stepped.cpu).toBeCloseTo(full.cpu)
    expect(Math.abs(stepped.flow - full.flow)).toBeLessThan(0.04)
  })
})

function raster(flow: number, crops: CropState, memory = 0, resources: Partial<Resources> = {}) {
  const pixels = new Uint8ClampedArray(480 * 270 * 3)
  // An old caller's RAM value must not influence either crops or water.
  const activity = { flow, memory, ...resources }
  drawLandscape((x, y, w, h, rgb, alpha = 1) => {
    for (let py = Math.max(0, Math.floor(y)); py < Math.min(270, y + h); py++) {
      for (let px = Math.max(0, Math.floor(x)); px < Math.min(480, x + w); px++) {
        const offset = (py * 480 + px) * 3
        for (let c = 0; c < 3; c++) pixels[offset + c] = pixels[offset + c]! * (1 - alpha) + rgb[c]! * alpha
      }
    }
  }, 480, new Date(2026, 0, 15, 12), 100, activity, undefined, crops)
  return pixels
}
test("calendar growth changes only the field; legacy memory input is ignored; CPU flow animates water and mill", () => {
  const seed = { ...advanceCrops(null, new Date(2026, 5, 1)), growth: 0 }
  const ripe = { ...seed, growth: 1 }, harvesting = { ...ripe, harvest: 0.5 }
  const empty = raster(0, seed), full = raster(0, ripe), cut = raster(0, harvesting), moving = raster(2, seed)
  expect(full).toEqual(raster(0, ripe, 1))
  let crops = 0, water = 0, wheel = 0, reaped = 0
  for (let y = 0; y < 270; y++) for (let x = 0; x < 480; x++) {
    const offset = (y * 480 + x) * 3
    const changed = (a: Uint8ClampedArray, b: Uint8ClampedArray) => [0, 1, 2].some(c => a[offset + c] !== b[offset + c])
    if (changed(empty, full) || changed(full, cut)) {
      expect(x).toBeGreaterThan(300); expect(x).toBeLessThan(425)
      expect(y).toBeGreaterThan(200); expect(y).toBeLessThan(251)
      crops++
    }
    if (changed(full, cut)) reaped++
    if (changed(empty, moving) && x > 270 && x < 300 && y > 192 && y < 225) water++
    if (changed(empty, moving) && x > 250 && x < 277 && y > 195 && y < 220) wheel++
  }
  expect(crops).toBeGreaterThan(200)
  expect(reaped).toBeGreaterThan(100)
  expect(water).toBeGreaterThan(20)
  expect(wheel).toBeGreaterThan(20)
  const peas = raster(0, { ...ripe, crop: "peas" }), pumpkins = raster(0, { ...ripe, crop: "pumpkins" })
  expect(peas).not.toEqual(full)
  expect(pumpkins).not.toEqual(full)
  expect(pumpkins).not.toEqual(peas)
})

test("disk capacity rejects invalid stats and uses total minus free space", () => {
  expect(filesystemUsage(1000, 400)).toBe(0.6)
  expect(filesystemUsage(1000, 0)).toBe(1)
  expect(filesystemUsage(1000, 1000)).toBe(0)
  for (const [size, free] of [[0, 0], [-1, 0], [10, 11], [10, -1], [NaN, 0], [10, Infinity]]) expect(filesystemUsage(size!, free!)).toBeNull()
})

test("RAM smooths over seconds and crate levels have hysteresis", () => {
  expect(resourceLevel(0)).toBe(0)
  expect(resourceLevel(0.5)).toBe(5)
  expect(resourceLevel(1)).toBe(10)
  expect(resourceLevel(0.51, 4)).toBe(4)
  expect(resourceLevel(0.53, 4)).toBe(5)
  expect(resourceLevel(0.49, 5)).toBe(5)
  expect(resourceLevel(0.47, 5)).toBe(4)
  const start = { cpu: 0, flow: 0, ram: 0.4, ramCrates: 4, disk: 0.2 }
  const next = advanceMotion(start, { cpu: 0, ram: 1, disk: 0.8 }, 1)
  expect(next.ram!).toBeGreaterThan(0.4)
  expect(next.ram!).toBeLessThan(0.6)
  expect(next.disk).toBe(0.8)
  let split = start
  for (let i = 0; i < 10; i++) split = advanceMotion(split, { cpu: 0, ram: 1, disk: 0.8 }, 0.1) as typeof start
  expect(split.ram).toBeCloseTo(next.ram!, 10)
  expect(split.ramCrates).toBe(next.ramCrates)
  expect(advanceMotion(next, { cpu: 0 }, 1).ram).toBe(next.ram)
})

test("RAM changes only the crate pile and disk changes only the woodshed", () => {
  const crops = advanceCrops(null, new Date(2026, 5, 1))
  const empty = raster(0, crops, 0, { ram: 0, disk: 0 })
  for (const [resources, minX, maxX] of [[{ ram: 1, disk: 0 }, 149, 181], [{ ram: 0, disk: 1 }, 118, 146]] as const) {
    const full = raster(0, crops, 0, resources)
    let changed = 0
    for (let y = 0; y < 270; y++) for (let x = 0; x < 480; x++) {
      const offset = (y * 480 + x) * 3
      if (![0, 1, 2].some(c => empty[offset + c] !== full[offset + c])) continue
      expect(x).toBeGreaterThanOrEqual(minX)
      expect(x).toBeLessThanOrEqual(maxX)
      expect(y).toBeGreaterThanOrEqual(176)
      expect(y).toBeLessThan(196)
      changed++
    }
    expect(changed).toBeGreaterThan(50)
  }
})

test("supplies range from one to ten freestanding crates and one to twenty logs", () => {
  expect(supplyCounts({})).toEqual({ crates: 1, logs: 1 })
  expect(supplyCounts({ ram: 0, disk: 0 })).toEqual({ crates: 1, logs: 1 })
  expect(supplyCounts({ ram: 0.5, disk: 0.5 })).toEqual({ crates: 5, logs: 10 })
  expect(supplyCounts({ ram: 1, disk: 1 })).toEqual({ crates: 10, logs: 20 })
  expect(supplyCounts({ ram: 0.51, ramCrates: 4, disk: 0.95 })).toEqual({ crates: 4, logs: 19 })
  const date = new Date(2026, 6, 15, 12)
  const environment = { ...resolveEnvironment(date), season: "summer" as const, weather: "clear" as const, cloud: 0, precip: 0, sunrise: 6, sunset: 18 }
  const yard = supplyYard(480)
  for (const usage of [0, 0.5, 1]) {
    const rects: { x: number; y: number; w: number; h: number; c: readonly number[] }[] = []
    drawLandscape((x, y, w, h, c) => rects.push({ x, y, w, h, c }), 480, date, 0, { flow: 0, ram: usage, disk: usage }, environment)
    const counts = supplyCounts({ ram: usage, disk: usage })
    expect(rects.filter(r => r.x >= yard.x + 32 && r.x < yard.x + 64 && r.y < yard.base && r.w === 5 && r.h === 5)).toHaveLength(counts.crates)
    expect(rects.filter(r => r.x >= yard.x && r.x < yard.x + 26 && r.y < yard.base && r.w === 2 && r.h === 4)).toHaveLength(counts.logs)
    // No former backboard or enclosing rack remains around the crate pile.
    expect(rects.some(r => r.x === yard.x + 32 && r.y === yard.base - 14 && r.w === 31 && r.h === 14)).toBe(false)
    const roofColor = mix(TOKYO.night, TOKYO.pink, 0.8 * 0.65)
    expect(rects.filter(r => r.x >= yard.x - 1 && r.x < yard.x + 28 && r.y >= yard.base - 24 && r.y < yard.base - 19 && r.c.every((v, i) => v === roofColor[i]))).toHaveLength(5)
  }
})

test("two campfire benches stay on dry ground and leave the tent approach open", () => {
  for (const width of [152, 480, 960, 1920]) {
    const camp = campsite(width)
    const benches: { x: number; y: number; w: number }[] = []
    drawLandscape((x, y, w, h) => {
      if (x === camp.fireX - 7 && w === 15 && h === 2) benches.push({ x, y, w })
    }, width, new Date(2026, 6, 15, 12), 0)
    expect(benches.map(b => b.y)).toEqual([camp.fireY - 13, camp.fireY + 11])
    for (const bench of benches) {
      expect(bench.x).toBeGreaterThan(camp.tentX + 13)
      for (let y = bench.y; y <= bench.y + 5; y++) expect(bench.x + bench.w).toBeLessThan(river(y, width).center - river(y, width).half)
    }
  }
})
