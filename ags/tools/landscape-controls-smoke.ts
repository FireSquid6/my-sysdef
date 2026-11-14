// Real Gio preference checks in disposable XDG state; no windows or network.
import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"
import { createRoot } from "ags"
import { createLandscapeControls } from "../services/landscape-controls"
import { advanceCrops } from "../wallpaper-crops"
import { resolveEnvironment } from "../wallpaper-weather"
import { parseLandscapeSettings } from "../landscape-controls-model"
if (GLib.getenv("SYSDEF_LANDSCAPE_TEST") !== "1") throw Error("Use landscape-controls-smoke.sh")
const assert = (value: unknown, message: string) => { if (!value) throw Error(message) }
const dir = `${GLib.get_user_state_dir()}/sysdef`, file = Gio.File.new_for_path(`${dir}/landscape-controls.json`)
const read = (f = file) => new TextDecoder().decode(f.load_contents(null)[1])
const date = new Date(2026, 5, 15, 13, 30), farm = advanceCrops(null, date)
createRoot(dispose => {
  const services: ReturnType<typeof createLandscapeControls>[] = []
  const create = (enabled = true) => {
    const service = createLandscapeControls(() => ({ date, environment: resolveEnvironment(date), crops: farm, cpu: 0.4 }), enabled)
    services.push(service); return service
  }
  try {
    const disabled = create(false)
    disabled.start(); disabled.toggleSync(); disabled.set("hour", 23); disabled.stop()
    assert(!file.query_exists(null), "Disabled instance touched preferences")
    const first = create()
    assert(!file.query_exists(null), "Construction performed file I/O")
    first.start(); first.set("hour", 23)
    assert(first.state().settings.sync && !file.query_exists(null), "Live-mode slider changed preferences")
    GLib.mkdir_with_parents(dir, 0o700)
    const cropFile = Gio.File.new_for_path(`${dir}/crops.json`)
    const savedFarm = JSON.stringify(farm)
    cropFile.replace_contents(new TextEncoder().encode(savedFarm), null, false, Gio.FileCreateFlags.PRIVATE, null)
    first.toggleSync(); first.set("hour", 22.5); first.set("harvest", 0.5); first.set("moonPhase", 0.25)
    assert(!file.query_exists(null), "Slider writes were not debounced")
    first.stop()
    const saved = parseLandscapeSettings(read())
    assert(!saved.sync && saved.manual.hour === 22.5 && saved.manual.harvest === 0.5 && saved.manual.growth === 1, "Shutdown did not flush manual state")
    assert((file.query_info("unix::mode", Gio.FileQueryInfoFlags.NONE, null).get_attribute_uint32("unix::mode") & 0o777) === 0o600, "Preferences are not private")
    first.toggleSync(); first.set("hour", 1)
    assert(read() === `${JSON.stringify(saved, null, 2)}\n`, "Stopped service changed preferences")
    const resumed = create(); resumed.start()
    assert(JSON.stringify(resumed.state().settings) === JSON.stringify(saved), "Manual state did not survive restart")
    resumed.toggleSync()
    assert(resumed.state().settings.sync, "Sync could not be restored")
    resumed.toggleSync()
    assert(resumed.state().settings.manual.hour === 13.5, "Disabling sync did not capture current conditions again")
    resumed.stop()
    assert(read(cropFile) === savedFarm, "Manual controls modified saved crop growth")
    file.replace_contents(new TextEncoder().encode('{"version":999}'), null, false, Gio.FileCreateFlags.PRIVATE, null)
    const bad = create(); bad.start(); bad.toggleSync(); bad.set("hour", 18); bad.stop()
    assert(bad.state().error.includes("file preserved") && read() === '{"version":999}', "Corrupt preferences were overwritten")
    console.log("Landscape controls smoke passed: inert/disabled lifecycle, live-mode guards, private/debounced saves, restart, sync restoration, farm isolation and corrupt-file preservation. No desktop changes.")
  } finally { services.forEach(s => s.stop()); dispose() }
})
