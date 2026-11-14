// Real GTK controls, entirely mocked lighting/desktop actions. No hardware writes.
import app from "ags/gtk4/app"
import { Gtk } from "ags/gtk4"
import { createState } from "ags"
import { createSidebar } from "../sidebar"
import { createLightingModel, EMPTY_LIGHTING } from "../lighting-model"
import { createLightingService } from "../services/lighting"
import { EMPTY_CAFFEINE } from "../caffeine-model"
import style from "../style.css"

function find(root: Gtk.Widget, css: string): Gtk.Widget[] {
  const found = root.has_css_class(css) ? [root] : []
  for (let child = root.get_first_child(); child; child = child.get_next_sibling()) found.push(...find(child, css))
  return found
}
const assert = (value: unknown, message: string) => { if (!value) throw Error(message) }
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }
app.start({ instanceName: "sysdef-lighting-smoke", css: style, main() {
  const [caffeine] = createState(EMPTY_CAFFEINE)
  const [state, setState] = createState({ ...EMPTY_LIGHTING })
  let mode = "tokyonight", writes = 0, fail = false
  let release: (() => void) | undefined
  const model = createLightingModel({
    status: async () => JSON.stringify({ mode, complete: mode !== "unknown", error: null }),
    toggle: async () => {
      writes++
      await new Promise<void>(resolve => { release = resolve })
      if (fail) { mode = "unknown"; throw Error("Mock device unavailable") }
      mode = mode === "ghost" ? "tokyonight" : "ghost"
    },
  }, setState)
  const dependencies = { caffeine: { state: caffeine, toggle: async () => {} }, close() {}, showError() {},
    run: async (argv: string[]) => {
      assert(argv.includes("tailscale"), "Unexpected desktop command")
      return '{"BackendState":"Running","Peer":{}}'
    } }
  const absent = createSidebar(dependencies)
  absent.window.name = "sysdef-lighting-absent"
  app.add_window(absent.window)
  const configured = createSidebar({ ...dependencies, lighting: { state, ...model } })
  configured.window.name = "sysdef-lighting-configured"
  app.add_window(configured.window)
  void (async () => {
    let failed = false
    try {
      assert(createLightingService(false) === undefined, "Disabled test instance enabled local lighting")
      assert(find(absent.window, "sidebar-lighting").length === 0, "Unconfigured machines show a lighting row")
      configured.open(app.get_monitors()[0])
      configured.window.visible = false // Hide before GTK draws or grabs keyboard input.
      await settle()
      const button = find(configured.window, "sidebar-lighting")[0] as Gtk.Button
      const label = button.get_child()!.get_last_child() as Gtk.Label
      assert(label.label === "Lighting: Tokyo Night", "Opening did not refresh the current preset")
      assert(writes === 0, "Opening the panel applied lighting")
      button.emit("clicked")
      assert(!button.sensitive && label.label === "Lighting: Working…", "Busy state not shown/disabled")
      button.emit("clicked")
      assert(writes === 1, "Repeated activation overlapped hardware commands")
      release!(); await settle()
      assert(button.sensitive && label.label === "Lighting: Ghost", "Completed toggle did not update the row")
      fail = true
      button.emit("clicked"); release!(); await settle()
      assert(label.label === "Lighting: Unknown", "Failure preserved stale successful mode")
      assert(find(configured.window, "danger").some(w => w instanceof Gtk.Label && w.visible && w.label.includes("Mock device unavailable")), "Lighting error is hidden")
      console.log("Lighting GTK smoke passed: optional row, refresh-only open, busy guard, labels, and visible failures.")
    } catch (error) { console.error(error); failed = true }
    finally { model.stop(); configured.close(); absent.close(); app.quit(failed ? 1 : 0) }
  })()
} })
