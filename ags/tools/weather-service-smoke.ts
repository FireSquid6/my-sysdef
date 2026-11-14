// Run through weather-service-smoke.sh: isolated fake curl, no network or UI.
import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"
import { createRoot } from "ags"
import { createWeatherService } from "../services/weather"
const loop = new GLib.MainLoop(null, false)
const pause = () => new Promise<void>(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 20, () => { resolve(); return GLib.SOURCE_REMOVE }))
const file = (name: string) => Gio.File.new_for_path(GLib.getenv(name)!)
const read = (name: string) => new TextDecoder().decode(file(name).load_contents(null)[1])
const assert = (ok: unknown, message: string) => { if (!ok) throw Error(message) }
async function waitFor(check: () => boolean) {
  for (let i = 0; i < 100; i++) { if (check()) return; await pause() }
  throw Error("Timed out waiting for weather service")
}
let failure = false
createRoot(dispose => {
  const services: ReturnType<typeof createWeatherService>[] = []
  const service = (enabled = true) => { const s = createWeatherService(enabled); services.push(s); return s }
  void (async () => {
    try {
      assert(GLib.getenv("SYSDEF_WEATHER_CALLS"), "Use weather-service-smoke.sh; refusing to use real curl")
      const disabled = service(false)
      disabled.start(); await disabled.refresh(); await pause()
      assert(!file("SYSDEF_WEATHER_CALLS").query_exists(null), "Disabled service performed a request")
      const good = service()
      assert(!file("SYSDEF_WEATHER_CALLS").query_exists(null), "Construction performed a request")
      good.start(); good.start()
      await waitFor(() => !!good.state().observation || !!good.state().error)
      assert(good.state().observation?.weather === "rain" && !good.state().error && good.state().updatedAt, "Valid response was not published")
      const args = read("SYSDEF_WEATHER_ARGS").trim().split("\n")
      for (const [flag, value] of [["--connect-timeout", "5"], ["--max-time", "15"], ["--max-filesize", "262144"], ["--proto", "=https"], ["--proto-redir", "=https"]]) assert(args[args.indexOf(flag!) + 1] === value, `Missing bounded curl option ${flag}`)
      assert(args.includes("https://wttr.in/?format=j1"), "Unexpected weather endpoint")
      await good.refresh(); good.stop(); good.start(); await good.refresh()
      assert(read("SYSDEF_WEATHER_CALLS").trim().split("\n").length === 1, "Refresh/restart bypassed request throttling")
      good.stop()
      GLib.setenv("SYSDEF_WEATHER_MODE", "bad", true)
      const bad = service(); bad.start()
      await waitFor(() => !!bad.state().error)
      assert(!bad.state().observation && bad.state().updatedAt === null, "Malformed response was published as weather")
      bad.stop()
      GLib.setenv("SYSDEF_WEATHER_MODE", "slow", true)
      const previousPid = read("SYSDEF_WEATHER_PID").trim()
      const slow = service(); slow.start()
      await waitFor(() => {
        const pid = read("SYSDEF_WEATHER_PID").trim()
        return /^\d+$/.test(pid) && pid !== previousPid && read("SYSDEF_WEATHER_CALLS").trim().split("\n").length === 3
      })
      const pid = read("SYSDEF_WEATHER_PID").trim()
      slow.stop()
      await waitFor(() => !Gio.File.new_for_path(`/proc/${pid}`).query_exists(null))
      await pause()
      assert(!slow.state().observation && slow.state().updatedAt === null && !slow.state().error, "Stopped request published a late result/error")
      console.log("Weather service smoke passed: inert/disabled lifecycle, bounded HTTPS curl, parsing, refresh throttling, malformed JSON, subprocess cancellation and late-result safety. No network or desktop changes.")
    } catch (error) { failure = true; console.error(error) }
    finally { services.forEach(s => s.stop()); dispose(); loop.quit() }
  })()
})
loop.run()
if (failure) throw Error("Weather service smoke failed")
