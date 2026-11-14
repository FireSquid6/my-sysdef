/** Isolated wallpaper-only GTK process. Parent stdin supplies read-only scene
 * snapshots. EOF exits; no auth, weather fetching, preferences or farm writes. */
import app from "ags/gtk4/app"
import { createBinding, createState, For, This, onCleanup } from "ags"
import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"
import Cairo from "cairo"
import { Wallpaper } from "./wallpaper"
import { parseWallpaperFrame, wallpaperRuntime, type WallpaperFrame } from "./wallpaper-protocol"
import { drawLandscape } from "./wallpaper-scene"
import { resolveEnvironment } from "./wallpaper-weather"
import { manualScene } from "./landscape-controls-model"
import { advanceMotion, type LandscapeMotion } from "./wallpaper-resources"

const instance = GLib.getenv("SYSDEF_AGS_INSTANCE") || "sysdef"
let describe = () => ({ received: 0, frames: 0, animated: false, paintAvgMs: 0, paintMaxMs: 0 })
app.start({ instanceName: `${instance}-wallpaper`, requestHandler(argv, respond) {
  respond(JSON.stringify({ ok: argv[0] === "ping" || argv[0] === "status", value: argv[0] === "ping" ? "pong" : describe() }))
}, main() {
  const [frame, setFrame] = createState<WallpaperFrame | null>(null)
  const headless = GLib.getenv("SYSDEF_WALLPAPER_HEADLESS") === "1"
  const monitors = createBinding(app, "monitors")
  const cancellation = new Gio.Cancellable()
  // Linux /dev/stdin duplicates the inherited pipe as a native GIO stream.
  const input = new Gio.DataInputStream({ base_stream: Gio.File.new_for_path("/dev/stdin").read(null) })
  const dir = wallpaperRuntime(instance, GLib.get_user_runtime_dir())
  const output = Gio.File.new_for_path(`${dir}/frame.png`), temp = Gio.File.new_for_path(`${dir}/frame.tmp.png`)
  let stopped = false, received = 0, rendered = 0, exportFailed = false, exporter = 0
  let surface: Cairo.ImageSurface | null = null, painter: Cairo.Context | null = null, imageWidth = 0
  let motion: LandscapeMotion = { cpu: 0, flow: 0 }, lastExport = GLib.get_monotonic_time() / 1_000_000
  let paintTotal = 0, paintMax = 0
  describe = () => ({ received, frames: rendered, animated: frame()?.animated ?? false, paintAvgMs: rendered ? Math.round(paintTotal / rendered * 100) / 100 : 0, paintMaxMs: Math.round(paintMax * 100) / 100 })
  const removeFrame = () => { try { output.delete(null) } catch { /* Missing during first frame/cleanup. */ } }
  function exportFrame() {
    const current = frame(), monitor = app.get_monitors()[0], now = GLib.get_monotonic_time() / 1_000_000
    const elapsed = now - lastExport; lastExport = now
    if (!current?.animated || !monitor) return
    try {
      const geometry = monitor.get_geometry(), width = Math.max(1, Math.ceil(geometry.width * 270 / Math.max(1, geometry.height)))
      if (!surface || width !== imageWidth) {
        painter?.$dispose(); surface?.finish(); imageWidth = width
        surface = new Cairo.ImageSurface(Cairo.Format.RGB24, width, 270); painter = new Cairo.Context(surface)
      }
      motion = advanceMotion(motion, current.controls.sync ? current.resources : { cpu: current.controls.manual.cpu }, elapsed)
      const date = new Date(), live = resolveEnvironment(date, current.weather)
      const scene = manualScene(current.controls, date, live, current.crops), canvas = painter!
      drawLandscape((x, y, w, h, color, alpha = 1) => {
        canvas.setSourceRGBA(color[0] / 255, color[1] / 255, color[2] / 255, alpha)
        canvas.rectangle(x, y, w, h); canvas.fill()
      }, width, scene.date, now, motion, scene.environment, scene.crops)
      if (GLib.mkdir_with_parents(dir, 0o700) !== 0) throw Error("Cannot create wallpaper runtime")
      // The image is RGB24 (opaque). Publish complete PNGs by atomic rename on
      // runtime tmpfs; Hyprlock never observes a partially encoded frame.
      surface!.writeToPNG(temp.get_path()!)
      temp.set_attribute_uint32("unix::mode", 0o600, Gio.FileQueryInfoFlags.NONE, null)
      temp.move(output, Gio.FileCopyFlags.OVERWRITE, null, null)
      exportFailed = false
    } catch (error) { if (!exportFailed) console.warn(`Lock wallpaper export: ${String(error)}`); exportFailed = true }
  }
  const windows = <For each={monitors}>{monitor => <This this={app}><Wallpaper monitor={monitor}
    service={{ animated: frame(value => !headless && (value?.animated ?? false)) }} resources={() => frame()?.resources ?? { cpu: 0 }}
    weather={() => frame()?.weather ?? null} crops={() => frame()!.crops} controls={() => frame()!.controls}
    onFrame={(_surface, milliseconds) => { rendered++; paintTotal += milliseconds; paintMax = Math.max(paintMax, milliseconds) }} /></This>}</For>
  void windows
  function cleanup() {
    if (stopped) return
    stopped = true; cancellation.cancel()
    if (exporter) GLib.source_remove(exporter)
    painter?.$dispose(); surface?.finish(); removeFrame()
    try { temp.delete(null) } catch { /* No incomplete frame. */ }
    try { input.close(null) } catch { /* Canceled read. */ }
  }
  function readNext() {
    input.read_line_async(GLib.PRIORITY_DEFAULT, cancellation, (self, result) => {
      try {
        const [line] = self!.read_line_finish_utf8(result)
        if (stopped) return
        if (line === null) { cleanup(); app.quit(); return }
        try {
          const value = parseWallpaperFrame(line)
          received++; setFrame(value)
          if (!value.animated) removeFrame()
        } catch (error) { console.error(`Rejected wallpaper snapshot: ${String(error)}`) }
        readNext()
      } catch (error) { if (!stopped) { console.error(String(error)); cleanup(); app.quit(1) } }
    })
  }
  readNext()
  // Locking stops Wayland frame callbacks on ordinary desktop surfaces. Keep
  // the lock feed on a separate offscreen timer, independent of mapped windows.
  exporter = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => { exportFrame(); return GLib.SOURCE_CONTINUE })
  onCleanup(cleanup)
} })
