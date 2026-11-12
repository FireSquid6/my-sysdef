// Real GTK widgets/controllers and measurements; all desktop actions are mocked.
// Windows are hidden again before GTK's rendering turn, so tests don't grab input.
import app from "ags/gtk4/app"
import { Astal, Gdk, Gtk } from "ags/gtk4"
import { createState } from "ags"
import { createMenus } from "../menus"
import { createSidebar } from "../sidebar"
import { powerArgs } from "../menu-model"
import { Bar } from "../bar"
import style from "../style.css"
import type { DesktopStatus } from "../services/controller"

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
  const sidebar = createSidebar({ close() {}, showError(error) { throw error }, copy(text) { copied.push(text) }, run: async argv => {
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
  const [systemState, setSystem] = createState({ volume: " 9%", network: "Offline", battery: " 9%", batteryClass: "", batteryDetail: "", error: "" })
  const [items, setItems] = createState<any[]>([])
  const [trayItems] = createState<any[]>([])
  const [empty] = createState("")
  const bar = Bar({ monitor, controller: { desktop, error: empty, controller: async () => desktop() } as any,
    system: { state: systemState, update: async () => {} } as any, tray: { items: trayItems, error: empty } as any,
    notifications: { items } as any, open() {}, report(error) { throw error } })
  bar.visible = false
  const describe = () => menus.describe() as any
  const menuKeys = keyboard(menus.window, "sysdef-menu-keys")
  const key = (value: number) => menuKeys.emit("key-pressed", value, 0, 0)
  const open = (name: string) => { menus.open(name); menus.window.visible = false }
  void (async () => {
    try {
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
        press(Gdk.KEY_Home); press(Gdk.KEY_j); press(Gdk.KEY_j); press(Gdk.KEY_j)
        const logout = widgets(sidebar.window, "sidebar-power")[2] as Gtk.Button
        assert(logout.label === "Log out", "Sidebar omitted Log out")
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
        assert(lock.label === "Lock", "Sidebar omitted Lock")
        const locksBefore = calls.filter(c => c[0] === "bash").length
        lock.emit("clicked")
        await Promise.resolve(); await Promise.resolve()
        assert(calls.filter(c => c[0] === "bash").length === locksBefore + 1, "Sidebar Lock did not run exactly once")
        assert(!sidebar.window.visible, "Sidebar did not close after locking")
      } finally { sidebar.close() }
      console.log("GTK UI smoke passed: native constant widths, menu/search/keyboard, controller routing, power repeat safety, sidebar sections/offline devices/navigation/details and Escape. No desktop actions executed.")
      app.quit(0)
    } catch (error) { console.error(error); menus.close(); sidebar.close(); app.quit(1) }
  })()
} })
