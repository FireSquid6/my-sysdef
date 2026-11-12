import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"
import { createState } from "ags"
import { readFile } from "ags/file"
import { run } from "./controller"
import { batteryClass, batteryLabel, networkLabel } from "../system-model"

export function createSystemService() {
  const [state, setState] = createState({ volume: " …", network: " …", battery: "", batteryClass: "", batteryDetail: "", error: "" })
  let timer = 0
  let busy = false
  let stopped = false
  let battery = ""
  try {
    const folder = Gio.File.new_for_path("/sys/class/power_supply")
    const files = folder.enumerate_children("standard::name", Gio.FileQueryInfoFlags.NONE, null)
    try {
      let file: Gio.FileInfo | null
      while ((file = files.next_file(null))) {
        const name = `/sys/class/power_supply/${file.get_name()}`
        if (readFile(`${name}/type`).trim() === "Battery") { battery = name; break }
      }
    } finally { files.close(null) }
  } catch (e) { console.warn(`Battery unavailable: ${e}`) }
  async function update() {
    if (busy || stopped) return
    busy = true
    const next = { ...state(), error: "" }
    const errors: string[] = []
    await Promise.all([
      (async () => {
        try {
          const [volume, muted] = await Promise.all([run(["pamixer", "--get-volume"]), run(["pamixer", "--get-mute"])])
          next.volume = muted.trim() === "true" ? "󰝟 Muted" : ` ${volume.trim()}%`
        } catch (e) { next.volume = "󰝟 Unavailable"; errors.push(`Audio: ${e}`) }
      })(),
      (async () => {
        try { next.network = networkLabel(await run(["env", "LC_ALL=C", "nmcli", "-t", "-f", "TYPE,STATE,CONNECTION", "device", "status"])) }
        catch (e) { next.network = "󱚼 Unavailable"; errors.push(`Network: ${e}`) }
      })(),
    ])
    if (battery) {
      try {
        const capacity = Number(readFile(`${battery}/capacity`).trim())
        const status = readFile(`${battery}/status`).trim()
        next.battery = batteryLabel(capacity, status)
        next.batteryClass = batteryClass(capacity, status)
        next.batteryDetail = `${status} · ${capacity}%`
      } catch (e) { errors.push(`Battery: ${e}`) }
    }
    next.error = errors.join("\n")
    if (!stopped) setState(next)
    busy = false
  }
  return {
    state, update,
    start() { void update(); timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, () => { void update(); return GLib.SOURCE_CONTINUE }) },
    stop() { stopped = true; if (timer) GLib.source_remove(timer) },
  }
}
