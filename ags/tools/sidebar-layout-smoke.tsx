// Opt-in live layout check: displays a read-only, non-keyboard-grabbing panel.
// All actions are mocked. Checks the compositor's geometry through content refresh.
import app from "ags/gtk4/app"
import { Astal } from "ags/gtk4"
import GLib from "gi://GLib?version=2.0"
import { execAsync } from "ags/process"
import { readFile } from "ags/file"
import { createSidebar } from "../sidebar"
import { createState } from "ags"
import { EMPTY_CAFFEINE } from "../caffeine-model"
import style from "../style.css"
const pause = (ms: number) => new Promise<void>(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => { resolve(); return GLib.SOURCE_REMOVE }))
app.start({ instanceName: "sysdef-layout-smoke", css: style, main() {
  const monitor = app.get_monitors()[0]!
  const pid = Number(readFile("/proc/self/stat").split(" ")[0])
  let polls = 0
  const [caffeineState] = createState(EMPTY_CAFFEINE)
  const sidebar = createSidebar({ caffeine: { state: caffeineState, toggle: async () => {} }, close() {}, showError(error) { console.error(error) }, copy() {}, run: async argv => {
    if (!argv.includes("tailscale")) throw Error("Desktop actions disabled in the layout test")
    polls++
    return JSON.stringify({ BackendState: "Running", Self: { ID: "self", HostName: "layout-self", Online: true }, Peer: polls > 1 ? { peer: { ID: "peer", HostName: "layout-peer", Online: false } } : {} })
  } })
  sidebar.window.namespace = "sysdef-sidebar-layout-check"
  app.add_window(sidebar.window)
  sidebar.open(monitor)
  sidebar.window.keymode = Astal.Keymode.NONE
  sidebar.window.sensitive = false
  void (async () => {
    let failed = false
    try {
      const outputs = JSON.parse(await execAsync(["hyprctl", "-j", "monitors"]))
      const output = outputs.find((o: any) => o.name === monitor.connector)
      if (!output) throw Error("Could not identify the test monitor")
      const reserved = output.reserved ?? [0, 0, 0, 0]
      const expected = monitor.geometry.height - reserved[1] - reserved[3] - 40
      for (const delay of [250, 750, 4500]) {
        await pause(delay)
        const layers = JSON.parse(await execAsync(["hyprctl", "-j", "layers"]))
        const layer: any = Object.values(layers).flatMap((o: any) => Object.values(o.levels).flat()).find((l: any) => l.pid === pid && l.namespace === "sysdef-sidebar-layout-check")
        const panelHeight = sidebar.window.get_child()!.get_allocated_height()
        console.log(`Sidebar layout: surface=${layer?.h}, window=${sidebar.window.get_height()}, panel=${panelHeight}, expected=${expected}`)
        if (!layer || layer.h !== expected || panelHeight !== expected) failed = true
      }
      if (polls < 2) throw Error("The test did not span a content refresh")
      if (failed) throw Error("Sidebar shrank below its compositor-allocated height")
      console.log("Live sidebar layout passed: full-height surface and panel retained across initial load and polling refresh.")
    } catch (error) { console.error(error); failed = true }
    finally { sidebar.close(); app.quit(failed ? 1 : 0) }
  })()
} })
