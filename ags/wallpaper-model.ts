export type WallpaperMode = "animated" | "hyprpaper"
export type WallpaperState = { mode: WallpaperMode; busy: boolean; error: string }
export const parseWallpaperMode = (value: string): WallpaperMode => value.trim() === "hyprpaper" ? "hyprpaper" : "animated"
/** Serialize renderer changes; publish and persist only after a successful switch. */
export function createWallpaperModel(initial: WallpaperMode, apply: (mode: WallpaperMode) => Promise<void>, persist: (mode: WallpaperMode) => void, publish: (state: WallpaperState) => void) {
  let state: WallpaperState = { mode: initial, busy: false, error: "" }
  let stopped = false
  async function select(mode: WallpaperMode) {
    if (stopped || state.busy) return
    const previous = state.mode
    state = { ...state, busy: true, error: "" }; publish(state)
    try { await apply(mode); if (stopped) return; persist(mode); state = { mode, busy: false, error: "" } }
    catch (error) {
      if (stopped) return
      let detail = String(error)
      try { await apply(previous) } catch (rollback) { detail += `; restore failed: ${String(rollback)}` }
      state = { mode: previous, busy: false, error: detail }
    }
    if (!stopped) publish(state)
  }
  return { select, toggle: () => select(state.mode === "animated" ? "hyprpaper" : "animated"), stop() { stopped = true } }
}
