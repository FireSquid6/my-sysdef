import app from "ags/gtk4/app"
import { Astal, Gdk, Gtk } from "ags/gtk4"
import { onCleanup } from "ags"
import GLib from "gi://GLib?version=2.0"
import Cairo from "cairo"
import { drawLandscape } from "./wallpaper-scene"
import type { WallpaperService } from "./services/wallpaper"
import { advanceMotion, type LandscapeMotion, type Resources } from "./wallpaper-resources"

export function Wallpaper({ monitor, service, resources = () => ({ cpu: 0, memory: 0 }) }: {
  monitor: Gdk.Monitor; service: Pick<WallpaperService, "animated">; resources?: () => Resources
}) {
  let motion: LandscapeMotion = { cpu: 0, memory: resources().memory, flow: 0 }
  let lastFrame = GLib.get_monotonic_time() / 1_000_000
  const area = new Gtk.DrawingArea({ hexpand: true, vexpand: true, can_target: false })
  area.set_draw_func((_area, cr, width, height) => {
    // Integer device-aligned rectangles: crisp pixels at fractional output scales too.
    const scale = Math.max(1, height / 270), logicalWidth = Math.ceil(width / scale)
    drawLandscape((x, y, w, h, color, alpha = 1) => {
      cr.setSourceRGBA(color[0] / 255, color[1] / 255, color[2] / 255, alpha)
      const left = Math.round(x * scale), top = Math.round(y * scale)
      cr.rectangle(left, top, Math.round((x + w) * scale) - left, Math.round((y + h) * scale) - top)
      cr.fill()
    }, logicalWidth, new Date(), GLib.get_monotonic_time() / 1_000_000, motion)
  })
  const window = <window name={`wallpaper-${monitor.connector ?? monitor.model ?? "output"}`} application={app}
    namespace="sysdef-wallpaper" gdkmonitor={monitor} visible={service.animated}
    layer={Astal.Layer.BACKGROUND} exclusivity={Astal.Exclusivity.IGNORE} keymode={Astal.Keymode.NONE}
    anchor={Astal.WindowAnchor.TOP | Astal.WindowAnchor.BOTTOM | Astal.WindowAnchor.LEFT | Astal.WindowAnchor.RIGHT}
    canTarget={false} focusable={false} resizable class="sysdef-wallpaper"
    onRealize={(self: Astal.Window) => self.get_surface()?.set_input_region(new Cairo.Region())}>{area}</window> as Astal.Window
  // Eight frames/sec is sufficient for slow wind, water and aurora; static mode does no drawing.
  const timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, 125, () => {
    const now = GLib.get_monotonic_time() / 1_000_000
    if (window.visible && monitor.is_valid()) {
      motion = advanceMotion(motion, resources(), now - lastFrame)
      area.queue_draw()
    }
    lastFrame = now
    return GLib.SOURCE_CONTINUE
  })
  onCleanup(() => { GLib.source_remove(timer); area.set_draw_func(null); window.destroy() })
  return window
}
