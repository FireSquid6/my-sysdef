import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"
import { createState } from "ags"
import { readFile } from "ags/file"
import { batteryClass, batteryLabel, networkLabel } from "../system-model"

export function createSystemService() {
  const [state, setState] = createState({ volume: " …", network: " …", battery: "", batteryClass: "", batteryDetail: "", error: "" })
  let timer = 0
  let busy = false
  let stopped = false
  let battery = ""
  const pending = new Set<() => void>()
  async function run(argv: string[]): Promise<string> {
    const child = Gio.Subprocess.new(argv, Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE)
    const cancellable = new Gio.Cancellable()
    let deadline = 0
    let cancel = () => {}
    try {
      return await new Promise<string>((resolve, reject) => {
        cancel = () => {
          if (deadline) { GLib.source_remove(deadline); deadline = 0 }
          child.force_exit(); cancellable.cancel()
          reject(Error(`${argv[0]} cancelled or timed out`))
        }
        pending.add(cancel)
        deadline = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 3, () => {
          deadline = 0; cancel(); return GLib.SOURCE_REMOVE
        })
        child.communicate_utf8_async(null, cancellable, (_child, result) => {
          try {
            const [ok, output, stderr] = child.communicate_utf8_finish(result)
            if (!ok || !child.get_successful()) throw Error(stderr?.trim().slice(0, 512) || `${argv[0]} failed`)
            resolve(output ?? "")
          } catch (error) { reject(error) }
        })
      })
    } finally {
      if (deadline) GLib.source_remove(deadline)
      pending.delete(cancel)
    }
  }
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
    start() {
      if (timer || stopped) return
      void update()
      timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, () => { void update(); return GLib.SOURCE_CONTINUE })
    },
    stop() {
      stopped = true
      if (timer) { GLib.source_remove(timer); timer = 0 }
      for (const cancel of pending) cancel()
    },
  }
}
