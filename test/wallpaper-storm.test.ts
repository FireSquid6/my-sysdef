import { expect, test } from "bun:test"
import { drawLandscape, mix, stormLightning, TOKYO } from "../ags/wallpaper-scene"
import { resolveEnvironment } from "../ags/wallpaper-weather"

test("lightning is deterministic and sparse, with brief pulses and long quiet intervals", () => {
  let active = 0
  for (let frame = 0; frame < 24 * 30; frame++) {
    const seconds = frame / 30, state = stormLightning(seconds)
    expect(state).toEqual(stormLightning(seconds))
    expect(state.strength).toBeGreaterThanOrEqual(0)
    expect(state.strength).toBeLessThanOrEqual(1)
    expect(state.x).toBeGreaterThanOrEqual(0.15)
    expect(state.x).toBeLessThanOrEqual(0.85)
    if (state.strength > 0) active++
  }
  expect(active).toBeGreaterThan(5)
  expect(active).toBeLessThan(15)
  expect(stormLightning(0).strength).toBe(0)
  expect(stormLightning(23).strength).toBe(0)
})

test("only thunderstorms draw lightning, behind the mountain and ground passes", () => {
  const date = new Date(2026, 6, 15, 23)
  const environment = { ...resolveEnvironment(date), cloud: 1, precip: 0.8 }
  const seconds = Array.from({ length: 720 }, (_, i) => i / 30).find(t => stormLightning(t).strength > 0.8)!
  expect(seconds).toBeDefined()
  const boltColor = mix(TOKYO.cyan, TOKYO.white, 0.7)
  for (const width of [152, 480, 960]) for (const weather of ["rain", "storm", "snow", "clear"] as const) {
    const bolts: number[] = []
    let index = 0, firstRidge = -1
    drawLandscape((x, y, w, h, c) => {
      if (c.every((v, i) => v === boltColor[i])) { bolts.push(index); expect(w).toBe(1); expect(h).toBe(1) }
      if (firstRidge < 0 && w === 1 && y >= 114 && h > 10) firstRidge = index
      index++
    }, width, date, seconds, undefined, { ...environment, weather })
    if (weather === "storm") {
      expect(bolts.length).toBeGreaterThan(80)
      expect(Math.max(...bolts)).toBeLessThan(firstRidge)
    } else expect(bolts).toHaveLength(0)
  }
})

test("a quiet thunderstorm is darker than rain at the same cloud cover", () => {
  const date = new Date(2026, 6, 15, 12)
  const environment = { ...resolveEnvironment(date), cloud: 0.8, precip: 0.8 }
  const brightness: number[] = []
  for (const weather of ["rain", "storm"] as const) {
    drawLandscape((x, y, w, h, c) => {
      if (x === 0 && y === 0 && w === 480) brightness.push(c.reduce((sum, v) => sum + v, 0))
    }, 480, date, 0, undefined, { ...environment, weather })
  }
  expect(brightness[1]!).toBeLessThan(brightness[0]!)
})
