/** Headless native Cairo rendering check: ags run ags/tools/wallpaper-preview.ts --gtk 4 */
import Cairo from "cairo"
import { drawLandscape } from "../wallpaper-scene"

function render(hour: number, file: string, memory = 0, flow = 42) {
  const surface = new Cairo.ImageSurface(Cairo.Format.ARGB32, 960, 540)
  const cr = new Cairo.Context(surface)
  cr.scale(2, 2)
  drawLandscape((x, y, w, h, color, alpha = 1) => {
    cr.setSourceRGBA(color[0] / 255, color[1] / 255, color[2] / 255, alpha)
    cr.rectangle(x, y, w, h); cr.fill()
  }, 480, new Date(2026, 0, 15, hour), 120, { memory, flow })
  surface.writeToPNG(file)
  cr.$dispose()
  console.log(`Rendered ${file}`)
}
for (const hour of [0, 6, 12, 18]) render(hour, `/tmp/sysdef-wallpaper-${hour}.png`)
// Same lighting, sky and water phase: differences isolate RAM-driven planting.
for (const percent of [0, 50, 100]) render(12, `/tmp/sysdef-wallpaper-ram-${percent}.png`, percent / 100)
