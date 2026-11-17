import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"
import { localCities, sampleCities } from "../wallpaper-cities"

export function createWallpaperCities(enabled = true) {
  const hostname = GLib.get_host_name()
  let state = localCities(hostname), timer = 0, stopped = false
  const children = new Set<Gio.Subprocess>()
  function run(argv: string[]) {
    const child = Gio.Subprocess.new(argv, Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE)
    children.add(child)
    return new Promise<string>((resolve, reject) => child.communicate_utf8_async(null, null, (self, result) => {
      children.delete(child)
      try {
        const [, output, error] = self!.communicate_utf8_finish(result)
        if (!child.get_successful()) throw Error(error || "City reachability probe failed")
        resolve(output ?? "")
      } catch (error) { reject(error) }
    }))
  }
  async function refresh() {
    const next = await sampleCities(hostname, argv => stopped ? Promise.reject(Error("Stopped")) : run(argv))
    if (stopped) return
    state = next
    // Schedule after completion: slow probes cannot overlap or pile up.
    timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 30, () => {
      timer = 0; void refresh(); return GLib.SOURCE_REMOVE
    })
  }
  if (enabled) void refresh()
  return {
    sample: () => state,
    stop() {
      stopped = true
      if (timer) GLib.source_remove(timer)
      timer = 0
      for (const child of children) child.force_exit()
      children.clear()
    },
  }
}
