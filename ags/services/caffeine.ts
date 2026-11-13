import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"
import { createState } from "ags"
import { createCaffeineModel, EMPTY_CAFFEINE } from "../caffeine-model"

const BUS = "org.freedesktop.login1"
const PATH = "/org/freedesktop/login1"
const IFACE = "org.freedesktop.login1.Manager"

export function createCaffeineService() {
  const [state, setState] = createState(EMPTY_CAFFEINE)
  const cancellation = new Gio.Cancellable()
  let proxy: Gio.DBusProxy | null = null
  let signals: number[] = []
  let started = false, stopped = false
  const model = createCaffeineModel(() => new Promise<() => void>((resolve, reject) => {
    const connection = proxy?.get_connection()
    const owner = proxy?.get_name_owner()
    if (!connection || !owner) { reject(Error("logind is unavailable")); return }
    // Inhibit idle actions and logind's lid handling, including the suspend
    // that would trigger hypridle's before-sleep lock. Manual suspend still works.
    connection.call_with_unix_fd_list(owner, PATH, IFACE, "Inhibit",
      new GLib.Variant("(ssss)", ["idle:handle-lid-switch", "sysdef Caffeine", "Keep the desktop awake, including with the lid closed", "block"]),
      new GLib.VariantType("(h)"), Gio.DBusCallFlags.NONE, 5000, null, cancellation,
      (conn, result) => {
        let descriptors: number[] = []
        try {
          const [reply, list] = conn!.call_with_unix_fd_list_finish(result)
          // Steal rather than get(): the FD list otherwise retains another copy
          // until GC, delaying the release after toggling off or shutting down.
          descriptors = list?.steal_fds() ?? []
          const [index] = reply.deep_unpack() as [number]
          if (!Number.isInteger(index) || index < 0 || index >= descriptors.length) throw Error("logind returned no inhibitor handle")
          const fd = descriptors[index]!
          descriptors.forEach((other, i) => { if (i !== index) GLib.close(other) })
          descriptors = []
          let closed = false
          resolve(() => { if (!closed) { closed = true; GLib.close(fd) } })
        } catch (error) { descriptors.forEach(fd => GLib.close(fd)); reject(error) }
      })
  }), setState)
  function refresh() {
    if (!proxy?.get_name_owner()) { model.unavailable("Caffeine unavailable: logind is not running"); return }
    const lid = proxy.get_cached_property("LidClosed")
    if (!lid || !lid.is_of_type(new GLib.VariantType("b"))) { model.unavailable("Caffeine unavailable: cannot read lid state"); return }
    model.ready(lid.deep_unpack() as boolean)
  }
  return {
    state,
    toggle: model.toggle,
    start() {
      if (started || stopped) return
      started = true
      Gio.DBusProxy.new_for_bus(Gio.BusType.SYSTEM, Gio.DBusProxyFlags.GET_INVALIDATED_PROPERTIES, null, BUS, PATH, IFACE, cancellation,
        (_source, result) => {
          try {
            const next = Gio.DBusProxy.new_for_bus_finish(result)
            if (stopped) return
            proxy = next
            signals = [proxy.connect("g-properties-changed", refresh), proxy.connect("notify::g-name-owner", () => {
              model.unavailable("Caffeine unavailable: logind connection changed")
              refresh()
            })]
            refresh()
          } catch (error) { if (!stopped) model.unavailable(`Caffeine unavailable: ${String(error)}`) }
        })
    },
    stop() {
      stopped = true
      model.stop(); cancellation.cancel()
      signals.forEach(id => proxy?.disconnect(id)); signals = []; proxy = null
    },
  }
}
export type CaffeineService = ReturnType<typeof createCaffeineService>
