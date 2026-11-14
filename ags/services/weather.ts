import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"
import { createState, type Accessor } from "ags"
import { parseWttr, type WeatherObservation } from "../wallpaper-weather"
import { DEFAULT_WEATHER_LOCATION, weatherLocation, weatherURL } from "../weather-request"

export interface WeatherState { observation: WeatherObservation | null; error: string; updatedAt: number | null; location: string }
export interface WeatherService { state: Accessor<WeatherState>; start(): void; stop(): void; refresh(): Promise<void> }
const INTERVAL_SECONDS = 30 * 60
const ARGV = ["curl", "--fail", "--silent", "--show-error", "--location", "--connect-timeout", "5", "--max-time", "15", "--max-filesize", "262144", "--proto", "=https", "--proto-redir", "=https"]
function configuredLocation() {
  const override = GLib.getenv("SYSDEF_WEATHER_LOCATION")
  if (override?.trim()) return weatherLocation(override)
  const file = Gio.File.new_for_path(`${GLib.get_user_state_dir()}/sysdef/weather-location`)
  try {
    if (!file.query_exists(null)) return DEFAULT_WEATHER_LOCATION
    if (file.query_info("standard::size", Gio.FileQueryInfoFlags.NONE, null).get_size() > 1024) return DEFAULT_WEATHER_LOCATION
    return weatherLocation(new TextDecoder().decode(file.load_contents(null)[1]))
  } catch (error) { console.warn(`Cannot read weather location; using Austin: ${String(error)}`); return DEFAULT_WEATHER_LOCATION }
}

/** Explicitly owned by the app: construction is inert, stop cancels and kills curl.
 * refresh is a rate-limited request, not a force-refresh; even failures are throttled.
 */
export function createWeatherService(enabled = true): WeatherService {
  const [state, setState] = createState<WeatherState>({ observation: null, error: "", updatedAt: null, location: DEFAULT_WEATHER_LOCATION })
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
      const location = configuredLocation()
      // A city change must not relabel the previous city's cached conditions.
      setState(previous => previous.location === location ? previous : ({ ...previous, location, observation: null, updatedAt: null }))
      const process = Gio.Subprocess.new([...ARGV, weatherURL(location)], Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE)
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
      setState({ observation, error: "", updatedAt: +now, location })
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
