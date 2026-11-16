/** Native resource sampling/lifecycle check; no shell window or live restart.
 * ags run ags/tools/wallpaper-resources-smoke.ts --gtk 4 */
import GLib from "gi://GLib?version=2.0"
import { createWallpaperResources } from "../services/wallpaper-resources"

const loop = new GLib.MainLoop(null, false)
const resources = createWallpaperResources()
let failure: Error | null = null
// Cancel an in-flight filesystem read, then immediately restart the sampler.
resources.start(); resources.start(); resources.stop(); resources.start()
GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1800, () => {
  try {
    const sample = resources.sample()
    for (const key of ["cpu", "ram", "disk"] as const) {
      const value = sample[key]
      if (value === undefined || !Number.isFinite(value) || value < 0 || value > 1) throw Error(`Invalid ${key}: ${value}`)
    }
    console.log(`Wallpaper resources sampled successfully: ${JSON.stringify(sample)}`)
  } catch (error) { failure = error instanceof Error ? error : Error(String(error)) }
  finally { resources.stop(); resources.stop(); loop.quit() }
  return GLib.SOURCE_REMOVE
})
loop.run()
if (failure) throw failure
