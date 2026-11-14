import app from "ags/gtk4/app"
import { Astal, Gdk, Gtk } from "ags/gtk4"
import { createBinding, createComputed, createState, For, This, onCleanup } from "ags"
import GLib from "gi://GLib?version=2.0"
import Gio from "gi://Gio?version=2.0"
import style from "./style.css"
import { Bar } from "./bar"
import { createMenus } from "./menus"
import { createSidebar } from "./sidebar"
import { createController, run } from "./services/controller"
import { createSystemService } from "./services/system"
import { createCaffeineService } from "./services/caffeine"
import { createNotificationService } from "./services/notifications"
import { createTrayService } from "./services/tray"
import { NotificationList, NotificationPopups } from "./indicators"
import { createWallpaperService } from "./services/wallpaper"
import { createWallpaperResources } from "./services/wallpaper-resources"
import { createWeatherService } from "./services/weather"
import { resolveEnvironment } from "./wallpaper-weather"
import { createCropService } from "./services/crops"
import { createLandscapeControls } from "./services/landscape-controls"
import { createWallpaperRenderer } from "./services/wallpaper-renderer"

const root = GLib.getenv("SYSDEF_ROOT_DIR") || `${GLib.get_home_dir()}/sysdef`
const instance = GLib.getenv("SYSDEF_AGS_INSTANCE") || "sysdef"
let dispatch: (argv: string[]) => unknown = () => { throw Error("Desktop shell is starting") }

app.start({
  instanceName: instance,
  css: style,
  requestHandler(argv, respond) {
    try { respond(JSON.stringify({ ok: true, value: dispatch(argv) })) }
    catch (error) { respond(JSON.stringify({ ok: false, error: String(error) })) }
  },
  main() {
    const [error, setError] = createState("")
    const report = (cause: unknown) => { console.error(String(cause)); setError(String(cause)) }
    const controller = createController(root, report)
    const system = createSystemService()
    const caffeine = createCaffeineService()
    const wallpaper = createWallpaperService(GLib.getenv("SYSDEF_AGS_SERVICES") !== "0")
    const wallpaperResources = createWallpaperResources()
    const weather = createWeatherService(GLib.getenv("SYSDEF_AGS_SERVICES") !== "0")
    const crops = createCropService(GLib.getenv("SYSDEF_AGS_SERVICES") !== "0", () => weather.state().observation?.latitude ?? null)
    const landscape = createLandscapeControls(() => {
      const date = new Date()
      return { date, environment: resolveEnvironment(date, weather.state().observation), crops: crops.sample(), cpu: wallpaperResources.sample().cpu }
    }, GLib.getenv("SYSDEF_AGS_SERVICES") !== "0")
    const renderer = createWallpaperRenderer(root, () => ({ version: 1, animated: wallpaper.animated(), resources: wallpaperResources.sample(), weather: weather.state().observation, crops: crops.sample(), controls: landscape.state().settings }), GLib.getenv("SYSDEF_AGS_SERVICES") !== "0")
    const notifications = createNotificationService()
    const tray = createTrayService()
    const monitors = createBinding(app, "monitors")
    let active = ""
    const focusedMonitor = () => {
      const status = controller.desktop()
      const focused = status.monitors.find(m => m.focused)?.name ?? status.primary
      return app.get_monitors().find(m => m.connector === focused) ?? app.get_monitors()[0]
    }
    const menus = createMenus({ run, controller: controller.controller, desktop: controller.desktop, root,
      close() { active = "" }, showError: report })
    app.add_window(menus.window)
    const sidebar = createSidebar({ run, caffeine, landscape, wallpaper: GLib.getenv("SYSDEF_AGS_SERVICES") !== "0" ? wallpaper : undefined, close() { active = "" }, showError: report })
    app.add_window(sidebar.window)
    const history = <window name="sysdef-history" application={app} namespace="sysdef-menu" visible={false}
      layer={Astal.Layer.OVERLAY} keymode={Astal.Keymode.NONE} class="sysdef-menu" resizable={false}
      onNotifyVisible={(self: Astal.Window) => { if (!self.visible) self.keymode = Astal.Keymode.NONE }}>
      <Gtk.EventControllerKey propagationPhase={Gtk.PropagationPhase.CAPTURE} onKeyPressed={(_self, keyval) => {
        if (keyval === Gdk.KEY_Escape) { close(); return true } return false
      }} />
      <box orientation={Gtk.Orientation.VERTICAL} spacing={12} class="menu-panel">
        <box><label label="Notifications" class="menu-title" hexpand xalign={0} /><button label="✕" onClicked={() => close()} /></box>
        <NotificationList service={notifications} />
        <label label={error} visible={error(e => !!e)} class="danger" wrap maxWidthChars={48} />
      </box>
    </window> as Astal.Window
    function close() { menus.close(); sidebar.close(); history.visible = false; history.keymode = Astal.Keymode.NONE; active = "" }
    function open(name: string, monitor = focusedMonitor()) {
      if (name === "power") name = "sidebar" // Compatibility for old external shortcuts.
      if (!["launcher", "projects", "sidebar", "monitors", "windows", "calendar", "network", "notifications"].includes(name)) throw Error(`Unknown menu: ${name}`)
      if (active === name && (menus.window.visible || history.visible || sidebar.window.visible)) { close(); return }
      close(); active = name
      if (name === "sidebar") sidebar.open(monitor)
      else if (name === "notifications") {
        if (monitor) history.gdkmonitor = monitor
        history.keymode = Astal.Keymode.EXCLUSIVE; history.visible = true
        history.get_child()?.child_focus(Gtk.DirectionType.TAB_FORWARD)
      } else menus.open(name, monitor)
    }
    const bars = <For each={monitors}>{monitor => <This this={app}>
      <Bar monitor={monitor} controller={controller} system={system} caffeine={caffeine} tray={tray} notifications={notifications} open={open} report={report} />
    </This>}</For>
    const popupMonitors = createComputed(() => {
      const all = monitors()
      return all.filter(m => m.connector === controller.desktop().primary).slice(0, 1)
    })
    const popups = <For each={popupMonitors}>{monitor => <This this={app}><NotificationPopups service={notifications} monitor={monitor} /></This>}</For>
    void bars; void popups
    wallpaperResources.start()
    weather.start()
    crops.start()
    landscape.start()
    renderer.start()
    if (GLib.getenv("SYSDEF_AGS_SERVICES") !== "0") void wallpaper.start()
    void controller.start()
    system.start()
    caffeine.start()
    // Disposable test instances must not compete for desktop-wide D-Bus names.
    if (GLib.getenv("SYSDEF_AGS_SERVICES") !== "0") { notifications.start(); tray.start() }
    const cssWatcher = Gio.File.new_for_path(`${root}/ags`).monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, null)
    cssWatcher.connect("changed", (_watcher, file, other) => {
      if (file.get_basename() === "style.css" || other?.get_basename() === "style.css") {
        try { app.apply_css(`${root}/ags/style.css`, true) } catch (e) { report(e) }
      }
    })
    onCleanup(() => { controller.stop(); system.stop(); caffeine.stop(); wallpaper.stop(); wallpaperResources.stop(); weather.stop(); crops.stop(); landscape.stop(); renderer.stop(); notifications.stop(); tray.stop(); cssWatcher.cancel(); menus.window.destroy(); history.destroy() })
    dispatch = ([command, name]) => {
      if (command === "ping") return "pong"
      if (command === "status") return { instance, menu: active, menus: menus.describe(), sidebar: sidebar.describe(), windows: app.windows.map(w => ({ name: w.name, visible: w.visible })),
        primary: controller.desktop().primary, workspaces: controller.desktop().workspaces.length,
        wallpaper: wallpaper.state(), wallpaperRenderer: renderer.state(), crops: crops.state(), landscape: landscape.state(), weather: { ...weather.state(), environment: resolveEnvironment(new Date(), weather.state().observation) }, caffeine: caffeine.state(), notifications: notifications.items().length, notificationError: notifications.error(), tray: tray.items().length, trayError: tray.error(), error: error() }
      if (command === "toggle" || command === "show") {
        if (command === "show" && active === (name === "power" ? "sidebar" : name)) close()
        open(name)
        return { menu: active, detail: active === "sidebar" ? sidebar.describe() : menus.describe() }
      }
      if (command === "close") { close(); return "closed" }
      if (command === "reload-css") { app.apply_css(`${root}/ags/style.css`, true); return "reloaded" }
      throw Error(`Unknown shell command: ${command}`)
    }
  },
})
