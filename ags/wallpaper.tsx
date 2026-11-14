import app from "ags/gtk4/app"
import { Astal, Gdk, Gtk } from "ags/gtk4"
import { onCleanup } from "ags"
import GLib from "gi://GLib?version=2.0"
import Cairo from "cairo"
import GObject from "gi://GObject?version=2.0"
import Graphene from "gi://Graphene?version=1.0"
import Gsk from "gi://Gsk?version=4.0"
import { nextFrameDeadline } from "./wallpaper-timing"
import { drawLandscape } from "./wallpaper-scene"
import type { WallpaperService } from "./services/wallpaper"
import { advanceMotion, type LandscapeMotion, type Resources } from "./wallpaper-resources"
import { resolveEnvironment, type WeatherObservation } from "./wallpaper-weather"
import { advanceCrops, type CropState } from "./wallpaper-crops"
import { manualScene, type LandscapeSettings } from "./landscape-controls-model"

// A texture node scales on the GPU. DrawingArea would first paint the tiny
// scene into an output-sized Cairo surface and upload that large bitmap again.
const PixelCanvas = GObject.registerClass(class SysdefPixelWallpaper extends Gtk.Widget {
  paint?: (width: number, height: number) => Gdk.Texture
  vfunc_snapshot(snapshot: Gtk.Snapshot) {
    const width = this.get_width(), height = this.get_height()
    if (width <= 0 || height <= 0 || !this.paint) return
    const bounds = new Graphene.Rect().init(0, 0, width, height)
    snapshot.append_scaled_texture(this.paint(width, height), Gsk.ScalingFilter.NEAREST, bounds)
  }
})

export function Wallpaper({ monitor, service, resources = () => ({ cpu: 0 }), weather = () => null, crops, controls, onFrame }: {
  monitor: Gdk.Monitor; service: Pick<WallpaperService, "animated">; resources?: () => Resources; weather?: () => WeatherObservation | null; crops?: () => CropState; controls?: () => LandscapeSettings; onFrame?: (surface: Cairo.ImageSurface, milliseconds: number) => void
}) {
  let motion: LandscapeMotion = { cpu: 0, flow: 0 }
  let lastFrame = GLib.get_monotonic_time() / 1_000_000, nextFrame = 0
  let buffer: Cairo.ImageSurface | null = null, painter: Cairo.Context | null = null, bufferWidth = 0
  const area = new PixelCanvas({ hexpand: true, vexpand: true, can_target: false })
  area.paint = (width, height) => {
    const started = GLib.get_monotonic_time()
    // Render the pixel scene once at its native resolution, not thousands of
    // full-output Cairo operations inside GTK's snapshot. Nearest scaling keeps
    // edges crisp and bounds the render cost on 4K/ultrawide monitors.
    const logicalWidth = Math.max(1, Math.ceil(width * 270 / Math.max(1, height)))
    if (!buffer || bufferWidth !== logicalWidth) {
      painter?.$dispose(); buffer?.finish()
      bufferWidth = logicalWidth
      buffer = new Cairo.ImageSurface(Cairo.Format.RGB24, logicalWidth, 270)
      painter = new Cairo.Context(buffer)
    }
    const canvas = painter!
    const now = new Date(), environment = resolveEnvironment(now, weather()), field = crops?.() ?? advanceCrops(null, now, environment.latitude)
    const scene = controls ? manualScene(controls(), now, environment, field) : { date: now, environment, crops: field }
    drawLandscape((x, y, w, h, color, alpha = 1) => {
      canvas.setSourceRGBA(color[0] / 255, color[1] / 255, color[2] / 255, alpha)
      canvas.rectangle(x, y, w, h); canvas.fill()
    }, logicalWidth, scene.date, GLib.get_monotonic_time() / 1_000_000, motion, scene.environment, scene.crops)
    const pixels = Gdk.pixbuf_get_from_surface(buffer, 0, 0, logicalWidth, 270)
    if (!pixels) throw Error("Could not create wallpaper texture")
    const texture = Gdk.Texture.new_for_pixbuf(pixels)
    onFrame?.(buffer, (GLib.get_monotonic_time() - started) / 1000)
    return texture
  }
  const window = <window name={`wallpaper-${monitor.connector ?? monitor.model ?? "output"}`} application={app}
    namespace="sysdef-wallpaper" gdkmonitor={monitor} visible={service.animated}
    layer={Astal.Layer.BACKGROUND} exclusivity={Astal.Exclusivity.IGNORE} keymode={Astal.Keymode.NONE}
    anchor={Astal.WindowAnchor.TOP | Astal.WindowAnchor.BOTTOM | Astal.WindowAnchor.LEFT | Astal.WindowAnchor.RIGHT}
    canTarget={false} focusable={false} resizable class="sysdef-wallpaper"
    onRealize={(self: Astal.Window) => self.get_surface()?.set_input_region(new Cairo.Region())}>{area}</window> as Astal.Window
  // Use GTK's presentation clock, not an idle-priority timeout which can be
  // starved by shell events. Unmapped/hidden widgets don't receive frame ticks.
  const tick = area.add_tick_callback((_area, clock) => {
    const now = clock.get_frame_time() / 1_000_000
    const deadline = nextFrameDeadline(now, nextFrame)
    if (deadline === null || !window.visible || !monitor.is_valid()) return GLib.SOURCE_CONTINUE
    const settings = controls?.()
    motion = advanceMotion(motion, settings && !settings.sync ? { cpu: settings.manual.cpu } : resources(), Math.min(0.1, Math.max(0, now - lastFrame)))
    lastFrame = now; nextFrame = deadline
    area.queue_draw()
    return GLib.SOURCE_CONTINUE
  })
  onCleanup(() => { area.remove_tick_callback(tick); area.paint = undefined; painter?.$dispose(); buffer?.finish(); window.destroy() })
  return window
}
