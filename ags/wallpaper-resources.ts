/** Pure Linux resource parsing and frame-rate-independent landscape motion. */
export type Resources = { cpu: number; memory: number }
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
export function memoryUsage(text: string): number | null {
  const read = (name: string) => Number(text.match(new RegExp(`^${name}:\\s+(\\d+)\\s+kB\\s*$`, "m"))?.[1] ?? NaN)
  const total = read("MemTotal"), available = read("MemAvailable")
  // MemAvailable excludes reclaimable cache from pressure, unlike MemFree.
  return total > 0 && Number.isFinite(total) && Number.isFinite(available) ? fraction(1 - available / total) : null
}
export type LandscapeMotion = Resources & { flow: number }
export function advanceMotion(previous: LandscapeMotion, target: Resources, elapsed: number): LandscapeMotion {
  // Do not catch up hours of animation after suspend or a hidden wallpaper.
  const dt = Math.max(0, Math.min(1, Number.isFinite(elapsed) ? elapsed : 0))
  const blend = 1 - Math.exp(-dt / 1.5)
  const cpu = previous.cpu + (fraction(target.cpu) - previous.cpu) * blend
  const memory = previous.memory + (fraction(target.memory) - previous.memory) * blend
  // Analytic integral of the smoothed CPU signal, independent of frame rate.
  const integratedCpu = fraction(target.cpu) * dt + (previous.cpu - fraction(target.cpu)) * 1.5 * blend
  return { cpu, memory, flow: previous.flow + dt * 0.35 + 2.65 * integratedCpu }
}
export const cropCount = (memory: number, capacity = 96) => Math.round(fraction(memory) * capacity)
