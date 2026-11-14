import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"
import { createState, type Accessor } from "ags"
import { parseWttr, type WeatherObservation } from "../wallpaper-weather"

export interface WeatherState { observation: WeatherObservation | null; error: string; updatedAt: number | null }
export interface WeatherService { state: Accessor<WeatherState>; start(): void; stop(): void; refresh(): Promise<void> }
const INTERVAL_SECONDS = 30 * 60
const ARGV = ["curl", "--fail", "--silent", "--show-error", "--location", "--connect-timeout", "5", "--max-time", "15", "--max-filesize", "262144", "--proto", "=https", "--proto-redir", "=https", "https://wttr.in/?format=j1"]

/** Explicitly owned by the app: construction is inert, stop cancels and kills curl.
 * refresh is a rate-limited request, not a force-refresh; even failures are throttled.
 */
export function createWeatherService(enabled = true): WeatherService {
  const [state, setState] = createState<WeatherState>({ observation: null, error: "", updatedAt: null })
  let running = false, generation = 0, timer = 0
  let lastAttempt: number | null = null
  type Request = { process: Gio.Subprocess; cancellable: Gio.Cancellable }
  let active: Request | null = null
  async function refresh(): Promise<void> {
    const time = GLib.get_monotonic_time()
    if (!enabled || !running || active || (lastAttempt !== null && time - lastAttempt < INTERVAL_SECONDS * 1000000)) return
    lastAttempt = time
    const token = generation
    let request: Request | null = null
    let deadline = 0
    try {
      const process = Gio.Subprocess.new(ARGV, Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE)
      const cancellable = new Gio.Cancellable()
      request = { process, cancellable }; active = request
      // Independent watchdog also bounds curl startup/communication failures.
      deadline = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 20, () => {
        deadline = 0
        process.force_exit(); cancellable.cancel()
        return GLib.SOURCE_REMOVE
      })
      const stdout = await new Promise<string>((resolve, reject) => {
        process.communicate_utf8_async(null, cancellable, (_process, result) => {
          try {
            const [ok, output, stderr] = process.communicate_utf8_finish(result)
            if (!ok || !process.get_successful()) throw Error(stderr?.trim().slice(0, 512) || "wttr.in request failed")
            if (!output || output.length > 262144) throw Error("Invalid wttr.in response size")
            resolve(output)
          } catch (error) { reject(error) }
        })
      })
      if (!running || generation !== token) return
      const now = new Date()
      const observation = parseWttr(JSON.parse(stdout), now)
      setState({ observation, error: "", updatedAt: +now })
    } catch (error) {
      if (running && generation === token) setState(previous => ({ ...previous, error: String(error) }))
    } finally {
      if (deadline) GLib.source_remove(deadline)
      if (active === request) active = null
    }
  }
  return { state, refresh,
    start() {
      if (!enabled || running) return
      running = true; generation++
      void refresh()
      // A minute-resolution scheduler avoids skipping an entire refresh when
      // GLib's second-aligned timer fires slightly before the monotonic deadline.
      timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, () => {
        void refresh()
        return GLib.SOURCE_CONTINUE
      })
    },
    stop() {
      running = false; generation++
      if (timer) { GLib.source_remove(timer); timer = 0 }
      if (active) { active.process.force_exit(); active.cancellable.cancel(); active = null }
    },
  }
}
