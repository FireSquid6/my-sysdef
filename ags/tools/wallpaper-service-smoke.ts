/** Run only with isolated state, session identity, and stub hyprpaper/hyprctl in PATH. */
import { createRoot } from "ags"
import GLib from "gi://GLib?version=2.0"
import System from "system"
import { createWallpaperService } from "../services/wallpaper"
if (GLib.getenv("SYSDEF_WALLPAPER_TEST") !== "1" || !GLib.getenv("HYPRLAND_INSTANCE_SIGNATURE")?.startsWith("wallpaper-test-")) throw Error("Requires an isolated wallpaper test session")
const loop = new GLib.MainLoop(null, false)
const check = (condition: boolean, message: string) => { if (!condition) throw Error(message) }
createRoot(dispose => {
  const service = createWallpaperService()
  void (async () => {
    try {
      await service.start()
      check(service.animated(), "animated startup")
      await service.toggle()
      check(service.state().mode === "hyprpaper" && !service.animated() && !service.state().error, "static readiness")
      await service.toggle()
      check(service.state().mode === "animated" && service.animated() && !service.state().error, "static shutdown")
      // Simulate a renderer which forks successfully but dies before becoming ready.
      GLib.setenv("SYSDEF_WALLPAPER_FAIL", "1", true)
      await service.toggle()
      check(service.state().mode === "animated" && service.animated() && !!service.state().error, "startup failure rollback")
      GLib.unsetenv("SYSDEF_WALLPAPER_FAIL")
      await service.toggle()
      check(service.state().mode === "hyprpaper", "retry after failure")
      service.stop(); dispose()
      console.log("Wallpaper service smoke: startup, readiness, switching, termination, failure rollback, retry passed")
      loop.quit()
    } catch (error) { service.stop(); dispose(); console.error(String(error)); System.exit(1) }
  })()
})
loop.run()
