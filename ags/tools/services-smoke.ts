// Run ONLY under dbus-run-session: this deliberately owns the two shell names.
import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"
import { createRoot } from "ags"
import { createNotificationService } from "../services/notifications"
import { createTrayService } from "../services/tray"
if (GLib.getenv("SYSDEF_AGS_TEST_BUS") !== "1" || GLib.getenv("GTK_A11Y") !== "none" || GLib.getenv("GIO_USE_VFS") !== "local")
  throw Error("Run bash ags/check.sh services so test D-Bus, accessibility and VFS resources are isolated")
const loop = new GLib.MainLoop(null, false)
let exitCode = 0
const call = (bus: string, path: string, iface: string, method: string, args: GLib.Variant | null) => new Promise<any>((resolve, reject) => {
  Gio.DBus.session.call(bus, path, iface, method, args, null, Gio.DBusCallFlags.NO_AUTO_START, 3000, null, (conn, result) => {
    try { resolve(conn!.call_finish(result).deep_unpack()) } catch (error) { reject(error) }
  })
})
const pause = () => new Promise<void>(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 25, () => { resolve(); return GLib.SOURCE_REMOVE }))
const wait = async (test: () => boolean | Promise<boolean>) => {
  for (let i = 0; i < 100; i++) { if (await test()) return; await pause() }
  throw Error("Timed out waiting for the test service")
}
const assert = (value: unknown, message: string) => { if (!value) throw Error(message) }
createRoot(dispose => {
  const finish = (code: number) => { exitCode = code; dispose(); loop.quit() }
  const notifications = createNotificationService()
  const tray = createTrayService()
  notifications.start(); tray.start()
  void (async () => {
    let item: Gio.DBusExportedObject | undefined
    try {
      for (const name of ["org.freedesktop.Notifications", "org.kde.StatusNotifierWatcher"]) await wait(async () =>
        Boolean((await call("org.freedesktop.DBus", "/org/freedesktop/DBus", "org.freedesktop.DBus", "NameHasOwner", new GLib.Variant("(s)", [name])))[0]))
      const notify = (replaces: number) => call("org.freedesktop.Notifications", "/org/freedesktop/Notifications", "org.freedesktop.Notifications", "Notify",
        new GLib.Variant("(susssasa{sv}i)", ["Smoke", replaces, "", "<b>Safe title</b>", "Body", ["open", "Open"], {}, 0]))
      const [id] = await notify(0)
      assert(typeof id === "number" && notifications.items()[0]?.summary === "Safe title", "Notify wire signature or rendering failed")
      assert((await notify(id))[0] === id && notifications.items().length === 1, "Replacement failed on the bus")
      await call("org.freedesktop.Notifications", "/org/freedesktop/Notifications", "org.freedesktop.Notifications", "CloseNotification", new GLib.Variant("(u)", [id]))
      assert(!notifications.items()[0].active, "CloseNotification did not update state")
      const [capabilities] = await call("org.freedesktop.Notifications", "/org/freedesktop/Notifications", "org.freedesktop.Notifications", "GetCapabilities", null)
      assert(capabilities.includes("actions"), "Capabilities wire format incorrect")
      let activated = false
      item = Gio.DBusExportedObject.wrapJSObject(`<node><interface name="org.kde.StatusNotifierItem">
        <property name="Id" type="s" access="read"/><property name="Title" type="s" access="read"/>
        <property name="IconName" type="s" access="read"/><property name="Status" type="s" access="read"/><property name="IconPixmap" type="a(iiay)" access="read"/>
        <property name="Menu" type="o" access="read"/>
        <method name="Activate"><arg direction="in" type="i"/><arg direction="in" type="i"/></method>
        </interface></node>`, { Id: "smoke", Title: "Smoke tray", IconName: "application-x-executable", IconPixmap: [[1, 1, new Uint8Array([255, 255, 0, 0])]], Status: "Active", Menu: "/", Activate() { activated = true } })
      item.export(Gio.DBus.session, "/SysdefSmokeItem")
      await call("org.kde.StatusNotifierWatcher", "/StatusNotifierWatcher", "org.kde.StatusNotifierWatcher", "RegisterStatusNotifierItem", new GLib.Variant("(s)", ["/SysdefSmokeItem"]))
      await wait(() => tray.items().length === 1)
      assert(tray.items()[0].title === "Smoke tray", "Tray properties failed")
      assert(tray.items()[0].paintable, "Tray pixmap texture conversion failed")
      tray.items()[0].activate()
      await wait(() => activated)
      assert(!notifications.error() && !tray.error(), "Service reported a runtime error")
      console.log("Isolated D-Bus smoke: notification wire protocol/replacement/close/capabilities and tray registration/properties/activation passed.")
      item.unexport(); notifications.stop(); tray.stop(); finish(0)
    } catch (error) { console.error(error); item?.unexport(); notifications.stop(); tray.stop(); finish(1) }
  })()
})
loop.run()
if (exitCode) throw Error("Isolated service smoke failed")
