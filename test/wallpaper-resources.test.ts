import { describe, expect, test } from "bun:test"
import { advanceMotion, cpuUsage, cropCount, memoryUsage, parseCpu } from "../ags/wallpaper-resources"
import { drawLandscape } from "../ags/wallpaper-scene"

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
  test("uses available RAM rather than treating reclaimable cache as occupied", () => {
    expect(memoryUsage("MemTotal: 1000 kB\nMemFree: 10 kB\nCached: 500 kB\nMemAvailable: 600 kB\n")).toBeCloseTo(0.4)
    expect(memoryUsage("MemTotal: 0 kB\nMemAvailable: 0 kB")).toBeNull()
    expect(memoryUsage("MemTotal: 100 kB")).toBeNull()
    expect(memoryUsage("MemTotal: 100 kB\nMemAvailable: 200 kB")).toBe(0)
  })
  test("smooths changing load and integrates phase without jumps or reversing", () => {
    const start = { cpu: 0, memory: 0, flow: 10 }
    const idle = advanceMotion(start, { cpu: 0, memory: 0 }, 0.125)
    const loaded = advanceMotion(start, { cpu: 1, memory: 1 }, 0.125)
    expect(idle.flow).toBeGreaterThan(start.flow)
    expect(loaded.flow).toBeGreaterThan(idle.flow)
    expect(loaded.cpu).toBeGreaterThan(0)
    expect(loaded.cpu).toBeLessThan(1)
    const slowing = advanceMotion({ cpu: 1, memory: 1, flow: 20 }, { cpu: 0, memory: 0 }, 0.125)
    expect(slowing.cpu).toBeLessThan(1)
    expect(slowing.cpu).toBeGreaterThan(0)
    expect(slowing.flow).toBeGreaterThan(20)
    expect(advanceMotion(start, { cpu: NaN, memory: Infinity }, NaN)).toEqual(start)
    expect(advanceMotion(start, { cpu: 1, memory: 1 }, 3600)).toEqual(advanceMotion(start, { cpu: 1, memory: 1 }, 1))
    const full = advanceMotion(start, { cpu: 1, memory: 1 }, 1)
    let stepped = start
    for (let i = 0; i < 8; i++) stepped = advanceMotion(stepped, { cpu: 1, memory: 1 }, 0.125)
    expect(stepped.cpu).toBeCloseTo(full.cpu)
    expect(stepped.memory).toBeCloseTo(full.memory)
    expect(Math.abs(stepped.flow - full.flow)).toBeLessThan(0.04)
  })
  test("plants a bounded, monotonic number of crop sites", () => {
    expect(cropCount(0)).toBe(0)
    expect(cropCount(0.5)).toBe(48)
    expect(cropCount(1)).toBe(96)
    expect(cropCount(-1)).toBe(0)
    expect(cropCount(2)).toBe(96)
    expect(cropCount(NaN)).toBe(0)
    for (let i = 0; i < 100; i++) expect(cropCount(i / 100)).toBeLessThanOrEqual(cropCount((i + 1) / 100))
  })
})

function raster(flow: number, memory: number) {
  const pixels = new Uint8ClampedArray(480 * 270 * 3)
  drawLandscape((x, y, w, h, rgb, alpha = 1) => {
    for (let py = Math.max(0, Math.floor(y)); py < Math.min(270, y + h); py++) {
      for (let px = Math.max(0, Math.floor(x)); px < Math.min(480, x + w); px++) {
        const offset = (py * 480 + px) * 3
        for (let c = 0; c < 3; c++) pixels[offset + c] = pixels[offset + c]! * (1 - alpha) + rgb[c]! * alpha
      }
    }
  }, 480, new Date(2026, 0, 15, 12), 100, { flow, memory })
  return pixels
}
test("RAM changes only the crop field while integrated flow animates water and mill", () => {
  const empty = raster(0, 0), full = raster(0, 1), moving = raster(2, 0)
  let crops = 0, water = 0, wheel = 0
  for (let y = 0; y < 270; y++) for (let x = 0; x < 480; x++) {
    const offset = (y * 480 + x) * 3
    const changed = (a: Uint8ClampedArray, b: Uint8ClampedArray) => [0, 1, 2].some(c => a[offset + c] !== b[offset + c])
    if (changed(empty, full)) {
      expect(x).toBeGreaterThan(300); expect(x).toBeLessThan(425)
      expect(y).toBeGreaterThan(200); expect(y).toBeLessThan(251)
      crops++
    }
    if (changed(empty, moving) && x > 270 && x < 300 && y > 192 && y < 225) water++
    if (changed(empty, moving) && x > 250 && x < 277 && y > 195 && y < 220) wheel++
  }
  expect(crops).toBeGreaterThan(200)
  expect(water).toBeGreaterThan(20)
  expect(wheel).toBeGreaterThan(20)
})
