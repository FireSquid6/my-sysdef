// Isolated real Gio state-file checks, run only via crop-service-smoke.sh.
import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"
import { createRoot } from "ags"
import { createCropService } from "../services/crops"
import { parseCropState } from "../wallpaper-crops"
if (GLib.getenv("SYSDEF_CROP_TEST") !== "1") throw Error("Use crop-service-smoke.sh with disposable state")
const assert = (ok: unknown, message: string) => { if (!ok) throw Error(message) }
const file = Gio.File.new_for_path(`${GLib.get_user_state_dir()}/sysdef/crops.json`)
const read = () => new TextDecoder().decode(file.load_contents(null)[1])
const write = (text: string) => file.replace_contents(new TextEncoder().encode(text), null, false, Gio.FileCreateFlags.PRIVATE, null)
createRoot(dispose => {
  const services: ReturnType<typeof createCropService>[] = []
  let date = new Date(2026, 3, 1), latitude: number | null = 45
  const service = (enabled = true) => { const s = createCropService(enabled, () => latitude, () => date); services.push(s); return s }
  try {
    const disabled = service(false)
    disabled.start(); disabled.refresh(); disabled.stop()
    assert(!file.query_exists(null), "Disabled service touched crop state")
    const first = service()
    assert(!file.query_exists(null), "Constructing a service wrote crop state")
    first.start(); first.start()
    const seed = parseCropState(read())
    assert(seed.crop === "peas" && seed.growth > 0, "Initial season was not saved")
    const mode = file.query_info("unix::mode", Gio.FileQueryInfoFlags.NONE, null).get_attribute_uint32("unix::mode")
    assert((mode & 0o777) === 0o600, "Save file is not private")
    date = new Date(2026, 3, 15); first.refresh()
    assert(first.sample().growth > seed.growth, "Growth did not advance")
    assert(read().includes(String(seed.updatedAt)), "Refresh wrote before the save interval")
    first.stop()
    assert(parseCropState(read()).growth === first.sample().growth, "Shutdown did not flush growth")
    date = new Date(2026, 4, 28)
    const resumed = service(); resumed.start()
    assert(resumed.sample().growth === 1 && resumed.sample().harvest > 0, "Offline time did not catch up to harvest")
    resumed.stop()
    date = new Date(2026, 5, 1)
    const summer = service(); summer.start()
    assert(summer.sample().crop === "wheat" && summer.sample().growth === 0 && summer.sample().harvest === 0, "Next crop did not reset progress")
    summer.stop()
    // Preserve the saved hemisphere until an actual weather location is known.
    latitude = -35; date = new Date(2026, 9, 15)
    const south = service(); south.start(); south.stop()
    latitude = null
    const unknown = service(); unknown.start(); unknown.refresh()
    assert(unknown.sample().hemisphere === "south" && unknown.sample().crop === "peas", "Offline restart changed the saved hemisphere")
    unknown.stop()
    write('{"version":999,"growth":0.5}')
    const damaged = read(), corrupt = service(); corrupt.start(); corrupt.refresh(); corrupt.stop()
    assert(corrupt.state().error.includes("file preserved") && read() === damaged, "Damaged save was overwritten or not reported")
    file.delete(null)
    const parent = file.get_parent()!; parent.delete(null)
    parent.replace_contents(new TextEncoder().encode("not a directory"), null, false, Gio.FileCreateFlags.PRIVATE, null)
    latitude = -35
    const unwritable = service(); unwritable.start()
    assert(unwritable.state().error.includes("Cannot save") && unwritable.sample().crop === "peas", "Save failure stopped the calendar or was hidden")
    unwritable.stop()
    console.log("Crop service smoke passed: private atomic save, growth, restart/offline catch-up, harvest, next sowing, saved hemisphere, disabled lifecycle, corrupt-file preservation and write-error reporting. Disposable state only; no desktop changes.")
  } finally { services.forEach(s => s.stop()); dispose() }
})
