/** Headless native Cairo rendering check: ags run ags/tools/wallpaper-preview.ts --gtk 4 */
import Cairo from "cairo"
import { drawLandscape } from "../wallpaper-scene"
import { resolveEnvironment, type LandscapeEnvironment } from "../wallpaper-weather"
import { advanceCrops, type CropState } from "../wallpaper-crops"

function render(hour: number, file: string, environment: Partial<LandscapeEnvironment> = {}, crops?: CropState) {
  const surface = new Cairo.ImageSurface(Cairo.Format.ARGB32, 960, 540)
  const cr = new Cairo.Context(surface)
  cr.scale(2, 2)
  const date = new Date(2026, 0, 15, hour)
  drawLandscape((x, y, w, h, color, alpha = 1) => {
    cr.setSourceRGBA(color[0] / 255, color[1] / 255, color[2] / 255, alpha)
    cr.rectangle(x, y, w, h); cr.fill()
  }, 480, date, 120, { flow: 42 }, { ...resolveEnvironment(date), ...environment }, crops)
  surface.writeToPNG(file)
  cr.$dispose()
  console.log(`Rendered ${file}`)
}
for (const hour of [0, 6, 12, 18]) render(hour, `/tmp/sysdef-wallpaper-${hour}.png`)
for (const [season, weather, temperature, month] of [["spring", "clear", 14, 4], ["summer", "rain", 24, 7], ["autumn", "fog", 9, 10], ["winter", "snow", -4, 1]] as const) {
  render(12, `/tmp/sysdef-wallpaper-${season}.png`, { season, weather, temperature, cloud: weather === "clear" ? 0.15 : 0.9, precip: 0.85, wind: 0.65 }, advanceCrops(null, new Date(2026, month - 1, 15)))
}
for (const [name, phase] of [["new", 0], ["waxing", 0.125], ["quarter", 0.25], ["full", 0.5], ["waning", 0.875]] as const) {
  render(0, `/tmp/sysdef-wallpaper-moon-${name}.png`, { season: "summer", moonPhase: phase, moonIllumination: (1 - Math.cos(phase * Math.PI * 2)) / 2, cloud: 0 })
}
// Hold lighting and water fixed: only crop variety/growth/harvest changes.
for (const [crop, month, season] of [["peas", 4, "spring"], ["wheat", 7, "summer"], ["pumpkins", 10, "autumn"]] as const) {
  const base = advanceCrops(null, new Date(2026, month - 1, 15))
  for (const [stage, growth, harvest] of [["sown", 0, 0], ["growing", 0.35, 0], ["ripe", 1, 0], ["harvesting", 1, 0.5], ["harvested", 1, 1]] as const) {
    render(12, `/tmp/sysdef-wallpaper-crop-${crop}-${stage}.png`, { season, temperature: 15 }, { ...base, crop, growth, harvest })
  }
}
