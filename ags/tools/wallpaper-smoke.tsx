import app from "ags/gtk4/app"
import { createState } from "ags"
import GLib from "gi://GLib?version=2.0"
import Gio from "gi://Gio?version=2.0"
import { execAsync } from "ags/process"
import { Wallpaper } from "../wallpaper"

// Isolated windows only: no service, preferences, DPMS or session changes.
app.start({
  instanceName: "sysdef-wallpaper-smoke",
  main() {
    const [animated, setAnimated] = createState(true)
    const windows = app.get_monitors().map(monitor => Wallpaper({ monitor, service: { animated } }))
    const delay = () => new Promise<void>(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
      resolve(); return GLib.SOURCE_REMOVE
    }))
    async function assertBackground(stage: string) {
      await delay()
      const monitors = JSON.parse(await execAsync(["hyprctl", "layers", "-j"]))
      let found = 0
      for (const monitor of Object.values(monitors) as any[]) {
        for (const [level, surfaces] of Object.entries(monitor.levels)) {
          for (const surface of surfaces as any[]) {
            if (surface.pid !== new Gio.Credentials().get_unix_pid()) continue
            found++
            if (level !== "0") throw Error(`${stage}: wallpaper is on layer ${level}, not background (0)`)
          }
        }
      }
      if (found !== windows.length) throw Error(`${stage}: expected ${windows.length} surfaces, found ${found}`)
    }
    void (async () => {
      try {
        await assertBackground("initial animated map")
        setAnimated(false)
        await delay()
        setAnimated(true)
        await assertBackground("remap")
        console.log(`Wallpaper smoke passed: ${windows.length} windows stay on compositor background layer on initial map and remap`)
        app.quit(0)
      } catch (error) {
        console.error(error)
        app.quit(1)
      }
    })()
  },
})
