// Real GTK widgets/controllers and measurements; all desktop actions are mocked.
// Windows are hidden again before GTK's rendering turn, so tests don't grab input.
import app from "ags/gtk4/app"
import { Astal, Gdk, Gtk } from "ags/gtk4"
import { createComputed, createState } from "ags"
import GObject from "gi://GObject?version=2.0"
import { createMenus } from "../menus"
import { createSidebar } from "../sidebar"
import { powerArgs } from "../menu-model"
import { Bar, createMonitorName } from "../bar"
import style from "../style.css"
import type { DesktopStatus } from "../services/controller"
import { createCaffeineModel, EMPTY_CAFFEINE } from "../caffeine-model"
import { createLandscapeControls } from "../services/landscape-controls"
import { advanceCrops } from "../wallpaper-crops"
import { resolveEnvironment } from "../wallpaper-weather"

// Reproduce the GDK property ordering on wake without suspending the desktop.
const PendingMonitor = GObject.registerClass({
  Properties: {
    connector: GObject.ParamSpec.string("connector", null, null, GObject.ParamFlags.READWRITE, null),
    model: GObject.ParamSpec.string("model", null, null, GObject.ParamFlags.READWRITE, null),
  },
}, class PendingMonitor extends GObject.Object {
  get connector(): string | null { return this._connector ?? null }
  set connector(value: string | null) { this._connector = value; this.notify("connector") }
  get model(): string | null { return this._model ?? null }
  set model(value: string | null) { this._model = value; this.notify("model") }
  private _connector?: string | null
  private _model?: string | null
})

app.start({ instanceName: "sysdef-ui-smoke", css: style, main() {
  const monitor = app.get_monitors()[0]!
  const [desktop, setDesktop] = createState<DesktopStatus>({ primary: monitor.connector!, primaryAssignment: null,
    monitors: [{ name: monitor.connector! }, { name: "DP-1" }],
    workspaces: [{ name: "S", icon: "", mode: "tiling", monitor: monitor.connector!, assignment: null, active: true, occupied: false }], clients: [] })
  const calls: string[][] = []
  const copied: string[] = []
  const assert = (value: unknown, message: string) => { if (!value) throw Error(message) }
  function widgets(root: Gtk.Widget, css: string): Gtk.Widget[] {
    const result: Gtk.Widget[] = root.has_css_class(css) ? [root] : []
    for (let child = root.get_first_child(); child; child = child.get_next_sibling()) result.push(...widgets(child, css))
    return result
  }
  function keyboard(window: Gtk.Window, name: string) {
    const controllers = window.observe_controllers()
    for (let i = 0; i < controllers.get_n_items(); i++) {
      const item = controllers.get_item(i)
      if (item instanceof Gtk.EventControllerKey && item.get_name() === name) return item
    }
    throw Error(`Missing controller: ${name}`)
  }
  const menus = createMenus({ desktop, root: "/unused", close() {}, showError(error) { throw error },
    run: async argv => { calls.push(argv); return "" },
    controller: async (command, ...args) => { calls.push([command, ...args]); return desktop() } })
  app.add_window(menus.window)
  const [caffeineState, setCaffeine] = createState(EMPTY_CAFFEINE)
  let caffeineReleases = 0
  const caffeineModel = createCaffeineModel(async () => () => { caffeineReleases++ }, setCaffeine)
  caffeineModel.ready(false)
  const caffeine = { state: caffeineState, toggle: caffeineModel.toggle }
  const sidebar = createSidebar({ caffeine, close() {}, showError(error) { throw error }, copy(text) { copied.push(text) }, run: async argv => {
    calls.push(argv)
    if (argv[0] === "bash") {
      assert(JSON.stringify(argv) === JSON.stringify(powerArgs("lock")), "Unexpected sidebar lock command")
      return ""
    }
    assert(argv.includes("tailscale"), "Unexpected sidebar desktop action")
    return JSON.stringify({ BackendState: "Running", Self: { ID: "self", HostName: "local-test", Online: true },
      Peer: { peer: { ID: "peer", HostName: "offline-test", Online: false, TailscaleIPs: ["100.64.0.2"] } } })
  } })
  app.add_window(sidebar.window)
  const liveDate = new Date(2026, 5, 15, 13, 30)
  const landscape = createLandscapeControls(() => ({ date: liveDate, environment: { ...resolveEnvironment(liveDate), weather: "rain", cloud: 0.91, precip: 0.22 }, crops: advanceCrops(null, liveDate), cpu: 0.3 }), false)
  const controlledSidebar = createSidebar({ caffeine, landscape, close() {}, showError(error) { throw error }, run: async argv => {
    assert(argv.includes("tailscale"), "Landscape keyboard controls triggered a desktop action")
    return JSON.stringify({ BackendState: "Running", Peer: {} })
  } })
  controlledSidebar.window.name = "sysdef-controls-test"
  app.add_window(controlledSidebar.window)
  const [systemState, setSystem] = createState({ volume: " 9%", network: "Offline", battery: " 9%", batteryClass: "", batteryDetail: "", error: "" })
  const [items, setItems] = createState<any[]>([])
  const [trayItems] = createState<any[]>([])
  const [empty] = createState("")
  const bar = Bar({ monitor, caffeine, controller: { desktop, error: empty, controller: async () => desktop() } as any,
    system: { state: systemState, update: async () => {} } as any, tray: { items: trayItems, error: empty } as any,
    notifications: { items } as any, open() {}, report(error) { throw error } })
  bar.visible = false
  const describe = () => menus.describe() as any
  const menuKeys = keyboard(menus.window, "sysdef-menu-keys")
  const key = (value: number) => menuKeys.emit("key-pressed", value, 0, 0)
  const open = (name: string) => { menus.open(name); menus.window.visible = false }
  void (async () => {
    try {
      const pending = new PendingMonitor()
      const outputName = createMonitorName(pending as unknown as Gdk.Monitor)
      const recoveredWorkspaces = createComputed(() => desktop().workspaces.filter(w => w.monitor === outputName()))
      const probe = <box><label label={outputName(value => `bar-${value}`)} /><label label={recoveredWorkspaces(ws => String(ws.length))} /></box> as Gtk.Box
      const identity = probe.get_first_child() as Gtk.Label
      const workspaceCount = probe.get_last_child() as Gtk.Label
      assert(identity.label === "bar-output" && workspaceCount.label === "0", "Missing connector must not claim another output's workspaces")
      pending.model = "Test display"
      assert(identity.label === "bar-Test display", "Delayed model did not update the fallback identity")
      pending.connector = monitor.connector
      assert(identity.label === `bar-${monitor.connector}` && workspaceCount.label === "1", "Workspace list did not recover when connector arrived after wake")
      pending.connector = "disconnected-output"
      assert(workspaceCount.label === "0", "Workspace list retained a stale connector")
      pending.connector = monitor.connector
      assert(workspaceCount.label === "1", "Workspace list did not recover after repeated output changes")

      const widths = () => ["volume", "battery", "notifications-chip", "workspace"].map(css => {
        const widget = widgets(bar, css)[0]!
        return widget.measure(Gtk.Orientation.HORIZONTAL, -1).slice(0, 2)
      })
      const before = JSON.stringify(widths())
      setSystem(s => ({ ...s, volume: "󰝟 Muted — extremely long status", battery: "󰂄 100% charging" }))
      setItems(Array.from({ length: 100 }, (_, id) => ({ id })))
      setDesktop(s => ({ ...s, workspaces: s.workspaces.map(w => ({ ...w, name: "9", icon: "󰣆", mode: "floating" })) }))
      assert(JSON.stringify(widths()) === before, "A fixed bar field changed its native width with its contents")
      open("launcher")
      assert(describe().results > 0, "Native application discovery returned no apps")
      const child = menus.window.get_child() as Gtk.Box
      const entry = child.get_first_child()?.get_next_sibling() as Gtk.SearchEntry
      entry.text = "no-application-could-match-this-947126"
      assert(describe().results === 0, "Search did not filter widgets")
      key(Gdk.KEY_Escape)
      assert(!menus.window.visible, "Escape did not close")
      open("monitors")
      assert(describe().results === 3, "Primary choices missing Automatic or an output")
      key(Gdk.KEY_Tab)
      assert(describe().tab === "Workspaces", "Tab did not switch pages")
      key(Gdk.KEY_Right)
      await Promise.resolve()
      assert(calls.some(c => c.join(" ") === "assign 9 " + monitor.connector), "Assignment did not use the shared controller")
      open("power")
      assert(describe().results === 5, "Power menu must include Lock and Log out")
      key(Gdk.KEY_Return)
      await Promise.resolve(); await Promise.resolve()
      assert(calls.some(c => JSON.stringify(c) === JSON.stringify(powerArgs("lock"))), "Lock did not run the shared locker")
      open("power"); key(Gdk.KEY_Down); key(Gdk.KEY_Down); key(Gdk.KEY_Return)
      assert(describe().pending === "logout", "Logout did not request confirmation")
      key(Gdk.KEY_Return)
      assert(!calls.some(c => c[0] === "hyprctl"), "Repeating/held Enter bypassed confirmation")
      menuKeys.emit("key-released", Gdk.KEY_Return, 0, 0)
      key(Gdk.KEY_Escape)
      assert(describe().pending === null, "Escape did not cancel confirmation")
      open("calendar"); assert(describe().name === "calendar", "Calendar construction failed"); menus.close()

      // Promise-only tailnet mocks settle in this microtask turn; close before drawing.
      sidebar.open(monitor)
      try {
        await Promise.resolve()
        const details = () => sidebar.describe() as any
        assert(details().sectioncount === 3 && details().devicecount === 2, "Sidebar omitted a section, self or offline peer")
        assert(sidebar.window.resizable, "Anchored sidebar must accept compositor height allocations")
        assert((sidebar.window.anchor & Astal.WindowAnchor.LEFT) && !(sidebar.window.anchor & Astal.WindowAnchor.RIGHT), "Sidebar is not left-anchored")
        assert((sidebar.window.anchor & Astal.WindowAnchor.TOP) && (sidebar.window.anchor & Astal.WindowAnchor.BOTTOM), "Sidebar does not fill vertical space")
        assert(sidebar.window.marginTop === 20 && sidebar.window.marginBottom === 20 && sidebar.window.marginLeft === 20, "Sidebar gaps differ from Hyprland windows")
        const controller = keyboard(sidebar.window, "sysdef-sidebar-keys")
        const press = (value: number, modifiers = 0) => controller.emit("key-pressed", value, 0, modifiers)
        press(Gdk.KEY_End)
        assert(details().focusindex === 11, "End did not reach the last tailnet device")
        const last = widgets(sidebar.window, "sidebar-row").at(-1)!
        const detail = last.get_first_child()!.get_last_child()!
        assert(!detail.visible, "Device details should start collapsed")
        press(Gdk.KEY_Return)
        assert(detail.visible, "Enter did not expand device information")
        assert(copied.length === 1 && copied[0] === "100.64.0.2", "Enter did not copy the peer IP through the clipboard interface")
        controller.emit("key-released", Gdk.KEY_Return, 0, 0)
        press(Gdk.KEY_h); assert(!detail.visible, "h did not collapse device details")
        press(Gdk.KEY_l); assert(detail.visible, "l did not expand device details")
        assert(copied.length === 1, "h/l unexpectedly changed the clipboard")
        press(Gdk.KEY_g); press(Gdk.KEY_g); assert(details().focusindex === 0, "gg did not reach the first row")
        press(Gdk.KEY_j); assert(details().focusindex === 1, "j did not move down")
        press(Gdk.KEY_k); assert(details().focusindex === 0, "k did not move up")
        press(Gdk.KEY_j, Gdk.ModifierType.CONTROL_MASK); assert(details().focusindex === 0, "Ctrl+j was incorrectly treated as plain j")
        press(Gdk.KEY_G); assert(details().focusindex === 11, "G did not reach the last row")
        press(Gdk.KEY_Home)
        const actions = widgets(sidebar.window, "sidebar-power") as Gtk.Button[]
        assert(actions.length === 5, "Sidebar omitted a session action")
        for (const action of actions) {
          const icon = action.get_child()?.get_first_child() as Gtk.Label
          assert(icon instanceof Gtk.Label && icon.has_css_class("sidebar-power-icon") && /^[\uE000-\uF8FF]$/.test(icon.label), "Session action omitted its Nerd Font glyph")
        }
        assert(details().focusindex === 0, "Home must select the first session row")
        const caffeineButton = widgets(sidebar.window, "sidebar-caffeine")[0] as Gtk.Button
        const caffeineIndicator = widgets(bar, "caffeine")[0] as Gtk.Button
        assert(!caffeineIndicator.get_parent()!.visible, "Caffeine indicator must be hidden while off")
        caffeineButton.emit("clicked")
        await Promise.resolve(); await Promise.resolve()
        assert(caffeineState().enabled && caffeineIndicator.get_parent()!.visible, "Power-menu toggle did not enable the bar indicator")
        caffeineIndicator.emit("clicked")
        assert(!caffeineState().enabled && !caffeineIndicator.get_parent()!.visible && caffeineReleases === 1, "Bar toggle did not release the inhibitor")
        caffeineButton.emit("clicked")
        await Promise.resolve(); await Promise.resolve()
        caffeineModel.ready(true)
        assert(caffeineState().enabled && caffeineButton.sensitive && caffeineReleases === 1, "Lid closure must preserve Caffeine and its inhibitor")
        caffeineModel.ready(false)
        assert(caffeineState().enabled && caffeineButton.sensitive, "Opening the lid must preserve Caffeine")
        caffeineIndicator.emit("clicked")
        assert(!caffeineState().enabled && caffeineReleases === 2, "Toggle-off after reopening must release the inhibitor")
        const closeButton = sidebar.window.get_child()?.get_first_child()?.get_last_child() as Gtk.Button
        assert(closeButton.label === "✕" && !closeButton.focusable, "Close button must remain mouse-only")
        const labels = (root: Gtk.Widget): string[] => {
          const values = root instanceof Gtk.Label ? [root.label] : []
          for (let child = root.get_first_child(); child; child = child.get_next_sibling()) values.push(...labels(child))
          return values
        }
        assert(!labels(sidebar.window).some(text => text.includes("Enter / Space")), "Tailscale shortcut hint is still visible")
        press(Gdk.KEY_j); press(Gdk.KEY_j)
        const logout = actions[2]!
        assert((logout.get_child()?.get_last_child() as Gtk.Label).label === "Log out", "Sidebar omitted Log out")
        press(Gdk.KEY_Return); press(Gdk.KEY_Return)
        assert(widgets(sidebar.window, "menu-confirm")[0]?.visible, "Sidebar power action skipped confirmation")
        assert(!calls.some(c => c[0] === "hyprctl" || c[0] === "systemctl"), "Sidebar executed a desktop action")
        controller.emit("key-released", Gdk.KEY_Return, 0, 0)
        press(Gdk.KEY_Escape)
        assert(!sidebar.window.visible && sidebar.window.keymode === Astal.Keymode.NONE, "Sidebar Escape did not release keyboard focus")
        sidebar.open(monitor); press(Gdk.KEY_q)
        assert(!sidebar.window.visible && sidebar.window.keymode === Astal.Keymode.NONE, "q did not close and release keyboard focus")
        sidebar.open(monitor)
        const lock = widgets(sidebar.window, "sidebar-power")[0] as Gtk.Button
        assert((lock.get_child()?.get_last_child() as Gtk.Label).label === "Lock", "Sidebar omitted Lock")
        const locksBefore = calls.filter(c => c[0] === "bash").length
        press(Gdk.KEY_Home); press(Gdk.KEY_Return)
        await Promise.resolve(); await Promise.resolve()
        assert(calls.filter(c => c[0] === "bash").length === locksBefore + 1, "Sidebar Lock did not run exactly once")
        assert(!sidebar.window.visible, "Sidebar did not close after locking")
      } finally { sidebar.close() }
      controlledSidebar.open(monitor)
      try {
        await Promise.resolve()
        const sync = widgets(controlledSidebar.window, "landscape-sync")[0] as Gtk.Switch
        const sliders = widgets(controlledSidebar.window, "landscape-slider") as Gtk.Scale[]
        assert((controlledSidebar.describe() as any).sectioncount === 4 && sliders.length === 11, "Landscape controls missing from bottom section")
        assert(widgets(controlledSidebar.window, "sidebar-section").at(-1)!.has_css_class("landscape-controls"), "Landscape section is not at the bottom")
        assert(sync.active && sliders.every(s => !s.is_sensitive()), "Live mode must disable manual sliders")
        const keys = keyboard(controlledSidebar.window, "sysdef-sidebar-keys")
        keys.emit("key-pressed", Gdk.KEY_End, 0, 0)
        assert(controlledSidebar.window.get_focus() === sync, "End did not reach the bottom sync toggle in live mode")
        sync.active = false
        assert(!landscape.state().settings.sync && sliders.every(s => s.is_sensitive()), "Sync toggle did not enable manual sliders")
        assert(landscape.state().settings.manual.hour === 13.5, "Disabling sync did not seed the real clock")
        assert(landscape.state().settings.manual.cloud === 0.91 && landscape.state().settings.manual.precip === 0.22, "GTK binding echoes replaced the live weather snapshot with presets")
        const hour = widgets(controlledSidebar.window, "landscape-hour")[0] as Gtk.Scale
        hour.set_value(22.5)
        assert(landscape.state().settings.manual.hour === 22.5, "Native slider did not update manual settings")
        landscape.set("growth", 0.8)
        const growth = widgets(controlledSidebar.window, "landscape-growth")[0] as Gtk.Scale
        assert(growth.get_value() === 0.8, "Settings did not update native slider value")
        const firstPower = widgets(controlledSidebar.window, "sidebar-power")[0]!
        firstPower.grab_focus()
        keys.emit("key-pressed", Gdk.KEY_End, 0, 0)
        assert(controlledSidebar.window.get_focus()?.has_css_class("landscape-cpu"), "End did not reach the last slider in manual mode")
        hour.grab_focus()
        for (const value of [Gdk.KEY_Left, Gdk.KEY_Right, Gdk.KEY_Home, Gdk.KEY_End, Gdk.KEY_Return, Gdk.KEY_space]) {
          assert(!keys.emit("key-pressed", value, 0, 0), "Sidebar intercepted native slider keys")
        }
        const previous = hour.get_value()
        hour.emit("move-slider", Gtk.ScrollType.STEP_FORWARD)
        assert(hour.get_value() > previous && landscape.state().settings.manual.hour === hour.get_value(), "Native keyboard slider action did not adjust the value")
        sync.active = true
        assert(landscape.state().settings.sync && sliders.every(s => !s.is_sensitive()), "Re-enabling sync did not restore live mode")
        keys.emit("key-pressed", Gdk.KEY_Escape, 0, 0)
        assert(!controlledSidebar.window.visible, "Escape from landscape controls did not close the sidebar")
      } finally { controlledSidebar.close(); landscape.stop() }
      console.log("GTK UI smoke passed: landscape sync/sliders/native keyboard safety, Caffeine sidebar/bar toggles and lid-close persistence, delayed monitor identity/workspace recovery, native constant widths, menu/search/keyboard, controller routing, power repeat safety, sidebar sections/offline devices/navigation/details and Escape. No desktop actions executed.")
      app.quit(0)
    } catch (error) { console.error(error); menus.close(); sidebar.close(); controlledSidebar.close(); landscape.stop(); app.quit(1) }
  })()
} })
