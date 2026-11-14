import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"
import { createState } from "ags"
import { advanceCrops, type CropState, parseCropState } from "../wallpaper-crops"

/** One app-owned field and save file, shared by every monitor. No per-frame I/O. */
export function createCropService(enabled = true, latitude: () => number | null = () => null, now = () => new Date()) {
  const dir = `${GLib.get_user_state_dir()}/sysdef`
  const file = Gio.File.new_for_path(`${dir}/crops.json`)
  const [state, setState] = createState({ field: advanceCrops(null, now(), latitude() ?? 45), error: "" })
  let running = false, stopped = false, timer = 0, blocked = false
  let lastAttempt = 0
  function save() {
    if (!running || blocked) return
    lastAttempt = GLib.get_monotonic_time()
    try {
      if (GLib.mkdir_with_parents(dir, 0o700) !== 0) throw Error(`Cannot create ${dir}`)
      file.replace_contents(new TextEncoder().encode(`${JSON.stringify(state().field, null, 2)}\n`), null, false, Gio.FileCreateFlags.PRIVATE, null)
      setState(s => ({ ...s, error: "" }))
    } catch (error) { setState(s => ({ ...s, error: `Cannot save crop growth: ${String(error)}` })) }
  }
  function refresh() {
    if (!running) return
    const previous = state().field
    const field = advanceCrops(previous, now(), latitude() ?? (previous.hemisphere === "south" ? -45 : 45))
    setState(s => ({ ...s, field }))
    if (field.cycle !== previous.cycle || GLib.get_monotonic_time() - lastAttempt >= 300_000_000) save()
  }
  return {
    state, sample: (): CropState => state().field, refresh,
    start() {
      if (!enabled || running || stopped) return
      running = true
      let previous: CropState | null = null
      try {
        if (file.query_exists(null)) {
          if (file.query_info("standard::size", Gio.FileQueryInfoFlags.NONE, null).get_size() > 8192) throw Error("Crop state is too large")
          previous = parseCropState(new TextDecoder().decode(file.load_contents(null)[1]))
        }
      } catch (error) {
        // Keep the damaged/unknown-version file for recovery, never silently
        // overwrite it. Animation can still follow the calendar in memory.
        blocked = true
        setState(s => ({ ...s, error: `Cannot load crop growth (file preserved): ${String(error)}` }))
      }
      setState(s => ({ ...s, field: advanceCrops(previous, now(), latitude() ?? (previous?.hemisphere === "south" ? -45 : 45)) }))
      save()
      timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT_IDLE, 60, () => { refresh(); return GLib.SOURCE_CONTINUE })
    },
    stop() {
      if (running) { refresh(); save() }
      running = false; stopped = true
      if (timer) GLib.source_remove(timer)
      timer = 0
    },
  }
}
