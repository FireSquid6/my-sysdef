import { expect, test } from "bun:test"
import { drawLandscape, TOKYO } from "../ags/wallpaper-scene"
import { CITY_MACHINES, INACTIVE_CITIES, localCities, sampleCities } from "../ags/wallpaper-cities"
import { resolveEnvironment } from "../ags/wallpaper-weather"

test("each city independently lights at night and remains visible above nearer terrain", () => {
  for (const width of [152, 320, 480, 960, 1920]) for (const machine of CITY_MACHINES) for (const hour of [0, 12]) {
    const date = new Date(2026, 6, 15, hour)
    const environment = { ...resolveEnvironment(date), sunrise: 6, sunset: 18, cloud: 0, precip: 0, weather: "clear" as const }
    const windows = new Set<string>()
    drawLandscape((x, y, w, h, color, alpha = 1) => {
      // Track subsequent opaque terrain passes too, so hidden windows don't count.
      for (const pixel of windows) {
        const [px, py] = pixel.split(",").map(Number)
        if (alpha === 1 && px! >= x && px! < x + w && py! >= y && py! < y + h) windows.delete(pixel)
      }
      if (w === 1 && h === 1 && y > 100 && y < 170 && color === TOKYO.gold && alpha > 0) windows.add(`${x},${y}`)
    }, width, date, 0, undefined, environment, undefined, { ...INACTIVE_CITIES, [machine]: true })
    if (hour === 0) {
      expect(windows.size).toBeGreaterThan(10)
      const center = width * { "minibox-one": 0.25, deisslaptop: 0.84, desktop: 0.44 }[machine]
      expect([...windows].every(pixel => Math.abs(Number(pixel.split(",")[0]) - center) < 29)).toBe(true)
    } else expect(windows.size).toBe(0)
  }
})

test("local host aliases stay active even when Tailscale fails", async () => {
  for (const hostname of ["kotoko", "desktop.tailnet.ts.net", "deisslaptop", "minibox-one"]) {
    const result = await sampleCities(hostname, async () => { throw Error("unavailable") })
    expect(result).toEqual(localCities(hostname))
    expect(Object.values(result).filter(Boolean)).toHaveLength(1)
  }
})

test("probes peers rather than trusting cached Online, and recognizes Tailscale self", async () => {
  const probes: string[] = []
  const result = await sampleCities("other-hostname", async argv => {
    if (argv.includes("status")) return JSON.stringify({ BackendState: "Running", Self: { HostName: "desktop", Online: false } })
    const machine = argv.at(-1)!
    probes.push(machine)
    if (machine === "deisslaptop") throw Error("timeout")
    return "pong via DERP"
  })
  expect(result).toEqual({ "minibox-one": true, deisslaptop: false, desktop: true })
  expect(probes.sort()).toEqual(["deisslaptop", "minibox-one"])
})
