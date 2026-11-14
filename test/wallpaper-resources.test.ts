import { describe, expect, test } from "bun:test"
import { advanceMotion, cpuUsage, parseCpu } from "../ags/wallpaper-resources"
import { advanceCrops, type CropState } from "../ags/wallpaper-crops"
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

function raster(flow: number, crops: CropState, memory = 0) {
  const pixels = new Uint8ClampedArray(480 * 270 * 3)
  // An old caller's RAM value must not influence either crops or water.
  const activity = { flow, memory }
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
test("calendar growth and harvesting change only the field; RAM has no effect; CPU flow still animates water and mill", () => {
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
