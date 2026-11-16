import { expect, test } from "bun:test"
import { campsite, dirtGround, drawLandscape, mix, river, TOKYO } from "../ags/wallpaper-scene"
import { resolveEnvironment } from "../ags/wallpaper-weather"

test("textured dirt routes connect campsite, house, bridge banks and farm without covering water", () => {
  for (const width of [152, 320, 480, 960, 1920]) {
    const dirt = dirtGround(width), camp = campsite(width)
    const millX = Math.floor(river(207, width).center - river(207, width).half - 1) - 35
    const lip = river(192, width)
    const left = Math.floor(lip.center - lip.half - 9), right = Math.ceil(lip.center + lip.half + 9)
    const farmX = Math.floor(width * (0.73 - 21 / 43 * 0.09))
    function reachable(from: readonly [number, number], to: readonly [number, number]) {
      const seen = new Set<number>(), queue = [from]
      for (let i = 0; i < queue.length; i++) {
        const [x, y] = queue[i]!
        if (!dirt.contains(x, y)) continue
        const key = y * width + x
        if (seen.has(key)) continue
        seen.add(key)
        if (x === to[0] && y === to[1]) return true
        queue.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1])
      }
      return false
    }
    expect(reachable([camp.fireX, 220], [millX + 15, 214])).toBe(true)
    expect(reachable([camp.fireX, 220], [left, 189])).toBe(true)
    expect(reachable([right - 1, 189], [farmX, 228])).toBe(true)
    for (let y = 174; y < 270; y++) {
      const r = river(y, width)
      for (let x = Math.max(0, Math.floor(r.center - r.half - 2)); x <= Math.min(width - 1, Math.ceil(r.center + r.half + 2)); x++) expect(dirt.contains(x, y)).toBe(false)
    }
    expect(dirt.pixels).toEqual(dirtGround(width).pixels)
  }
})

test("the house occludes the bridge-bound path instead of a path halo above the roof", () => {
  const width = 480
  const millX = Math.floor(river(207, width).center - river(207, width).half - 1) - 35
  const dirt = dirtGround(width)
  expect(dirt.contains(millX + 10, 195)).toBe(true)
  expect(dirt.contains(millX + 14, 175)).toBe(false)
  const date = new Date(2026, 6, 15, 12)
  let pixel: readonly number[] = []
  drawLandscape((x, y, w, h, c, alpha = 1) => {
    if (alpha === 1 && x <= millX + 10 && x + w > millX + 10 && y <= 195 && y + h > 195) pixel = c
  }, width, date, 0, undefined, { ...resolveEnvironment(date), cloud: 0, weather: "clear", sunrise: 6, sunset: 18 })
  expect(pixel).toEqual(mix(TOKYO.night, TOKYO.gold, 0.8 * 0.85))
})

test("soil grain stays fixed while the scene animates", () => {
  const width = 480, camp = campsite(width)
  function clearing(seconds: number) {
    const result: unknown[] = []
    drawLandscape((x, y, w, h, c) => {
      // Ground texture is drawn in horizontal scanlines and single-pixel grains.
      if (y === 225 && x >= camp.fireX - 20 && x < camp.fireX && h === 1) result.push([x, y, w, h, c])
    }, width, new Date(2026, 6, 15, 12), seconds)
    return result
  }
  expect(clearing(0).length).toBeGreaterThan(0)
  expect(clearing(0)).toEqual(clearing(10))
})
