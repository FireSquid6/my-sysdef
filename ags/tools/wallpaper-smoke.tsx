import app from "ags/gtk4/app"
import { createState, onCleanup } from "ags"
import GLib from "gi://GLib?version=2.0"
import { Wallpaper } from "../wallpaper"

// Does not start the service, kill Hyprpaper, or touch preferences.
app.start({
  instanceName: "sysdef-wallpaper-smoke",
  main() {
    const [animated, setAnimated] = createState(true)
    const windows = app.get_monitors().map(monitor => Wallpaper({ monitor, service: { animated } }))
    const hide = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => { setAnimated(false); return GLib.SOURCE_REMOVE })
    const quit = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => { console.log(`Wallpaper smoke: ${windows.length} monitor windows created, animated and hidden`); app.quit(); return GLib.SOURCE_REMOVE })
    // The sources remove themselves; the component owns its redraw timer/windows.
    void hide; void quit
    onCleanup(() => console.log("Wallpaper smoke: cleaned up"))
  },
})
