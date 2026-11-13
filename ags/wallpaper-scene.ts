/** Pure, deterministic pixel scene. All colors derive from Tokyo Night's palette. */
import { cropCount, type LandscapeMotion } from "./wallpaper-resources"
export type RGB = readonly [number, number, number]
export const TOKYO = {
  night: [26, 27, 38], storm: [36, 40, 59], blue: [122, 162, 247],
  cyan: [125, 207, 255], teal: [115, 218, 202], green: [158, 206, 106],
  purple: [187, 154, 247], pink: [247, 118, 142], gold: [224, 175, 104],
  white: [192, 202, 245],
} as const satisfies Record<string, RGB>
export const mix = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => v + (b[i]! - v) * Math.max(0, Math.min(1, t))) as unknown as RGB
const smooth = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t) }
export function lighting(date: Date) {
  const hour = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600
  const daylight = smooth((hour - 5) / 2) * (1 - smooth((hour - 17) / 3))
  const dusk = Math.max(0, 1 - Math.abs(hour - 6) / 1.5, 1 - Math.abs(hour - 18.5) / 1.5)
  return { hour, daylight, dusk, night: 1 - smooth(daylight / 0.5) }
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
  activity: Pick<LandscapeMotion, "flow" | "memory"> = { flow: seconds * 0.35, memory: 0 }) {
  const flow = Number.isFinite(activity.flow) ? activity.flow : 0
  const { daylight: day, dusk, night } = lighting(date)
  const shade = (c: RGB, strength = 1) => mix(TOKYO.night, c, (0.25 + day * 0.55) * strength)
  const skyTop = mix(TOKYO.night, mix(TOKYO.storm, TOKYO.blue, 0.42), day)
  const skyBottom = mix(mix(TOKYO.storm, TOKYO.purple, 0.16), mix(TOKYO.blue, TOKYO.cyan, 0.32), day * 0.65)
  for (let y = 0; y < 168; y += 2) paint(0, y, width, 2, mix(mix(skyTop, skyBottom, y / 168), TOKYO.pink, dusk * (y / 168) ** 3 * 0.35))
  if (night > 0) {
    for (let i = 0; i < width / 4; i++) {
      const x = Math.floor(hash(i + 1) * width), y = Math.floor(hash(i + 921) * 118)
      paint(x, y, 1, 1, TOKYO.white, night * (0.3 + 0.55 * (0.5 + 0.5 * Math.sin(seconds * 0.7 + i))))
    }
    // Layered translucent curtains, stepped on the same pixel grid as the terrain.
    for (let band = 0; band < 3; band++) for (let x = 0; x < width; x += 2) {
      const u = x / width
      const crest = 33 + band * 14 + Math.sin(u * 8 + seconds * 0.07 + band) * 13 + Math.sin(u * 19 - seconds * 0.04) * 5
      const envelope = Math.sin(Math.PI * u) ** 2
      for (let k = 0; k < 7; k++) paint(x, Math.floor(crest - k * 4), 2, 4, mix(TOKYO.teal, TOKYO.purple, band / 2), night * envelope * (1 - k / 7) * 0.30)
    }
  }
  // Pixel disks (no antialiased vector edges).
  const disk = (cx: number, cy: number, radius: number, c: RGB) => {
    for (let y = -radius; y <= radius; y++) { const r = Math.floor(Math.sqrt(radius * radius - y * y)); paint(Math.floor(cx) - r, Math.floor(cy) + y, r * 2 + 1, 1, c) }
  }
  if (day > 0.08) disk(width * (0.16 + 0.68 * Math.max(0, Math.min(1, (lighting(date).hour - 6) / 13))), 110 - day * 65, 9, mix(TOKYO.gold, TOKYO.white, day * 0.4))
  if (night > 0.2) { disk(width * 0.79, 39, 8, mix(TOKYO.blue, TOKYO.white, 0.8)); paint(Math.floor(width * 0.79) - 3, 36, 3, 2, TOKYO.blue, 0.3) }
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(((hash(i + 70) * width + seconds * (0.3 + i * 0.03)) % (width + 80)) - 60)
    const y = 57 + Math.floor(hash(i + 80) * 42)
    paint(x + 8, y, 34, 3, shade(TOKYO.purple), 0.4); paint(x, y + 3, 60, 3, shade(TOKYO.white), 0.22)
  }
  // Three ridgelines; triangular harmonics give craggy, non-sinusoidal peaks.
  for (let layer = 0; layer < 3; layer++) for (let x = 0; x < width; x++) {
    const u = x / width
    const ridge = Math.abs(Math.sin(u * (7 + layer * 3) + layer * 2)) * (29 - layer * 4) + Math.abs(Math.sin(u * 23 + layer)) * 9
    const y = Math.floor(89 + layer * 24 + ridge)
    paint(x, y, 1, 175 - y, shade(layer === 0 ? TOKYO.purple : layer === 1 ? TOKYO.blue : TOKYO.teal, 0.75 - layer * 0.12))
    if (layer === 0 && ridge < 12) paint(x, y, 1, Math.floor((12 - ridge) * 0.45) + 1, shade(TOKYO.white))
  }
  for (let y = 157; y < 270; y++) {
    const depth = (y - 157) / 113
    paint(0, y, width, 1, mix(shade(TOKYO.teal, 0.5), shade(TOKYO.green, 0.65), depth))
    // Broad cultivated field bands and a riverbank.
    const field = Math.sin(depth * 25 + 0.7) > 0
    paint(0, y, width, 1, shade(field ? TOKYO.green : TOKYO.gold, 0.55), 0.3)
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
    const x = Math.floor(hash(i + 300) * width), y = 169 + Math.floor(hash(i + 900) * 101), r = river(y, width)
    if (Math.abs(x - r.center) < r.half + 5) continue
    const h = 1 + Math.floor((y - 157) / 38), sway = Math.sin(seconds * 0.9 + i) > 0 ? 1 : -1
    paint(x, y, 1, h, shade(TOKYO.teal, 0.65)); paint(x + sway, y - 1, 1, 1, shade(i % 9 === 0 ? TOKYO.pink : TOKYO.green, 0.8))
  }
  // Cultivated field across the river from the mill and open pasture. Its 96
  // planting sites fill back-to-front with used RAM, leaving visible bare furrows.
  const planted = cropCount(activity.memory)
  for (let y = 207; y <= 250; y++) {
    const depth = (y - 207) / 43
    const left = Math.floor(width * (0.73 - depth * 0.09))
    const right = Math.floor(width * (0.84 + depth * 0.035))
    paint(left, y, right - left + 1, 1, shade(TOKYO.gold, 0.46))
    if ((y - 207) % 5 === 0) paint(left, y, right - left + 1, 1, shade(TOKYO.storm, 0.7))
    paint(left - 1, y, 1, 1, shade(TOKYO.gold, 0.85))
    paint(right + 1, y, 1, 1, shade(TOKYO.gold, 0.85))
  }
  for (let row = 0; row < 8; row++) for (let column = 0; column < 12; column++) {
    const y = 211 + row * 5, depth = (y - 207) / 43
    const left = width * (0.73 - depth * 0.09), right = width * (0.84 + depth * 0.035)
    const x = Math.floor(left + (column + 0.5) * (right - left) / 12)
    if (row * 12 + column >= planted) continue
    const height = 2 + Math.floor(row / 3)
    paint(x, y - height, 1, height, shade(TOKYO.green, 0.95))
    paint(x - 1, y - height + 1, 3, 1, shade(TOKYO.teal, 0.8))
    paint(x, y - height - 1, 1, 1, shade(TOKYO.gold, 1.1))
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
    paint(x, 192, 5, 5, shade(TOKYO.blue))
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
  // Foreground pines frame the river without obscuring the vista.
  for (const [u, base, size] of [[0.07, 240, 32], [0.12, 227, 23], [0.91, 245, 38], [0.96, 232, 27]]) {
    const x = Math.floor(width * u!)
    paint(x, base! - size!, 2, size! + 4, mix(TOKYO.night, TOKYO.storm, 0.3))
    for (let k = 0; k < 4; k++) for (let y = 0; y < size! * 0.4; y++) {
      const half = Math.floor(y * 0.48)
      paint(x - half, Math.floor(base! - size! + k * size! * 0.19 + y), half * 2 + 2, 1, mix(TOKYO.night, TOKYO.teal, 0.04 + day * 0.07))
    }
  }
}
