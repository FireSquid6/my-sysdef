import GLib from "gi://GLib?version=2.0"
import { readFile } from "ags/file"
import { cpuUsage, memoryUsage, parseCpu, type CpuSample, type Resources } from "../wallpaper-resources"

/** One cheap /proc poll shared by all monitors; no subprocesses or per-frame I/O. */
export function createWallpaperResources() {
  let current: Resources = { cpu: 0, memory: 0 }
  let previous: CpuSample | null = null
  let timer = 0
  const warned = new Set<string>()
  const warn = (source: string, error: unknown) => {
    if (!warned.has(source)) { warned.add(source); console.warn(`Wallpaper ${source}: ${error}`) }
  }
  function update() {
    try {
      const next = parseCpu(readFile("/proc/stat"))
      if (!next) throw Error("invalid /proc/stat")
      const cpu = cpuUsage(previous, next)
      previous = next
      if (cpu !== null) current = { ...current, cpu }
    } catch (error) { previous = null; warn("CPU", error) }
    try {
      const memory = memoryUsage(readFile("/proc/meminfo"))
      if (memory === null) throw Error("MemTotal/MemAvailable unavailable")
      current = { ...current, memory }
    } catch (error) { warn("RAM", error) }
  }
  return {
    sample: () => current,
    start() {
      if (timer) return
      update()
      timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT_IDLE, 1, () => { update(); return GLib.SOURCE_CONTINUE })
    },
    stop() { if (timer) GLib.source_remove(timer); timer = 0; previous = null },
  }
}
