import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"
import { createState } from "ags"
import type { WallpaperFrame } from "../wallpaper-protocol"

/** A separate GTK process keeps scene generation/GC out of shell IPC and
 * menus. Its private stdin is a latest-value channel; EOF owns child lifetime. */
export function createWallpaperRenderer(root: string, snapshot: () => WallpaperFrame, enabled = true,
  launch = () => Gio.Subprocess.new(["ags", "run", `${root}/ags/wallpaper-app.tsx`, "--gtk", "4"], Gio.SubprocessFlags.STDIN_PIPE)) {
  const [state, setState] = createState({ running: false, error: "" })
  let child: Gio.Subprocess | null = null, stream: Gio.OutputStream | null = null
  let timer = 0, retry = 0, stopped = false, busy = false, last = ""
  let failures = 0
  const close = (output: Gio.OutputStream) => output.close_async(GLib.PRIORITY_DEFAULT, null, (self, result) => { try { self!.close_finish(result) } catch { /* Already closed/exited. */ } })
  function publish() {
    if (stopped || !stream || busy) return
    const line = JSON.stringify(snapshot()) + "\n"
    if (line === last) return
    const output = stream
    busy = true
    output.write_all_async(new TextEncoder().encode(line), GLib.PRIORITY_DEFAULT, null, (self, result) => {
      try { self!.write_all_finish(result); if (stream === output) last = line }
      catch (error) { if (!stopped) setState(s => ({ ...s, error: `Wallpaper channel: ${String(error)}` })) }
      finally { busy = false; if (stopped) close(output) }
    })
  }
  function scheduleRestart() {
    if (stopped || retry || child) return
    retry = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, Math.min(30, 2 ** Math.min(++failures, 5)), () => { retry = 0; spawn(); return GLib.SOURCE_REMOVE })
  }
  function spawn() {
    if (stopped || child) return
    try {
      const process = launch()
      child = process; stream = process.get_stdin_pipe(); last = ""; busy = false
      setState({ running: true, error: "" }); publish()
      process.wait_async(null, (self, result) => {
        try { self!.wait_finish(result) } catch { /* Report/retry below. */ }
        if (child !== process) return
        child = null; stream = null; last = ""
        if (stopped) return
        setState({ running: false, error: "Wallpaper renderer exited; restarting" })
        scheduleRestart()
      })
    } catch (error) {
      setState({ running: false, error: `Wallpaper renderer unavailable: ${String(error)}` })
      scheduleRestart()
    }
  }
  return {
    state,
    start() {
      if (!enabled || stopped || timer) return
      spawn()
      // Small snapshots only; slow readers never accumulate a queue of frames.
      timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => { publish(); return GLib.SOURCE_CONTINUE })
    },
    stop() {
      stopped = true
      if (timer) GLib.source_remove(timer)
      if (retry) GLib.source_remove(retry)
      timer = retry = 0
      const output = stream; stream = null
      // Closing stdin makes the renderer quit even if the parent is terminated.
      // Serialize close after any pending write without blocking the main loop.
      if (output && !busy) close(output)
      setState(s => ({ ...s, running: false }))
    },
  }
}
