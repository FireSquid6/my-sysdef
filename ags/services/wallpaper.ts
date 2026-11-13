import { createState } from "ags"
import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"
import { createWallpaperModel, parseWallpaperMode, type WallpaperState } from "../wallpaper-model"

const pause = (ms: number) => new Promise<void>(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => { resolve(); return GLib.SOURCE_REMOVE }))
function read(path: string) { const [, bytes] = Gio.File.new_for_path(path).load_contents(null); return new TextDecoder().decode(bytes) }
function wait(child: Gio.Subprocess) {
  return new Promise<void>((resolve, reject) => child.wait_async(null, (self, result) => {
    try { self!.wait_finish(result); resolve() } catch (error) { reject(error) }
  }))
}
async function command(argv: string[]) {
  const child = Gio.Subprocess.new(argv, Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE)
  return new Promise<string>((resolve, reject) => child.communicate_utf8_async(null, null, (self, result) => {
    try {
      const [, out, err] = self!.communicate_utf8_finish(result)
      if (!child.get_successful()) throw Error(err || `${argv[0]} failed`)
      resolve(out ?? "")
    } catch (error) { reject(error) }
  }))
}
/** Only adopt legacy Hyprpaper in this exact compositor session, never user-wide pkill. */
function sessionPapers() {
  const signature = GLib.getenv("HYPRLAND_INSTANCE_SIGNATURE"), display = GLib.getenv("WAYLAND_DISPLAY")
  if (!signature || !display) return []
  const found: { pid: string; identity: string }[] = []
  const entries = Gio.File.new_for_path("/proc").enumerate_children("standard::name", Gio.FileQueryInfoFlags.NONE, null)
  try {
    let entry: Gio.FileInfo | null
    while ((entry = entries.next_file(null))) {
      const pid = entry.get_name()
      if (!/^\d+$/.test(pid)) continue
      try {
        const cmd = read(`/proc/${pid}/cmdline`).split("\0")[0]!
        if (cmd.split("/").at(-1) !== "hyprpaper") continue
        const env = read(`/proc/${pid}/environ`).split("\0")
        if (!env.includes(`HYPRLAND_INSTANCE_SIGNATURE=${signature}`) || !env.includes(`WAYLAND_DISPLAY=${display}`)) continue
        found.push({ pid, identity: processIdentity(pid) })
      } catch { /* Other users' processes and exited processes are not adoptable. */ }
    }
  } finally { entries.close(null) }
  return found
}
// /proc starttime prevents accidentally signaling a recycled PID.
function processIdentity(pid: string) { return read(`/proc/${pid}/stat`).split(") ")[1]!.split(" ")[19]! }
function alive(process: { pid: string; identity: string }) {
  try {
    const stat = read(`/proc/${process.pid}/stat`).split(") ")[1]!.split(" ")
    return stat[0] !== "Z" && stat[19] === process.identity
  } catch { return false }
}
async function terminate(process: { pid: string; identity: string }) {
  for (const signal of ["-TERM", "-KILL"]) {
    if (!alive(process)) return
    await command(["kill", signal, "--", process.pid]).catch(error => { if (alive(process)) throw error })
    for (let i = 0; i < 30 && alive(process); i++) await pause(50)
  }
  if (alive(process)) throw Error("Hyprpaper did not stop")
}

export function createWallpaperService(enabled = true) {
  const dir = `${GLib.get_user_state_dir()}/sysdef`, file = Gio.File.new_for_path(`${dir}/wallpaper`)
  let initial: WallpaperState["mode"] = "animated", loadError = ""
  try { if (file.query_exists(null)) initial = parseWallpaperMode(read(file.get_path()!)) }
  catch (error) { loadError = `Cannot read wallpaper preference: ${String(error)}`; console.error(loadError) }
  const [state, setState] = createState<WallpaperState>({ mode: initial, busy: false, error: loadError })
  const [animated, setAnimated] = createState(false)
  let paper: { pid: string; identity: string } | null = null, stopped = false
  let starting = false, suppressExit = false
  async function stopPaper() {
    suppressExit = true
    try {
      const processes = sessionPapers()
      if (paper && !processes.some(p => p.pid === paper!.pid)) processes.push(paper)
      for (const process of processes) await terminate(process)
      paper = null
    } finally { suppressExit = false }
  }
  async function ready() {
    // listactive is the supported Hyprpaper 0.8 IPC readiness check. A successful
    // fork alone isn't enough: invalid configs may leave no usable wallpaper.
    for (let i = 0; i < 20; i++) {
      if (stopped || !paper || !alive(paper)) throw Error("Hyprpaper exited before displaying a wallpaper")
      try {
        const output = await command(["timeout", "1", "hyprctl", "hyprpaper", "listactive"])
        if (/^.+: .+/m.test(output) && !/^error:/im.test(output)) {
          await pause(100)
          if (paper && alive(paper)) return
          throw Error("Hyprpaper exited during startup")
        }
      } catch { /* Socket/config initialization may still be in progress. */ }
      await pause(100)
    }
    throw Error("Hyprpaper did not display a wallpaper. Check ~/.config/hypr/hyprpaper.conf and enable its IPC.")
  }
  const model = createWallpaperModel(initial, async mode => {
    if (!enabled || stopped) throw Error("Wallpaper controls are disabled")
    if (mode === "animated") { await stopPaper(); if (!stopped) setAnimated(true) }
    else {
      starting = true
      try {
        if (!paper || !alive(paper)) {
          paper = sessionPapers()[0] ?? null
          if (!paper) {
            const child = Gio.Subprocess.new(["hyprpaper"], Gio.SubprocessFlags.NONE)
            const pid = child.get_identifier()!
            paper = { pid, identity: processIdentity(pid) }
            void wait(child).then(() => {
              if (paper?.pid !== pid || stopped || suppressExit || starting) return
              paper = null
              void model.select("animated").then(() => setState(s => ({ ...s, error: "Hyprpaper exited; restored animated wallpaper. Check ~/.config/hypr/hyprpaper.conf." })))
            }).catch(error => console.error(String(error)))
          }
        }
        await ready()
        if (!stopped) setAnimated(false)
      } catch (error) { await stopPaper(); throw error }
      finally { starting = false }
    }
  }, mode => {
    if (GLib.mkdir_with_parents(dir, 0o700) !== 0) throw Error(`Cannot create ${dir}`)
    file.replace_contents(new TextEncoder().encode(`${mode}\n`), null, false, Gio.FileCreateFlags.PRIVATE, null)
  }, setState)
  // Notice adopted renderers exiting too. No drawing/work is done in a disabled test instance.
  const monitor = enabled ? GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
    if (!stopped && !starting && !state().busy && state().mode === "hyprpaper" && paper && !alive(paper)) {
      paper = null
      void model.select("animated").then(() => setState(s => ({ ...s, error: "Hyprpaper exited; restored animated wallpaper." })))
    }
    return GLib.SOURCE_CONTINUE
  }) : 0
  return {
    state, animated,
    toggle: () => enabled && !stopped ? model.toggle() : Promise.resolve(),
    async start() {
      if (!enabled || stopped) return
      await model.select(initial)
      if (state().error && !animated()) {
        const error = state().error
        await model.select("animated")
        setState(s => ({ ...s, error }))
      }
    },
    stop() {
      stopped = true; model.stop()
      if (monitor) GLib.source_remove(monitor)
      if (paper && alive(paper)) void terminate(paper).catch(error => console.error(String(error)))
      paper = null; setAnimated(false)
    },
  }
}
export type WallpaperService = ReturnType<typeof createWallpaperService>
