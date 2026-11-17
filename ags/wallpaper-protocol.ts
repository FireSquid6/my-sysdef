import { CITY_MACHINES, INACTIVE_CITIES, type CityActivity } from "./wallpaper-cities"
import type { Resources } from "./wallpaper-resources"
import { parseCropState, type CropState } from "./wallpaper-crops"
import { parseLandscapeSettings, type LandscapeSettings } from "./landscape-controls-model"
import type { WeatherObservation } from "./wallpaper-weather"
export type WallpaperFrame = { version: 1; animated: boolean; cities: CityActivity; resources: Resources; crops: CropState; controls: LandscapeSettings; weather: WeatherObservation | null }
export function parseWallpaperFrame(line: string): WallpaperFrame {
  if (line.length > 65536) throw Error("Wallpaper snapshot too large")
  const value = JSON.parse(line)
  if (value?.version !== 1 || typeof value.animated !== "boolean" || typeof value.resources?.cpu !== "number" || !Number.isFinite(value.resources.cpu)) throw Error("Invalid wallpaper snapshot")
  if (value.weather !== null && (!value.weather || !["observedAt", "fetchedAt", "latitude", "cloud", "precip", "wind", "windDirection", "temperature", "moonPhase", "moonIllumination"].every(key => typeof value.weather[key] === "number" && Number.isFinite(value.weather[key])))) throw Error("Invalid wallpaper weather")
  const cities = { ...INACTIVE_CITIES }
  if (value.cities !== undefined) {
    if (!value.cities || !CITY_MACHINES.every(machine => typeof value.cities[machine] === "boolean")) throw Error("Invalid wallpaper cities")
    for (const machine of CITY_MACHINES) cities[machine] = value.cities[machine]
  }
  const resources: Resources = { cpu: Math.max(0, Math.min(1, value.resources.cpu)) }
  for (const key of ["ram", "disk"] as const) {
    if (value.resources[key] === undefined) continue
    if (typeof value.resources[key] !== "number" || !Number.isFinite(value.resources[key])) throw Error(`Invalid wallpaper ${key}`)
    resources[key] = Math.max(0, Math.min(1, value.resources[key]))
  }
  return { version: 1, animated: value.animated, cities, resources, weather: value.weather,
    crops: parseCropState(JSON.stringify(value.crops)), controls: parseLandscapeSettings(JSON.stringify(value.controls)) }
}
export function wallpaperRuntime(instance: string, runtime: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(instance) || !runtime.startsWith("/")) throw Error("Invalid wallpaper runtime")
  return `${runtime}/sysdef-wallpaper-${instance}`
}
