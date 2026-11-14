import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"
import { createState } from "ags"
import { DEFAULT_LANDSCAPE, parseLandscapeSettings, seedManual, setManual, type SliderKey } from "../landscape-controls-model"
import type { LandscapeEnvironment } from "../wallpaper-weather"
import type { CropState } from "../wallpaper-crops"
type Snapshot = { date: Date; environment: LandscapeEnvironment; crops: CropState; cpu: number }

export function createLandscapeControls(snapshot: () => Snapshot, enabled = true) {
  const [state, setState] = createState({ settings: { ...DEFAULT_LANDSCAPE, manual: { ...DEFAULT_LANDSCAPE.manual } }, error: "" })
  const dir = `${GLib.get_user_state_dir()}/sysdef`, file = Gio.File.new_for_path(`${dir}/landscape-controls.json`)
  let running = false, stopped = false, blocked = false, dirty = false, timer = 0
  function flush() {
    if (timer) { GLib.source_remove(timer); timer = 0 }
    if (!enabled || !running || blocked || !dirty) return
    try {
      if (GLib.mkdir_with_parents(dir, 0o700) !== 0) throw Error(`Cannot create ${dir}`)
      file.replace_contents(new TextEncoder().encode(`${JSON.stringify(state().settings, null, 2)}\n`), null, false, Gio.FileCreateFlags.PRIVATE, null)
      dirty = false; setState(s => ({ ...s, error: "" }))
    } catch (error) { setState(s => ({ ...s, error: `Cannot save landscape controls: ${String(error)}` })) }
  }
  function changed(settings: typeof DEFAULT_LANDSCAPE) {
    if (stopped || settings === state().settings) return
    setState(s => ({ ...s, settings })); dirty = true
    if (enabled && running) {
      if (timer) GLib.source_remove(timer)
      timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => { timer = 0; flush(); return GLib.SOURCE_REMOVE })
    }
  }
  return {
    state,
    toggleSync() {
      if (stopped) return
      const previous = state().settings
      if (!previous.sync) { changed({ ...previous, sync: true }); return }
      const live = snapshot()
      changed({ version: 1, sync: false, manual: seedManual(live.date, live.environment, live.crops, live.cpu) })
    },
    set: (key: SliderKey, value: number) => changed(setManual(state().settings, key, value)),
    start() {
      if (!enabled || running || stopped) return
      running = true
      try {
        if (file.query_exists(null)) {
          if (file.query_info("standard::size", Gio.FileQueryInfoFlags.NONE, null).get_size() > 8192) throw Error("Controls file is too large")
          const settings = parseLandscapeSettings(new TextDecoder().decode(file.load_contents(null)[1]))
          setState(s => ({ ...s, settings }))
        }
      } catch (error) { blocked = true; setState(s => ({ ...s, error: `Cannot load landscape controls (file preserved): ${String(error)}` })) }
    },
    stop() { flush(); running = false; stopped = true },
  }
}
export type LandscapeControlsService = ReturnType<typeof createLandscapeControls>
