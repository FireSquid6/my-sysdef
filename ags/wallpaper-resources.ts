/** Pure Linux resource parsing and frame-rate-independent landscape motion. */
export type Resources = { cpu: number; ram?: number; disk?: number }
export type CpuSample = { total: number; idle: number }
export const fraction = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
export function parseCpu(text: string): CpuSample | null {
  const line = text.split("\n").find(line => /^cpu\s/.test(line))
  if (!line) return null
  // guest/guest_nice are already included in user/nice; never count them twice.
  const values = line.trim().split(/\s+/).slice(1, 9).map(Number)
  if (values.length < 4 || values.some(value => !Number.isFinite(value) || value < 0)) return null
  return { total: values.reduce((a, b) => a + b, 0), idle: values[3]! + (values[4] ?? 0) }
}
export function cpuUsage(previous: CpuSample | null, next: CpuSample): number | null {
  if (!previous || next.total <= previous.total || next.idle < previous.idle) return null
  return fraction(1 - (next.idle - previous.idle) / (next.total - previous.total))
}
/** Ten fill levels with a 2% deadband so crates do not chatter at boundaries. */
export function resourceLevel(usage: number, previous?: number) {
  const value = fraction(usage) * 10
  if (previous === undefined) return Math.floor(value)
  let level = Math.max(0, Math.min(10, Math.floor(previous)))
  while (level < 10 && value >= level + 1.2) level++
  while (level > 0 && value < level - 0.2) level--
  if (value >= 9.98) return 10
  return level
}
export function filesystemUsage(size: number, free: number): number | null {
  return Number.isFinite(size) && Number.isFinite(free) && size > 0 && free >= 0 && free <= size ? (size - free) / size : null
}
export type LandscapeMotion = Resources & { flow: number; ramCrates?: number }
export function advanceMotion(previous: LandscapeMotion, target: Resources, elapsed: number): LandscapeMotion {
  // Do not catch up hours of animation after suspend or a hidden wallpaper.
  const dt = Math.max(0, Math.min(1, Number.isFinite(elapsed) ? elapsed : 0))
  const blend = 1 - Math.exp(-dt / 1.5)
  const cpu = previous.cpu + (fraction(target.cpu) - previous.cpu) * blend
  // Analytic integral of the smoothed CPU signal, independent of frame rate.
  const integratedCpu = fraction(target.cpu) * dt + (previous.cpu - fraction(target.cpu)) * 1.5 * blend
  const ram = target.ram === undefined ? previous.ram : previous.ram === undefined ? fraction(target.ram)
    : previous.ram + (fraction(target.ram) - previous.ram) * (1 - Math.exp(-dt / 3))
  const disk = target.disk === undefined ? previous.disk : fraction(target.disk)
  return { cpu, flow: previous.flow + dt * 0.35 + 2.65 * integratedCpu,
    ...(ram === undefined ? {} : { ram, ramCrates: resourceLevel(ram, previous.ramCrates) }),
    ...(disk === undefined ? {} : { disk }) }

}
