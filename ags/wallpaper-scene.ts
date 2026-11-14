/** Pure, deterministic pixel scene. All colors derive from Tokyo Night's palette. */
import type { LandscapeMotion } from "./wallpaper-resources"
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
  const reach = y < 192 ? y : y <= 218 ? 192 : 192 + (y - 218) * 78 / 52
  const bend = Math.max(0, (reach - 157) / 113)
  return { center: width * (0.53 + Math.sin(bend * 6.4 - 0.4) * (0.015 + bend * 0.13)), half: 1 + depth * depth * width * 0.13 }
}
/** Logical height is 270px; width follows the output so ultrawides aren't stretched. */
export function drawLandscape(paint: Paint, width: number, date: Date, seconds: number,
  activity: Pick<LandscapeMotion, "flow"> = { flow: seconds * 0.35 },
  environment: LandscapeEnvironment = resolveEnvironment(date),
  crops: CropState = advanceCrops(null, date, environment.latitude)) {
  const flow = Number.isFinite(activity.flow) ? activity.flow : 0
  const { daylight: day, dusk, night } = lighting(date, environment)
  const { season, weather, cloud, precip, wind, moonPhase, moonIllumination } = environment
  const clearSky = 1 - cloud * 0.94
  const shade = (c: RGB, strength = 1) => mix(TOKYO.night, c, (0.25 + day * (0.55 - cloud * 0.18)) * strength)
  const foliage = season === "autumn" ? TOKYO.gold : season === "winter" ? mix(TOKYO.teal, TOKYO.white, 0.4) : season === "spring" ? mix(TOKYO.green, TOKYO.teal, 0.3) : TOKYO.green
  const snowy = weather === "snow" || (season === "winter" && (environment.temperature ?? -1) < 3)
  const skyTop = mix(mix(TOKYO.night, mix(TOKYO.storm, TOKYO.blue, 0.42), day), TOKYO.storm, cloud * 0.55)
  const skyBottom = mix(mix(mix(TOKYO.storm, TOKYO.purple, 0.16), mix(TOKYO.blue, TOKYO.cyan, 0.32), day * 0.65), TOKYO.storm, cloud * 0.55)
  for (let y = 0; y < 176; y += 2) paint(0, y, width, 2, mix(mix(skyTop, skyBottom, y / 176), TOKYO.pink, dusk * (y / 176) ** 3 * 0.35 * clearSky))
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
  if (day > 0.08 && cloud < 0.9) disk(width * (0.16 + 0.68 * Math.max(0, Math.min(1, (lighting(date, environment).hour - environment.sunrise) / (environment.sunset - environment.sunrise)))), 110 - day * 65, 9, mix(TOKYO.gold, TOKYO.white, day * 0.4))
  if (night > 0.2 && clearSky > 0.12) {
    const cx = Math.floor(width * 0.79), cy = 38, radius = 9
    for (let y = -radius; y <= radius; y++) for (let x = -radius; x <= radius; x++) {
      if (moonPixelLit(x / radius, y / radius, moonPhase)) paint(cx + x, cy + y, 1, 1, mix(TOKYO.blue, TOKYO.white, 0.85), night * clearSky)
    }
  }
  const windX = -Math.sin(environment.windDirection * Math.PI / 180)
  for (let i = 0; i < 5 + Math.floor(cloud * 20); i++) {
    const drift = seconds * (0.3 + wind * 2 + i * 0.03) * (Math.abs(windX) < 0.1 ? 0.1 : windX)
    const x = Math.floor((((hash(i + 70) * width + drift) % (width + 100) + width + 100) % (width + 100)) - 70)
    const y = 52 + Math.floor(hash(i + 80) * 67)
    paint(x + 8, y, 34, 4, shade(cloud > 0.65 ? TOKYO.storm : TOKYO.purple), 0.4 + cloud * 0.4)
    paint(x, y + 4, 70, 5 + Math.floor(cloud * 5), shade(cloud > 0.65 ? TOKYO.blue : TOKYO.white), 0.18 + cloud * 0.5)
  }
  // Wider, closer peaks on a lower horizon leave substantially more open sky.
  for (let layer = 0; layer < 3; layer++) for (let x = 0; x < width; x++) {
    const u = x / width
    const wave = u * (4.3 + layer * 1.4) + layer * 1.7
    const triangle = (v: number) => Math.abs(Math.asin(Math.sin(v))) * 2 / Math.PI
    const ridge = triangle(wave) * (34 - layer * 5) + triangle(u * 18 + layer) * 7
    const y = Math.floor(114 + layer * 12 + ridge)
    const face = Math.sin(wave) * Math.cos(wave) > 0 ? 0.14 : 0
    paint(x, y, 1, 179 - y, shade(mix(layer === 0 ? TOKYO.purple : layer === 1 ? TOKYO.blue : TOKYO.teal, TOKYO.storm, face), 0.95 - layer * 0.12))
    const cap = snowy ? 21 : season === "summer" ? 6 : 12
    if (layer === 0 && ridge < cap) paint(x, y, 1, Math.floor((cap - ridge) * 0.55) + 1, shade(TOKYO.white))
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
    if ((y - Math.floor(flow * 6)) % 7 === 0) {
      const offset = Math.sin(y * 1.7 + flow * 0.8) * r.half * 0.5
      paint(Math.floor(r.center + offset - r.half * 0.2), y, Math.max(1, Math.floor(r.half * 0.4)), 1, mix(TOKYO.blue, TOKYO.white, 0.35), 0.25 + day * 0.2)
    }
  }
  // Sparse grasses / wildflowers; wind shifts only their tips.
  for (let i = 0; i < width * 1.1; i++) {
    const x = Math.floor(hash(i + 300) * width), y = 179 + Math.floor(hash(i + 900) * 91), r = river(y, width)
    if (Math.abs(x - r.center) < r.half + 5) continue
    const h = 1 + Math.floor((y - 157) / 38), sway = Math.sin(seconds * 0.9 + i) > 0 ? 1 : -1
    paint(x, y, 1, h, shade(TOKYO.teal, 0.65)); paint(x + sway, y - 1, 1, 1, shade(snowy ? TOKYO.white : i % 9 === 0 && season === "spring" ? TOKYO.pink : foliage, 0.8))
  }
  // Dense layered woodland, with deliberate clearings for the mill, campsite,
  // river and crop field. Back-to-front rows keep the pixel canopy depth readable.
  const millBank = Math.floor(river(207, width).center - river(207, width).half - 36)
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
    if (base > 185 && x > millBank - 61 && x < millBank + 42) continue
    if (base > 202 && x > width * 0.62 && x < width * 0.91) continue
    if (hash(seed + 810) < (row < 3 ? 0.1 : 0.27)) continue
    tree(x, base, size, seed)
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
  for (let y = 192; y <= 218; y++) {
    const r = river(y, width), left = Math.floor(r.center - r.half), span = Math.ceil(r.half * 2)
    paint(left, y, span, 1, shade(TOKYO.cyan, 0.9))
    for (let strand = 0; strand < 5; strand++) {
      const x = Math.floor(left + (strand + 0.5) * span / 5)
      paint(x, y, 1, 1, TOKYO.white, (y + strand * 3 - Math.floor(flow * 6)) % 6 === 0 ? 0.8 : 0.18)
    }
  }
  const pool = river(219, width)
  for (let i = 0; i < 9; i++) {
    const x = Math.floor(pool.center + (i / 8 - 0.5) * pool.half * 2)
    paint(x, 219 + Math.floor((i + flow * 3) % 3), 2, 1, TOKYO.white, 0.45)
  }
  // Stone-and-timber mill on the pasture bank; axle enters its right-hand wall.
  const wheelX = Math.floor(river(207, width).center - river(207, width).half - 1), wheelY = 207
  const millX = wheelX - 35
  paint(millX - 2, 212, 35, 4, shade(TOKYO.storm, 1.1))
  paint(millX, 187, 29, 26, shade(TOKYO.gold, 0.85))
  for (let y = 0; y < 12; y++) {
    const half = Math.floor(y * 1.5)
    paint(millX + 14 - half, 176 + y, half * 2 + 1, 1, shade(TOKYO.pink, 0.65))
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
  const fireX = millX - 14, fireY = 234, fire = campfireLight(date, environment)
  if (fire > 0) for (const radius of [21, 16, 10]) disk(fireX, fireY, radius, TOKYO.gold, fire * 0.055)
  const tentX = millX - 39
  paint(tentX - 13, 229, 29, 2, shade(TOKYO.storm))
  for (let y = 0; y < 17; y++) {
    const half = Math.floor(y * 0.72)
    paint(tentX - half, 212 + y, half * 2 + 1, 1, mix(shade(TOKYO.gold, 0.9), TOKYO.gold, fire * 0.18))
    paint(tentX, 212 + y, half + 1, 1, mix(shade(TOKYO.pink, 0.6), TOKYO.gold, fire * 0.12))
    if (y > 5) paint(tentX - Math.floor((y - 5) * 0.4), 212 + y, Math.floor((y - 5) * 0.6) + 1, 1, shade(TOKYO.storm))
  }
  paint(tentX, 210, 1, 20, shade(TOKYO.gold, 1.1))
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
  // Foreground pines frame the river without obscuring the vista.
  for (const [u, base, size] of [[0.025, 264, 45], [0.07, 240, 32], [0.12, 227, 23], [0.91, 245, 38], [0.96, 232, 27], [0.985, 269, 44]]) {
    const x = Math.floor(width * u!)
    paint(x, base! - size!, 2, size! + 4, mix(TOKYO.night, TOKYO.storm, 0.3))
    for (let k = 0; k < 4; k++) for (let y = 0; y < size! * 0.4; y++) {
      const half = Math.floor(y * 0.48)
      paint(x - half, Math.floor(base! - size! + k * size! * 0.19 + y), half * 2 + 2, 1, snowy && y < 3 ? shade(TOKYO.white, 0.65) : mix(TOKYO.night, TOKYO.teal, 0.04 + day * 0.07))
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
      const y = ((hash(i + 1710) * 290 + seconds * (snow ? 8 + hash(i) * 7 : 100 + precip * 60)) % 290 + 290) % 290 - 10
      const x = ((hash(i + 1910) * width + windX * (seconds * wind * (snow ? 9 : 28) + y * 0.12) + (snow ? Math.sin(seconds + i) * 3 : 0)) % width + width) % width
      paint(Math.floor(x), Math.floor(y), 1 + (snow && i % 3 === 0 ? 1 : 0), snow ? 1 : 3 + Math.floor(precip * 3), snow ? TOKYO.white : TOKYO.cyan, snow ? 0.5 + day * 0.25 : 0.18 + precip * 0.3)
    }
  }
}
