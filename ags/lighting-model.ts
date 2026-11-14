/** Optional local-controller protocol; no hardware definitions belong in the shell. */
export type LightingMode = "tokyonight" | "ghost" | "unknown"
export type LightingState = { mode: LightingMode; complete: boolean; busy: boolean; error: string }
export const EMPTY_LIGHTING: LightingState = { mode: "unknown", complete: false, busy: false, error: "" }

export function parseLightingStatus(output: string): Pick<LightingState, "mode" | "complete" | "error"> {
  const value = JSON.parse(output)
  if (!value || !["tokyonight", "ghost", "unknown"].includes(value.mode) || typeof value.complete !== "boolean"
    || (value.error !== null && typeof value.error !== "string") || (value.mode === "unknown" && value.complete)) {
    throw Error("Invalid local lighting status")
  }
  return { mode: value.mode, complete: value.complete, error: value.error ?? "" }
}

export function lightingLabel(state: LightingState) {
  if (state.busy) return "Lighting: Working…"
  const mode = state.mode === "tokyonight" ? "Tokyo Night" : state.mode === "ghost" ? "Ghost" : "Unknown"
  return `Lighting: ${mode}${state.mode !== "unknown" && !state.complete ? " (partial)" : ""}`
}

export function createLightingModel(backend: { status: () => Promise<string>; toggle: () => Promise<unknown> }, changed: (state: LightingState) => void) {
  let state = { ...EMPTY_LIGHTING }, stopped = false
  function update(next: Partial<LightingState>) {
    if (stopped) return
    state = { ...state, ...next }
    changed(state)
  }
  async function refresh() {
    if (stopped || state.busy) return
    update({ busy: true })
    try { update(parseLightingStatus(await backend.status())) }
    catch (error) { update({ mode: "unknown", complete: false, error: String(error) }) }
    finally { update({ busy: false }) }
  }
  async function toggle() {
    if (stopped || state.busy) return
    update({ busy: true, error: "" })
    try {
      await backend.toggle()
      if (!stopped) update(parseLightingStatus(await backend.status()))
    } catch (error) {
      // A failed application may have changed only some devices. Re-read the
      // controller's authoritative status, never keep a stale success label.
      if (!stopped) {
        try { update(parseLightingStatus(await backend.status())) }
        catch { update({ mode: "unknown", complete: false }) }
        update({ error: String(error) })
      }
    } finally { update({ busy: false }) }
  }
  return { refresh, toggle, stop() { stopped = true } }
}
