/** Pure, deterministic pixel scene. All colors derive from Tokyo Night's palette. */
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
  return { center: width * (0.53 + Math.sin(depth * 6.4 - 0.4) * (0.015 + depth * 0.13)), half: 1 + depth * depth * width * 0.13 }
}
/** Logical height is 270px; width follows the output so ultrawides aren't stretched. */
export function drawLandscape(paint: Paint, width: number, date: Date, seconds: number) {
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
    if ((y + Math.floor(seconds * 3)) % 7 === 0) {
      const offset = Math.sin(y * 1.7 + seconds * 0.8) * r.half * 0.5
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
