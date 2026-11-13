// Opt-in host integration: briefly acquire/release an idle-only inhibitor.
// No windows, lid events, locks, suspend requests or persistent state changes.
import GLib from "gi://GLib?version=2.0"
import Gio from "gi://Gio?version=2.0"
import { createRoot } from "ags"
import { createCaffeineService } from "../services/caffeine"

const loop = new GLib.MainLoop(null, false)
const pause = () => new Promise<void>(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => { resolve(); return GLib.SOURCE_REMOVE }))
async function waitFor(check: () => boolean | Promise<boolean>) {
  for (let i = 0; i < 100; i++) { if (await check()) return; await pause() }
  throw Error("Timed out waiting for Caffeine state")
}
function inhibitors(): Promise<Array<[string, string, string, string, number, number]>> {
  return new Promise((resolve, reject) => Gio.DBus.system.call("org.freedesktop.login1", "/org/freedesktop/login1",
    "org.freedesktop.login1.Manager", "ListInhibitors", null, null, Gio.DBusCallFlags.NONE, 3000, null,
    (conn, result) => {
      try { resolve((conn!.call_finish(result).deep_unpack() as [Array<[string, string, string, string, number, number]>])[0]) }
      catch (error) { reject(error) }
    }))
}
let failed = false
createRoot(dispose => {
  const service = createCaffeineService()
  void (async () => {
    try {
      service.start()
      await waitFor(() => service.state().available || !!service.state().error)
      if (!service.state().available || service.state().lidClosed) throw Error(service.state().error || "Open the lid before running this check")
      const own = (rows: Awaited<ReturnType<typeof inhibitors>>) => rows.filter(row => row[1] === "sysdef Caffeine").length
      const before = own(await inhibitors())
      await service.toggle()
      if (!service.state().enabled) throw Error(service.state().error || "Inhibitor was not enabled")
      const rows = await inhibitors()
      if (own(rows) !== before + 1 || rows.some(row => row[1] === "sysdef Caffeine" && (row[0] !== "idle" || row[3] !== "block"))) throw Error("Expected an idle-only block inhibitor")
      await service.toggle()
      await waitFor(async () => own(await inhibitors()) === before)
      await service.toggle()
      if (!service.state().enabled) throw Error("Could not enable for cleanup check")
      service.stop()
      await waitFor(async () => own(await inhibitors()) === before)
      console.log("Caffeine host smoke passed: logind lid state, idle-only acquisition, immediate toggle-off release and shutdown release. No suspend or lid events triggered.")
    } catch (error) { console.error(error); failed = true }
    finally { service.stop(); dispose(); loop.quit() }
  })()
})
loop.run()
if (failed) throw Error("Caffeine host smoke failed")
