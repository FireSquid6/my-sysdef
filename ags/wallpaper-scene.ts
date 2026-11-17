/** Pure, deterministic pixel scene. All colors derive from Tokyo Night's palette. */
import { INACTIVE_CITIES, type CityActivity } from "./wallpaper-cities"
import { resourceLevel, type LandscapeMotion } from "./wallpaper-resources"
import { advanceCrops, type CropState } from "./wallpaper-crops"
import { resolveEnvironment, type LandscapeEnvironment } from "./wallpaper-weather"
export type RGB = readonly [number, number, number]
export const TOKYO = {
  night: [26, 27, 38], storm: [36, 40, 59], blue: [122, 162, 247],
  cyan: [125, 207, 255], teal: [115, 218, 202], green: [158, 206, 106],
  purple: [187, 154, 247], pink: [247, 118, 142], gold: [224, 175, 104],
  white: [192, 202, 245],
} as const satisfies Record<string, RGB>
export const mix = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => v + (b[i]! - v) * Math.max(0, Math.min(1, t))) as unknown as RGB
const smooth = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t) }
export function lighting(date: Date, environment?: LandscapeEnvironment) {
  const hour = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600
  const sunrise = environment?.sunrise ?? 6, sunset = environment?.sunset ?? 18.5
  const daylight = environment
    ? smooth((hour - sunrise + 0.6) / 1.2) * (1 - smooth((hour - sunset + 0.6) / 1.2))
    : smooth((hour - 5) / 2) * (1 - smooth((hour - 17) / 3))
  const dusk = Math.max(0, 1 - Math.abs(hour - sunrise) / 1.5, 1 - Math.abs(hour - sunset) / 1.5)
  return { hour, daylight, dusk, night: 1 - smooth(daylight / 0.5) }
}
/** Spherical terminator: waxing lights the right, waning lights the left. */
export function moonPixelLit(x: number, y: number, phase: number) {
  const z2 = 1 - x * x - y * y
  return z2 >= 0 && x * Math.sin(phase * Math.PI * 2) - Math.sqrt(z2) * Math.cos(phase * Math.PI * 2) > 1e-8
}
export function campfireLight(date: Date, environment: LandscapeEnvironment) {
  const hour = lighting(date, environment).hour
  return hour < environment.sunrise ? 1 - smooth((hour - environment.sunrise + 0.35) / 0.35)
    : smooth((hour - environment.sunset) / 0.25)
}
export type Paint = (x: number, y: number, width: number, height: number, color: RGB, alpha?: number) => void
const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x) }
export function river(y: number, width: number) {
  const depth = Math.max(0, (y - 157) / 113)
  // A straight reach gives the waterfall a continuous channel into the lower river.
  const entrance = Math.max(0, Math.min(1, (y - 180) / 12))
  const reach = y < 180 ? y : y < 192 ? 180 + 12 * (entrance + entrance ** 2 - entrance ** 3)
    : y <= 218 ? 192 : 192 + (y - 218) * 78 / 52 * smooth((y - 218) / 12)
  const bend = Math.max(0, (reach - 157) / 113)
  return { center: width * (0.53 + Math.sin(bend * 6.4 - 0.4) * (0.015 + bend * 0.13)), half: 1 + depth * depth * width * 0.13 }
}
/** Sparse deterministic lightning, shared by all outputs; never a rapid strobe. */
export function stormLightning(seconds: number) {
  const slot = Math.floor(seconds / 24)
  const age = seconds - slot * 24 - (3 + hash(slot + 6100) * 13)
  const pulse = (start: number, duration: number) => age >= start && age < start + duration ? Math.sin((age - start) / duration * Math.PI) : 0
  const strength = Math.max(pulse(0, 0.24), pulse(0.4, 0.16) * 0.55)
  return { strength, x: 0.15 + hash(slot + 6200) * 0.7, seed: slot }
}
/** Thin cloud softens celestial bodies; heavy overcast hides them completely. */
export const celestialVisibility = (cloud: number) => 1 - smooth((cloud - 0.2) / 0.7)
/** Fade the falling sheet into the lower current instead of ending at one scanline. */
export const waterfallStrength = (y: number) => y < 192 ? 0 : 1 - smooth((y - 207) / 29)
/** Keep the entire fire's ground glow clear of the bend, including on ultrawides. */
export function campsite(width: number) {
  const fireY = 220, glowRadius = 21
  const millX = Math.floor(river(207, width).center - river(207, width).half - 1) - 35
  let bank = Infinity
  for (let y = fireY - glowRadius; y <= fireY + glowRadius; y++) {
    const r = river(y, width)
    bank = Math.min(bank, r.center - r.half)
  }
  const fireX = Math.floor(Math.min(millX - 14, bank - glowRadius - 4))
  return { fireX, fireY, tentX: fireX - 25, tentY: fireY - 22, glowRadius }
}
/** Keep the supply yard behind the tent, shrinking it only on narrow outputs. */
export function supplyYard(width: number) {
  const camp = campsite(width)
  const millX = Math.floor(river(207, width).center - river(207, width).half - 1) - 35
  const x = Math.max(2, camp.tentX - 33)
  return { x, base: 196, scale: Math.max(0.45, Math.min(1, (millX - 8 - x) / 64)) }
}
/** Visible supplies always retain one item, even at an empty/unknown reading. */
export function supplyCounts(activity: Pick<LandscapeMotion, "ram" | "disk" | "ramCrates">) {
  return {
    crates: Math.max(1, Math.min(10, activity.ramCrates ?? resourceLevel(activity.ram ?? 0))),
    logs: Math.max(1, Math.min(20, Math.floor((activity.disk ?? 0) * 20))),
  }
}
/** Shared dirt mask keeps texture, grass and woodland clearings in agreement. */
export function dirtGround(width: number) {
  const pixels = new Uint8Array(width * 96)
  const camp = campsite(width)
  const millX = Math.floor(river(207, width).center - river(207, width).half - 1) - 35
  const lip = river(192, width)
  const left = Math.floor(lip.center - lip.half - 9), right = Math.ceil(lip.center + lip.half + 9)
  const mark = (cx: number, cy: number, rx: number, ry: number) => {
    for (let y = Math.max(174, Math.floor(cy - ry)); y <= Math.min(269, Math.ceil(cy + ry)); y++) {
      const dy = (y - cy) / ry
      if (Math.abs(dy) > 1) continue
      const half = rx * Math.sqrt(1 - dy * dy)
      for (let x = Math.max(0, Math.ceil(cx - half)); x <= Math.min(width - 1, Math.floor(cx + half)); x++) pixels[(y - 174) * width + x] = 1
    }
  }
  type Point = readonly [number, number]
  const curve = (a: Point, b: Point, c: Point, radius: number, bank: -1 | 1 = -1) => {
    const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.hypot(c[0] - b[0], c[1] - b[1]))
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, u = 1 - t
      const y = u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]
      const x = u * u * a[0] + 2 * u * t * b[0] + t * t * c[0]
      const r = river(y, width)
      const dryX = bank === -1 ? Math.min(x, r.center - r.half - radius - 4) : Math.max(x, r.center + r.half + radius + 4)
      mark(dryX, y, radius, radius * 0.65)
    }
  }
  // One broad clearing spans the supply yard and campsite, rather than two
  // overlapping ovals with a narrow waist between them.
  const yard = supplyYard(width)
  const top = yard.base - 11, bottom = camp.fireY + 18
  const centerY = (top + bottom) / 2, radiusY = (bottom - top) / 2
  for (let y = top; y <= bottom; y++) {
    const t = smooth((y - (yard.base - 1)) / (camp.fireY - yard.base + 1))
    const centerX = (yard.x + 32 * yard.scale) * (1 - t) + (camp.tentX + 16) * t
    const half = 44 * Math.sqrt(Math.max(0, 1 - ((y - centerY) / radiusY) ** 2))
    mark(centerX, y, Math.max(0.5, half), 0.5)
  }
  curve([camp.fireX, 220], [millX - 10, 231], [millX + 15, 214], 3.5)
  // Run through the house's projected footprint: its later opaque draw pass
  // hides the middle of the path, which reappears beside the bridge.
  curve([camp.fireX + 5, 216], [millX - 22, 207], [millX - 8, 199], 3)
  curve([millX - 8, 199], [millX + 16, 193], [left, 189], 2.5)
  const farmX = Math.floor(width * (0.73 - (228 - 207) / 43 * 0.09))
  curve([right - 1, 189], [right + 13, 194], [right + 18, 204], 3, 1)
  curve([right + 18, 204], [farmX - 14, 211], [farmX, 228], 3.5, 1)
  // Never paint over the channel or its existing bank rim.
  for (let y = 174; y < 270; y++) {
    const r = river(y, width)
    for (let x = Math.max(0, Math.floor(r.center - r.half - 2)); x <= Math.min(width - 1, Math.ceil(r.center + r.half + 2)); x++) pixels[(y - 174) * width + x] = 0
  }
  const contains = (x: number, y: number) => x >= 0 && x < width && y >= 174 && y < 270 && pixels[(Math.floor(y) - 174) * width + Math.floor(x)] === 1
  return { pixels, contains }
}
/** Stable landing sites let falling particles meet their own splash/settling mark. */
export function precipitationLanding(index: number, width: number, camp = campsite(width)) {
  const x = Math.floor(hash(index + 1910) * width)
  const groundY = 179 + Math.floor(hash(index + 2110) * 90)
  const millX = Math.floor(river(207, width).center - river(207, width).half - 1) - 35
  let y = groundY
  let surface: "ground" | "water" | "roof" | "tent" = Math.abs(x - river(y, width).center) < river(y, width).half ? "water" : "ground"
  if (groundY >= 213 && Math.abs(x - (millX + 14)) <= 16) {
    y = 176 + Math.ceil(Math.abs(x - (millX + 14)) / 1.5)
    surface = "roof"
  }
  if (groundY >= camp.tentY + 17 && Math.abs(x - camp.tentX) <= 11) {
    const tentY = camp.tentY + Math.ceil(Math.abs(x - camp.tentX) / 0.72)
    if (tentY < y) { y = tentY; surface = "tent" }
  }
  return { x, y, surface }
}
/** A fall and its impact share one cycle, with no particle-state allocation. */
export function precipitationPhase(index: number, seconds: number, snow: boolean, precip: number, landingY: number) {
  const speed = snow ? 8 + hash(index) * 7 : 100 + precip * 60
  const fallDuration = (landingY + 10) / speed
  const impactDuration = snow ? 0.9 : 0.28
  const duration = fallDuration + impactDuration
  const age = ((seconds + hash(index + 1710) * duration) % duration + duration) % duration
  return age < fallDuration
    ? { falling: true, progress: age / fallDuration }
    : { falling: false, progress: (age - fallDuration) / impactDuration }
}
/** Logical height is 270px; width follows the output so ultrawides aren't stretched. */
export function drawLandscape(paint: Paint, width: number, date: Date, seconds: number,
  activity: Pick<LandscapeMotion, "flow" | "ram" | "disk" | "ramCrates"> = { flow: seconds * 0.35 },
  environment: LandscapeEnvironment = resolveEnvironment(date),
  crops: CropState = advanceCrops(null, date, environment.latitude),
  cities: CityActivity = INACTIVE_CITIES) {
  const flow = Number.isFinite(activity.flow) ? activity.flow : 0
  const { daylight: day, dusk, night } = lighting(date, environment)
  const { season, weather, cloud, precip, wind, moonPhase, moonIllumination } = environment
  const clearSky = celestialVisibility(cloud)
  const storm = weather === "storm"
  const lightning = stormLightning(seconds)
  const flash = storm ? lightning.strength : 0
  const shade = (c: RGB, strength = 1) => mix(mix(TOKYO.night, c, (0.25 + day * (0.55 - cloud * 0.18)) * strength * (storm ? 0.82 : 1)), TOKYO.white, flash * 0.12)
  const foliage = season === "autumn" ? TOKYO.gold : season === "winter" ? mix(TOKYO.teal, TOKYO.white, 0.4) : season === "spring" ? mix(TOKYO.green, TOKYO.teal, 0.3) : TOKYO.green
  const snowy = weather === "snow" || (season === "winter" && (environment.temperature ?? -1) < 3)
  const skyTop = mix(mix(TOKYO.night, mix(TOKYO.storm, TOKYO.blue, 0.42), day), TOKYO.storm, cloud * 0.55)
  const skyBottom = mix(mix(mix(TOKYO.storm, TOKYO.purple, 0.16), mix(TOKYO.blue, TOKYO.cyan, 0.32), day * 0.65), TOKYO.storm, cloud * 0.55)
  for (let y = 0; y < 176; y += 2) {
    const sky = mix(mix(skyTop, skyBottom, y / 176), TOKYO.pink, dusk * (y / 176) ** 3 * 0.35 * clearSky)
    paint(0, y, width, 2, mix(mix(sky, TOKYO.storm, storm ? 0.35 : 0), TOKYO.white, flash * 0.18))
  }
  if (night * clearSky > 0.01) {
    for (let i = 0; i < width / 4; i++) {
      const x = Math.floor(hash(i + 1) * width), y = Math.floor(hash(i + 921) * 118)
      paint(x, y, 1, 1, TOKYO.white, night * clearSky * (1 - moonIllumination * 0.3) * (0.3 + 0.55 * (0.5 + 0.5 * Math.sin(seconds * 0.7 + i))))
    }
    // Layered translucent curtains, stepped on the same pixel grid as the terrain.
    for (let band = 0; band < 3; band++) for (let x = 0; x < width; x += 2) {
      const u = x / width
      const crest = 33 + band * 14 + Math.sin(u * 8 + seconds * 0.07 + band) * 13 + Math.sin(u * 19 - seconds * 0.04) * 5
      const envelope = Math.sin(Math.PI * u) ** 2
      for (let k = 0; k < 7; k++) paint(x, Math.floor(crest - k * 4), 2, 4, mix(TOKYO.teal, TOKYO.purple, band / 2), night * clearSky * envelope * (1 - k / 7) * 0.30)
    }
  }
  // Pixel disks (no antialiased vector edges).
  const disk = (cx: number, cy: number, radius: number, c: RGB, alpha = 1) => {
    for (let y = -radius; y <= radius; y++) { const r = Math.floor(Math.sqrt(radius * radius - y * y)); paint(Math.floor(cx) - r, Math.floor(cy) + y, r * 2 + 1, 1, c, alpha) }
  }
  if (day > 0.08 && clearSky > 0) {
    const cx = width * (0.16 + 0.68 * Math.max(0, Math.min(1, (lighting(date, environment).hour - environment.sunrise) / (environment.sunset - environment.sunrise))))
    const cy = 110 - day * 65
    disk(cx, cy, 13, TOKYO.gold, clearSky * 0.06)
    disk(cx, cy, 11, TOKYO.gold, clearSky * 0.1)
    disk(cx, cy, 9, mix(TOKYO.gold, TOKYO.white, day * 0.4), clearSky)
  }
  // Global haze dims the phase; nearer clouds pass in front of it.
  if (night > 0.2 && clearSky > 0) {
    const cx = Math.floor(width * 0.79), cy = 38, radius = 9
    for (let y = -radius; y <= radius; y++) for (let x = -radius; x <= radius; x++) {
      if (moonPixelLit(x / radius, y / radius, moonPhase)) paint(cx + x, cy + y, 1, 1, mix(TOKYO.blue, TOKYO.white, 0.85), night * clearSky)
    }
  }
  const windX = -Math.sin(environment.windDirection * Math.PI / 180)
  // Two depth layers of joined, rounded lobes with flat shaded undersides.
  // Scanline unions avoid dark seams where translucent lobes overlap.
  for (let layer = 0; layer < 2; layer++) for (let i = 0; i < Math.ceil(width / 160) + Math.floor(cloud * width / 55); i++) {
    const seed = i + layer * 137, scale = layer === 0 ? 0.7 : 1
    const span = Math.floor((45 + hash(seed + 90) * 42 + cloud * 25) * scale)
    const height = Math.floor((10 + hash(seed + 91) * 9 + cloud * 8) * scale)
    const drift = seconds * (0.3 + wind * 2) * (layer === 0 ? 0.55 : 1) * (Math.abs(windX) < 0.1 ? 0.1 : windX)
    const wrap = width + 260
    const x = Math.floor(((hash(seed + 70) * wrap + drift) % wrap + wrap) % wrap) - 130
    const y = 25 + Math.floor(hash(seed + 80) * 75)
    const body = mix(shade(TOKYO.white, 1.15), shade(TOKYO.blue, 0.75), cloud * 0.75)
    const underside = mix(body, shade(TOKYO.storm, 0.9), 0.25 + cloud * 0.3)
    for (let row = 0; row < height; row += 2) {
      let left = Infinity, right = -Infinity
      for (let lobe = 0; lobe < 5; lobe++) {
        const radiusY = height * (0.4 + hash(seed * 7 + lobe + 200) * 0.4)
        const dy = (row - height * 0.82) / radiusY
        if (Math.abs(dy) >= 1) continue
        const half = span * 0.24 * Math.sqrt(1 - dy * dy)
        const center = span * (0.16 + lobe * 0.17)
        left = Math.min(left, Math.floor(center - half))
        right = Math.max(right, Math.ceil(center + half))
      }
      if (right > left) paint(x + left, y + row, right - left, 2, row > height * 0.7 ? underside : body, (layer === 0 ? 0.3 : 0.55) + cloud * 0.25)
    }
  }
  // Distant pixel lightning sits behind ridges and buildings. A narrow bright
  // core and faint halo keep the flash local instead of washing out the screen.
  if (flash > 0) {
    const boltColor = mix(TOKYO.cyan, TOKYO.white, 0.7)
    const line = (x1: number, y1: number, x2: number, y2: number, alpha: number) => {
      const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1)
      for (let i = 0; i <= steps; i++) {
        const x = Math.round(x1 + (x2 - x1) * i / steps), y = Math.round(y1 + (y2 - y1) * i / steps)
        paint(x - 1, y, 3, 1, TOKYO.cyan, alpha * 0.16)
        paint(x, y, 1, 1, boltColor, alpha)
      }
    }
    let x = Math.floor(width * lightning.x), y = 47
    for (let segment = 0; segment < 8; segment++) {
      const nextX = x + Math.floor(hash(lightning.seed * 31 + segment + 6300) * 21) - 10
      const nextY = y + 10 + Math.floor(hash(segment + 6400) * 5)
      line(x, y, nextX, nextY, flash)
      if (segment === 3) {
        line(x, y, x + 13, y + 8, flash * 0.6)
        line(x + 13, y + 8, x + 9, y + 23, flash * 0.45)
      }
      x = nextX; y = nextY
    }
  }
  // Wider, closer peaks on a lower horizon leave substantially more open sky.
  const triangle = (v: number) => Math.abs(Math.asin(Math.sin(v))) * 2 / Math.PI
  const ridgeAt = (x: number, layer: number) => triangle(x / width * (4.3 + layer * 1.4) + layer * 1.7) * (34 - layer * 5) + triangle(x / width * 18 + layer) * 7
  for (let layer = 0; layer < 3; layer++) {
    for (let x = 0; x < width; x++) {
      const wave = x / width * (4.3 + layer * 1.4) + layer * 1.7
      const ridge = ridgeAt(x, layer)
      const y = Math.floor(114 + layer * 12 + ridge)
      const face = Math.sin(wave) * Math.cos(wave) > 0 ? 0.14 : 0
      paint(x, y, 1, 179 - y, shade(mix(layer === 0 ? TOKYO.purple : layer === 1 ? TOKYO.blue : TOKYO.teal, TOKYO.storm, face), 0.95 - layer * 0.12))
      const cap = snowy ? 21 : season === "summer" ? 6 : 12
      if (layer === 0 && ridge < cap) paint(x, y, 1, Math.floor((cap - ridge) * 0.55) + 1, shade(TOKYO.white))
    }
    // Draw on the supporting ridge before nearer terrain occludes the city feet.
    for (const city of [
      { machine: "minibox-one", u: 0.25, layer: 1 },
      { machine: "deisslaptop", u: 0.84, layer: 1 },
      { machine: "desktop", u: 0.44, layer: 2 },
    ] as const) {
      if (city.layer !== layer) continue
      const active = cities[city.machine]
      const masonry = mix(shade(TOKYO.storm, 0.8), shade(TOKYO.blue, 0.83), active ? 0.55 : 0.2)
      const step = Math.max(2, Math.min(4, Math.floor(width / 80)))
      for (let i = 0; i < 13; i++) {
        const x = Math.floor(width * city.u) + (i - 6) * step
        const w = Math.min(step, 2 + i % 3)
        const base = Math.floor(114 + layer * 12 + Math.max(ridgeAt(x, layer), ridgeAt(x + w - 1, layer))) + 1
        const height = 4 + Math.floor(hash(i + 7100) * 6) + (i === 6 ? 5 : 0)
        paint(x, base - height, w, height, masonry)
        paint(x, base - height, w, 1, shade(snowy ? TOKYO.white : TOKYO.blue, 0.9))
        if (i === 6) paint(x + 1, base - height - 3, 1, 3, masonry)
        for (let row = 2; row < height - 1; row += 3) for (let col = 1; col < w; col += 2) {
          if (hash(i * 17 + row + col + 7200) > 0.3)
            paint(x + col, base - height + row, 1, 1, TOKYO.gold, active ? night * (0.55 - cloud * 0.15) : 0)
        }
      }
    }
  }
  for (let y = 174; y < 270; y++) {
    const depth = (y - 157) / 113
    paint(0, y, width, 1, mix(shade(snowy ? TOKYO.white : TOKYO.teal, 0.6), shade(snowy ? mix(TOKYO.white, TOKYO.blue, 0.25) : foliage, 0.75), depth))
    // Broad cultivated field bands and a riverbank.
    const field = Math.sin(depth * 25 + 0.7) > 0
    paint(0, y, width, 1, shade(snowy ? TOKYO.white : field ? foliage : TOKYO.gold, 0.55), 0.3)
    const r = river(y, width), left = Math.floor(r.center - r.half), span = Math.ceil(r.half * 2)
    paint(left - 2, y, span + 4, 1, shade(TOKYO.gold, 0.6))
    paint(left, y, span, 1, mix(shade(TOKYO.blue, 0.8), TOKYO.teal, day * 0.15))
    const ripple = Math.max(0, Math.cos((y - flow * 6) * Math.PI * 2 / 7)) ** 6
    if (ripple > 0.005) {
      const offset = Math.sin(y * 1.7 + flow * 0.8) * r.half * 0.5
      paint(r.center + offset - r.half * 0.2, y, Math.max(1, r.half * 0.4), 1, mix(TOKYO.blue, TOKYO.white, 0.35), (0.25 + day * 0.2) * ripple)
    }
  }
  // One coordinate-seeded soil texture joins the clearing and every path.
  const dirt = dirtGround(width)
  const soil = shade(mix(TOKYO.gold, TOKYO.pink, 0.18), 0.68)
  const soilDark = shade(mix(TOKYO.gold, TOKYO.storm, 0.48), 0.55)
  const soilLight = shade(TOKYO.gold, 0.86)
  for (let y = 174; y < 270; y++) {
    let start = -1
    for (let x = 0; x <= width; x++) {
      if (dirt.contains(x, y)) { if (start < 0) start = x }
      else if (start >= 0) { paint(start, y, x - start, 1, soil); start = -1 }
    }
    for (let x = 0; x < width; x++) if (dirt.contains(x, y)) {
      const grain = hash(x * 19 + y * 307)
      if (grain < 0.14) paint(x, y, 1, 1, soilDark)
      else if (grain > 0.95) paint(x, y, 1, 1, snowy ? shade(TOKYO.white, 0.85) : soilLight)
    }
  }
  // Sparse grasses / wildflowers; wind shifts only their tips.
  for (let i = 0; i < width * 1.1; i++) {
    const x = Math.floor(hash(i + 300) * width), y = 179 + Math.floor(hash(i + 900) * 91), r = river(y, width)
    if (Math.abs(x - r.center) < r.half + 5 || dirt.contains(x, y) || dirt.contains(x, y - 1)) continue
    const h = 1 + Math.floor((y - 157) / 38), sway = Math.sin(seconds * 0.9 + i) > 0 ? 1 : -1
    paint(x, y, 1, h, shade(TOKYO.teal, 0.65)); paint(x + sway, y - 1, 1, 1, shade(snowy ? TOKYO.white : i % 9 === 0 && season === "spring" ? TOKYO.pink : foliage, 0.8))
  }
  // Dense layered woodland, with deliberate clearings for the mill, campsite,
  // river and crop field. Back-to-front rows keep the pixel canopy depth readable.
  const millBank = Math.floor(river(207, width).center - river(207, width).half - 36)
  const camp = campsite(width)
  const tree = (x: number, base: number, size: number, seed: number) => {
    const deciduous = seed % 4 === 0, trunk = shade(TOKYO.gold, 0.48)
    paint(x, base - size, 2, size + 1, trunk)
    const leaf = shade(deciduous ? (season === "autumn" && seed % 3 === 0 ? TOKYO.pink : foliage) : TOKYO.teal, 0.52 + (base - 170) / 160)
    if (deciduous && season !== "winter") {
      for (let y = 0; y < size * 0.75; y++) {
        const half = Math.floor(Math.sin(y / (size * 0.75) * Math.PI) * size * 0.4) + 1
        paint(x - half, Math.floor(base - size + y), half * 2 + 2, 1, leaf)
      }
    } else if (!deciduous) {
      for (let tier = 0; tier < 3; tier++) for (let y = 0; y < size * 0.48; y++) {
        const half = Math.floor(y * 0.55), top = Math.floor(base - size + tier * size * 0.2 + y)
        paint(x - half, top, half * 2 + 2, 1, snowy && y < size * 0.13 ? shade(TOKYO.white, 0.9) : leaf)
      }
    } else {
      paint(x - 3, base - size + 4, 7, 1, trunk); paint(x - 2, base - size + 1, 5, 1, trunk)
    }
  }
  for (let row = 0; row < 8; row++) for (let i = 0; i < Math.ceil(width / 9); i++) {
    const seed = row * 139 + i, x = Math.floor(i * 9 + hash(seed + 417) * 12)
    const base = 178 + row * 11 + Math.floor(hash(seed + 512) * 7)
    const size = 8 + row * 2 + Math.floor(hash(seed + 615) * 8), r = river(base, width)
    if (Math.abs(x - r.center) < r.half + size * 0.5 + 5) continue
    if (base > 185 && x > Math.min(millBank - 61, camp.tentX - 20) && x < millBank + 42) continue
    if (base > 202 && x > width * 0.62 && x < width * 0.91) continue
    if (hash(seed + 810) < (row < 3 ? 0.1 : 0.27)) continue
    let blocksPath = false
    for (let y = base - size; y <= base && !blocksPath; y += 2) for (let dx = -Math.ceil(size * 0.4); dx <= size * 0.4; dx += 2) {
      if (dirt.contains(x + dx, y)) { blocksPath = true; break }
    }
    if (!blocksPath) tree(x, base, size, seed)
  }
  // Calendar-grown crops: seedlings fill the field, mature, then are harvested
  // from front to back. State belongs to the app, never to an individual output.
  const planted = crops.crop === "fallow" ? 0 : Math.min(96, Math.floor(crops.growth / 0.12 * 96))
  const harvested = Math.floor(crops.harvest * 96)
  for (let y = 207; y <= 250; y++) {
    const depth = (y - 207) / 43
    const left = Math.floor(width * (0.73 - depth * 0.09))
    const right = Math.floor(width * (0.84 + depth * 0.035))
    paint(left, y, right - left + 1, 1, shade(snowy ? TOKYO.white : TOKYO.gold, snowy ? 0.75 : 0.46))
    if ((y - 207) % 5 === 0) paint(left, y, right - left + 1, 1, shade(TOKYO.storm, 0.7))
    paint(left - 1, y, 1, 1, shade(TOKYO.gold, 0.85))
    paint(right + 1, y, 1, 1, shade(TOKYO.gold, 0.85))
  }
  for (let row = 0; row < 8; row++) for (let column = 0; column < 12; column++) {
    const y = 211 + row * 5, depth = (y - 207) / 43
    const left = width * (0.73 - depth * 0.09), right = width * (0.84 + depth * 0.035)
    const x = Math.floor(left + (column + 0.5) * (right - left) / 12)
    if (row * 12 + column >= planted) continue
    if ((7 - row) * 12 + column < harvested) {
      paint(x, y - 1, 1, 1, shade(TOKYO.gold, 0.65))
      continue
    }
    const maturity = Math.max(0.08, Math.min(1, crops.growth * (0.94 + hash(row * 12 + column) * 0.12)))
    const height = Math.max(1, Math.round((2 + Math.floor(row / 3)) * maturity))
    const ripe = Math.max(0, (maturity - 0.65) / 0.35)
    if (crops.crop === "pumpkins") {
      paint(x - 1, y - 1, 3, 1, shade(TOKYO.teal, 0.8))
      if (maturity > 0.25) {
        const radius = maturity > 0.7 && row > 3 ? 2 : 1
        const fruit = shade(mix(TOKYO.green, mix(TOKYO.gold, TOKYO.pink, 0.22), ripe), 1.05)
        paint(x - radius + 1, y - radius * 2, Math.max(1, radius * 2 - 1), radius * 2, fruit)
        paint(x - radius, y - radius * 2 + 1, radius * 2 + 1, Math.max(1, radius * 2 - 2), fruit)
        paint(x, y - radius * 2 - 1, 1, 1, shade(TOKYO.teal, 0.8))
        paint(x, y - radius * 2, 1, radius * 2, shade(TOKYO.pink, ripe * 0.65 + 0.15))
      }
    } else {
      paint(x, y - height, 1, height, shade(crops.crop === "wheat" ? mix(TOKYO.green, TOKYO.gold, ripe) : TOKYO.green, 0.95))
      if (maturity > 0.2) paint(x - 1, y - height + 1, 3, 1, shade(TOKYO.teal, 0.8))
      if (maturity > 0.55) {
        paint(x, y - height - 1, 1, crops.crop === "wheat" ? 2 : 1, shade(snowy ? TOKYO.white : crops.crop === "wheat" ? TOKYO.gold : TOKYO.green, 1.1))
        if (crops.crop === "peas") paint(x + 1, y - height + 1, 1, 2, shade(TOKYO.green, 1.1))
      }
    }
  }
  // Rocky lip, falling water and a small plunge pool. All flow marks travel
  // downstream using the SAME integrated phase as the mechanically linked wheel.
  const lip = river(192, width)
  paint(Math.floor(lip.center - lip.half - 4), 190, Math.ceil(lip.half * 2) + 8, 4, shade(TOKYO.storm, 1.2))
  for (let y = 192; y < 236; y++) {
    const strength = waterfallStrength(y)
    const r = river(y, width), left = Math.floor(r.center - r.half), span = Math.ceil(r.half * 2)
    paint(left, y, span, 1, shade(TOKYO.cyan, 0.9), strength)
    for (let strand = 0; strand < 5; strand++) {
      const x = Math.floor(left + (strand + 0.5) * span / 5)
      paint(x, y, 1, 1, TOKYO.white, strength * (0.18 + 0.62 * Math.max(0, Math.cos((y + strand * 3 - flow * 6) * Math.PI / 3)) ** 4))
    }
  }
  for (let i = 0; i < 9; i++) {
    const age = ((flow * 0.2 + i / 9) % 1 + 1) % 1
    const y = 216 + age * 19, pool = river(y, width)
    const x = pool.center + (hash(i + 2400) - 0.5) * pool.half * 1.7
    // Foam drifts out of the plunge pool and fades before wrapping upstream.
    paint(x, y, 2, 1, TOKYO.white, Math.sin(age * Math.PI) ** 2 * 0.45)
  }
  // A raised timber footbridge, not a solid dam: water remains visible below
  // the thin deck, with stone abutments only on the dry banks.
  const bridgeLeft = Math.floor(lip.center - lip.half - 9)
  const bridgeRight = Math.ceil(lip.center + lip.half + 9)
  const bridgeSpan = bridgeRight - bridgeLeft
  for (const x of [bridgeLeft, bridgeRight - 5]) {
    paint(x, 190, 5, 10, shade(TOKYO.storm, 1.1))
    paint(x, 190, 5, 2, shade(TOKYO.white, 0.75))
  }
  paint(bridgeLeft, 187, bridgeSpan, 4, shade(TOKYO.gold, 0.9))
  for (let x = bridgeLeft + 3; x < bridgeRight; x += 4) paint(x, 187, 1, 4, shade(TOKYO.storm, 0.8))
  paint(bridgeLeft, 191, bridgeSpan, 2, shade(TOKYO.gold, 0.45))
  for (let x = bridgeLeft; x < bridgeRight; x += 8) paint(x, 180, 2, 8, shade(TOKYO.gold, 0.8))
  paint(bridgeRight - 2, 180, 2, 8, shade(TOKYO.gold, 0.8))
  paint(bridgeLeft, 181, bridgeSpan, 1, shade(TOKYO.gold, 1.15))
  paint(bridgeLeft, 185, bridgeSpan, 1, shade(TOKYO.gold, 0.75))
  // Supply yard: RAM builds a freestanding pyramid of crates; used root disk
  // space fills the woodshed with up to twenty individually drawn log ends.
  const yard = supplyYard(width)
  const yardPaint: Paint = (x, y, w, h, color, alpha) => paint(Math.round(yard.x + x * yard.scale), Math.round(yard.base + y * yard.scale), Math.max(1, Math.round(w * yard.scale)), Math.max(1, Math.round(h * yard.scale)), color, alpha)
  const timber = shade(TOKYO.gold, 0.7), recess = shade(TOKYO.storm, 0.65)
  // Woodshed: open front, rear boards, low pitched roof and two upright posts.
  yardPaint(-1, 0, 29, 2, recess)
  yardPaint(1, -19, 24, 19, recess)
  for (let x = 3; x < 25; x += 5) yardPaint(x, -18, 1, 18, shade(TOKYO.gold, 0.3))
  const { crates, logs } = supplyCounts(activity)
  for (let i = 0; i < logs; i++) {
    const x = 2 + i % 5 * 4.5, y = -1 - Math.floor(i / 5) * 4
    yardPaint(x + 1, y - 3, 2, 4, shade(TOKYO.gold, 0.9))
    yardPaint(x, y - 2, 4, 2, shade(TOKYO.gold, 0.9))
    yardPaint(x + 1, y - 2, 2, 2, shade(TOKYO.pink, 0.55))
    yardPaint(x + 1, y - 2, 1, 1, shade(TOKYO.gold, 1.15))
  }
  for (const x of [0, 25]) yardPaint(x, -19, 2, 20, timber)
  for (let row = 0; row < 5; row++) yardPaint(12 - row * 3, -24 + row, 3 + row * 6, 1, shade(TOKYO.pink, 0.65))
  yardPaint(-1, -19, 29, 2, timber)
  if (snowy) for (let row = 0; row < 4; row++) yardPaint(12 - row * 3, -25 + row, 3 + row * 6, 1, shade(TOKYO.white, 0.95))
  if (activity.disk === undefined) yardPaint(22, -17, 2, 2, shade(TOKYO.gold, 1.1))
  // Four crates on the ground, then three, two and one: no rack or backboard.
  for (let i = 0; i < crates; i++) {
    const row = i < 4 ? 0 : i < 7 ? 1 : i < 9 ? 2 : 3
    const first = [0, 4, 7, 9][row]!
    const x = 34 + row * 3 + (i - first) * 6, y = -5 - row * 5
    yardPaint(x, y, 5, 5, shade(TOKYO.gold, 0.9))
    yardPaint(x + 1, y + 1, 3, 3, shade(TOKYO.gold, 0.52))
    for (let k = 0; k < 3; k++) yardPaint(x + 1 + k, y + 1 + k, 1, 1, shade(TOKYO.gold, 1.05))
    yardPaint(x, y, 5, 1, shade(TOKYO.gold, 1.15))
  }
  if (activity.ram === undefined) yardPaint(61, -2, 2, 2, shade(TOKYO.gold, 1.1))
  // Stone-and-timber mill on the pasture bank; axle enters its right-hand wall.
  const wheelX = Math.floor(river(207, width).center - river(207, width).half - 1), wheelY = 207
  const millX = wheelX - 35
  paint(millX - 2, 212, 35, 4, shade(TOKYO.storm, 1.1))
  paint(millX, 187, 29, 26, shade(TOKYO.gold, 0.85))
  for (let y = 0; y < 12; y++) {
    const half = Math.floor(y * 1.5)
    paint(millX + 14 - half, 176 + y, half * 2 + 1, 1, shade(TOKYO.pink, 0.65))
  }
  // A snowy ridge and uneven ledges follow both roof slopes, not the walls.
  if (snowy) for (let dx = -16; dx <= 16; dx++) {
    const y = 176 + Math.ceil(Math.abs(dx) / 1.5)
    const depth = 1 + Math.floor(precip * 2 + hash(dx + 4400) * 1.5)
    paint(millX + 14 + dx, y - 1, 1, depth, shade(TOKYO.white, 1.1))
    paint(millX + 14 + dx, y + depth - 1, 1, 1, shade(TOKYO.blue, 0.85))
  }
  for (const x of [millX + 2, millX + 25]) paint(x, 188, 2, 25, shade(TOKYO.storm))
  paint(millX + 12, 200, 7, 13, shade(TOKYO.storm))
  for (const x of [millX + 5, millX + 20]) {
    paint(x, 192, 5, 5, mix(shade(TOKYO.blue), TOKYO.gold, campfireLight(date, environment) * 0.8))
    paint(x + 2, 192, 1, 5, shade(TOKYO.gold))
  }
  paint(wheelX - 10, wheelY - 1, 12, 3, shade(TOKYO.gold, 1.1))
  // Pixel ring and eight radial paddle/spoke assemblies rotate clockwise.
  const angle = flow * 0.65
  for (let i = 0; i < 64; i++) {
    const a = i / 64 * Math.PI * 2
    paint(wheelX + Math.round(Math.cos(a) * 10), wheelY + Math.round(Math.sin(a) * 10), 2, 2, shade(TOKYO.gold, 0.7))
  }
  for (let i = 0; i < 8; i++) {
    const a = angle + i * Math.PI / 4
    for (let radius = 2; radius <= 10; radius++) paint(wheelX + Math.round(Math.cos(a) * radius), wheelY + Math.round(Math.sin(a) * radius), 1, 1, shade(TOKYO.gold, 1.1))
    paint(wheelX + Math.round(Math.cos(a) * 11) - 1, wheelY + Math.round(Math.sin(a) * 11) - 1, 3, 3, shade(TOKYO.gold, 0.9))
  }
  paint(wheelX - 1, wheelY - 1, 3, 3, shade(TOKYO.storm, 1.2))
  // A small tent and stone-ringed fire share the mill's woodland clearing.
  // Glow paints the ground first; the tent, logs and nearby wall pick up warmth.
  const { fireX, fireY, tentX, tentY } = camp
  const fire = campfireLight(date, environment)
  if (fire > 0) for (const radius of [21, 16, 10]) disk(fireX, fireY, radius, TOKYO.gold, fire * 0.055)
  // Two low plank benches leave the tent approach and eastbound path open.
  const benchWood = mix(shade(TOKYO.gold, 0.7), TOKYO.gold, fire * 0.16)
  for (const y of [fireY - 13, fireY + 11]) {
    paint(fireX - 7, y + 2, 15, 1, shade(TOKYO.storm, 0.6))
    for (const x of [fireX - 5, fireX + 4]) paint(x, y + 2, 2, 3, shade(TOKYO.gold, 0.4))
    paint(fireX - 7, y, 15, 2, benchWood)
    paint(fireX - 7, y, 15, 1, snowy ? shade(TOKYO.white, 0.95) : mix(benchWood, TOKYO.gold, 0.18))
  }
  paint(tentX - 13, tentY + 17, 29, 2, shade(TOKYO.storm))
  for (let y = 0; y < 17; y++) {
    const half = Math.floor(y * 0.72)
    paint(tentX - half, tentY + y, half * 2 + 1, 1, mix(shade(TOKYO.gold, 0.9), TOKYO.gold, fire * 0.18))
    paint(tentX, tentY + y, half + 1, 1, mix(shade(TOKYO.pink, 0.6), TOKYO.gold, fire * 0.12))
    if (y > 5) paint(tentX - Math.floor((y - 5) * 0.4), tentY + y, Math.floor((y - 5) * 0.6) + 1, 1, shade(TOKYO.storm))
  }
  // Snow clings to the upper canvas and slopes, leaving the doorway open.
  if (snowy) for (let dx = -11; dx <= 11; dx++) {
    const y = tentY + Math.ceil(Math.abs(dx) / 0.72)
    const depth = 1 + Math.floor(precip + hash(dx + 4500) * 1.5)
    paint(tentX + dx, y - 1, 1, depth, shade(TOKYO.white, 1.05))
  }
  paint(tentX, tentY - 2, 1, 20, shade(TOKYO.gold, 1.1))
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3
    paint(fireX + Math.round(Math.cos(a) * 5), fireY + Math.round(Math.sin(a) * 2), 2, 2, mix(shade(TOKYO.white), TOKYO.gold, fire * 0.45))
  }
  paint(fireX - 4, fireY - 1, 8, 2, shade(TOKYO.gold, 0.6))
  paint(fireX - 2, fireY - 2, 5, 2, shade(TOKYO.pink, 0.4))
  if (fire > 0) {
    const flicker = 0.5 + 0.5 * Math.sin(seconds * 7.3)
    for (let y = 0; y < 7 + Math.floor(flicker * 3); y++) {
      const half = Math.max(0, 3 - Math.floor(y / 2))
      paint(fireX - half + Math.round(Math.sin(seconds * 8 + y) * y / 9), fireY - 2 - y, half * 2 + 1, 1, y < 4 ? TOKYO.gold : TOKYO.pink, fire)
    }
    paint(fireX - 1, fireY - 5, 3, 4, TOKYO.white, fire * 0.85)
    for (let i = 0; i < 10; i++) {
      const age = ((seconds * (0.24 + wind * 0.08) + i / 10) % 1 + 1) % 1
      const x = fireX + Math.floor(windX * age * (5 + wind * 24) + Math.sin(age * 9 + i) * age * 4)
      const y = fireY - 11 - Math.floor(age * 32), puff = 1 + Math.floor(age * 4)
      paint(x - puff, y, puff * 2 + 1, 2 + Math.floor(age * 2), mix(TOKYO.storm, TOKYO.white, 0.65), fire * (1 - age) * 0.28)
      if (i % 3 === 0) paint(x, fireY - 6 - Math.floor(age * 19), 1, 1, TOKYO.gold, fire * (1 - age) * 0.8)
    }
  }
  // Weather is a final atmospheric layer; it never affects CPU-driven water or
  // calendar-driven planting. Stable seeds avoid per-frame random flicker.
  if (weather === "fog" || cloud > 0.75) {
    for (let band = 0; band < 5; band++) {
      const y = 145 + band * 17
      for (let x = 0; x < width; x += 4) paint(x, y + Math.floor(Math.sin(x / 35 + seconds * 0.05 + band) * 3), 4, 4, shade(TOKYO.white), weather === "fog" ? 0.14 : 0.035)
    }
  }
  if (weather === "rain" || weather === "storm" || weather === "snow") {
    const snow = weather === "snow", count = Math.floor(width * (snow ? 0.19 : 0.33) * Math.max(0.15, precip))
    for (let i = 0; i < count; i++) {
      const landing = precipitationLanding(i, width, camp)
      const phase = precipitationPhase(i, seconds, snow, precip, landing.y)
      const opacity = snow ? 0.5 + day * 0.25 : 0.18 + precip * 0.3
      if (phase.falling) {
        const remaining = 1 - phase.progress
        const y = -10 + (landing.y + 10) * phase.progress
        const drift = windX * wind * (snow ? 32 : 18) * remaining
        const sway = snow ? Math.sin(seconds + i) * 4 * remaining : 0
        const x = ((landing.x - drift + sway) % width + width) % width
        // Clip the streak at the collision surface; never draw through it.
        const height = Math.max(1, Math.min(snow ? 1 : 3 + Math.floor(precip * 3), landing.y - Math.floor(y)))
        paint(Math.floor(x), Math.floor(y), 1 + (snow && i % 3 === 0 ? 1 : 0), height, snow ? TOKYO.white : TOKYO.cyan, opacity)
      } else {
        const age = phase.progress, fade = (1 - age) * opacity
        if (landing.surface === "water") {
          const radius = 1 + Math.floor(age * 4)
          paint(landing.x - radius, landing.y, radius * 2 + 1, 1, TOKYO.cyan, fade)
          paint(landing.x - radius + 1, landing.y + 1, Math.max(1, radius * 2 - 1), 1, TOKYO.white, fade * 0.4)
        } else if (snow) {
          // A flake compresses into a small powder patch before fading away.
          paint(landing.x - 1, landing.y, 3, 1, TOKYO.white, fade)
          if (age < 0.3) paint(landing.x, landing.y - 1, 1, 1, TOKYO.white, fade)
        } else {
          const radius = 1 + Math.floor(age * 3)
          const lift = Math.round(Math.sin(age * Math.PI) * 2)
          paint(landing.x - radius, landing.y - lift, 1, 1, TOKYO.cyan, fade)
          paint(landing.x + radius, landing.y - lift, 1, 1, TOKYO.cyan, fade)
          paint(landing.x - 1, landing.y, 3, 1, TOKYO.cyan, fade * 0.5)
        }
      }
    }
  }
}
