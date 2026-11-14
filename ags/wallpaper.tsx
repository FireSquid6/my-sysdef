import app from "ags/gtk4/app"
import { Astal, Gdk, Gtk } from "ags/gtk4"
import { onCleanup } from "ags"
import GLib from "gi://GLib?version=2.0"
import Cairo from "cairo"
import { drawLandscape } from "./wallpaper-scene"
import type { WallpaperService } from "./services/wallpaper"
import { advanceMotion, type LandscapeMotion, type Resources } from "./wallpaper-resources"
import { resolveEnvironment, type WeatherObservation } from "./wallpaper-weather"
import { advanceCrops, type CropState } from "./wallpaper-crops"
import { manualScene, type LandscapeSettings } from "./landscape-controls-model"

export function Wallpaper({ monitor, service, resources = () => ({ cpu: 0 }), weather = () => null, crops, controls }: {
  monitor: Gdk.Monitor; service: Pick<WallpaperService, "animated">; resources?: () => Resources; weather?: () => WeatherObservation | null; crops?: () => CropState; controls?: () => LandscapeSettings
}) {
  let motion: LandscapeMotion = { cpu: 0, flow: 0 }
  let lastFrame = GLib.get_monotonic_time() / 1_000_000
  const area = new Gtk.DrawingArea({ hexpand: true, vexpand: true, can_target: false })
  area.set_draw_func((_area, cr, width, height) => {
    // Integer device-aligned rectangles: crisp pixels at fractional output scales too.
    const scale = Math.max(1, height / 270), logicalWidth = Math.ceil(width / scale)
    const now = new Date(), environment = resolveEnvironment(now, weather()), field = crops?.() ?? advanceCrops(null, now, environment.latitude)
    const scene = controls ? manualScene(controls(), now, environment, field) : { date: now, environment, crops: field }
    drawLandscape((x, y, w, h, color, alpha = 1) => {
      cr.setSourceRGBA(color[0] / 255, color[1] / 255, color[2] / 255, alpha)
      const left = Math.round(x * scale), top = Math.round(y * scale)
      cr.rectangle(left, top, Math.round((x + w) * scale) - left, Math.round((y + h) * scale) - top)
      cr.fill()
    }, logicalWidth, scene.date, GLib.get_monotonic_time() / 1_000_000, motion, scene.environment, scene.crops)
  })
  const window = <window name={`wallpaper-${monitor.connector ?? monitor.model ?? "output"}`} application={app}
    namespace="sysdef-wallpaper" gdkmonitor={monitor} visible={service.animated}
    layer={Astal.Layer.BACKGROUND} exclusivity={Astal.Exclusivity.IGNORE} keymode={Astal.Keymode.NONE}
    anchor={Astal.WindowAnchor.TOP | Astal.WindowAnchor.BOTTOM | Astal.WindowAnchor.LEFT | Astal.WindowAnchor.RIGHT}
    canTarget={false} focusable={false} resizable class="sysdef-wallpaper"
    onRealize={(self: Astal.Window) => self.get_surface()?.set_input_region(new Cairo.Region())}>{area}</window> as Astal.Window
  // 24 FPS plus continuously blended water phases avoids the former 8 FPS
  // stepping. Static mode still does no drawing; suspend never catches up motion.
  const timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, 42, () => {
    const now = GLib.get_monotonic_time() / 1_000_000
    if (window.visible && monitor.is_valid()) {
      const settings = controls?.()
      motion = advanceMotion(motion, settings && !settings.sync ? { cpu: settings.manual.cpu } : resources(), now - lastFrame)
      area.queue_draw()
    }
    lastFrame = now
    return GLib.SOURCE_CONTINUE
  })
  onCleanup(() => { GLib.source_remove(timer); area.set_draw_func(null); window.destroy() })
  return window
}
