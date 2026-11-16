import GLib from "gi://GLib?version=2.0"
import Gio from "gi://Gio?version=2.0"
import { readFile } from "ags/file"
import { cpuUsage, filesystemUsage, parseCpu, type CpuSample, type Resources } from "../wallpaper-resources"
import { parseMemory } from "../sidebar-model"

/** Shared /proc readings each second; async root filesystem stats every 30s.
 * No subprocesses, per-frame I/O, or per-monitor resource polling. */
export function createWallpaperResources() {
  let current: Resources = { cpu: 0 }
  let previous: CpuSample | null = null
  let timer = 0, diskTimer = 0
  let cancellation: Gio.Cancellable | null = null
  let diskPending = false
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
      const memory = parseMemory(readFile("/proc/meminfo"))
      if (!memory) throw Error("invalid /proc/meminfo")
      current = { ...current, ram: memory.used / memory.total }
    } catch (error) { warn("RAM", error) }
  }
  function updateDisk() {
    if (!cancellation || diskPending) return
    const request = cancellation
    diskPending = true
    const root = Gio.File.new_for_path("/")
    root.query_filesystem_info_async("filesystem::size,filesystem::free", GLib.PRIORITY_DEFAULT_IDLE, request, (_file, result) => {
      try {
        const info = root.query_filesystem_info_finish(result)
        if (request !== cancellation || request.is_cancelled()) return
        const disk = filesystemUsage(info.get_attribute_uint64("filesystem::size"), info.get_attribute_uint64("filesystem::free"))
        if (disk === null) throw Error("invalid root filesystem capacity")
        current = { ...current, disk }
      } catch (error) { if (!request.is_cancelled()) warn("disk", error) }
      finally { if (request === cancellation) diskPending = false }
    })
  }
  return {
    sample: () => current,
    start() {
      if (timer) return
      cancellation = new Gio.Cancellable()
      update(); updateDisk()
      timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT_IDLE, 1, () => { update(); return GLib.SOURCE_CONTINUE })
      diskTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT_IDLE, 30, () => { updateDisk(); return GLib.SOURCE_CONTINUE })
    },
    stop() {
      if (timer) GLib.source_remove(timer)
      if (diskTimer) GLib.source_remove(diskTimer)
      cancellation?.cancel(); cancellation = null
      timer = 0; diskTimer = 0; diskPending = false; previous = null
    },
  }
}
