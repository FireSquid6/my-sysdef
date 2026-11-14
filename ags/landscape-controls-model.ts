import { advanceCrops, type CropState } from "./wallpaper-crops"
import type { LandscapeEnvironment, Season, WeatherKind } from "./wallpaper-weather"
export const SEASONS: Season[] = ["spring", "summer", "autumn", "winter"]
export const WEATHER: WeatherKind[] = ["clear", "cloudy", "fog", "rain", "snow", "storm"]
export const SLIDERS = [
  { key: "hour", label: "Time of day", min: 0, max: 23.99, step: 0.05 },
  { key: "season", label: "Season", min: 0, max: 3, step: 1 },
  { key: "weather", label: "Weather", min: 0, max: 5, step: 1 },
  { key: "moonPhase", label: "Moon phase", min: 0, max: 1, step: 0.01 },
  { key: "cloud", label: "Cloud cover", min: 0, max: 1, step: 0.01 },
  { key: "precip", label: "Precipitation", min: 0, max: 1, step: 0.01 },
  { key: "wind", label: "Wind", min: 0, max: 1, step: 0.01 },
  { key: "temperature", label: "Temperature", min: -20, max: 40, step: 1 },
  { key: "growth", label: "Crop growth", min: 0, max: 1, step: 0.01 },
  { key: "harvest", label: "Harvest progress", min: 0, max: 1, step: 0.01 },
  { key: "cpu", label: "River / mill speed", min: 0, max: 1, step: 0.01 },
] as const
export type SliderKey = typeof SLIDERS[number]["key"]
export type ManualLandscape = Record<SliderKey, number>
export type LandscapeSettings = { version: 1; sync: boolean; manual: ManualLandscape }
export const DEFAULT_LANDSCAPE: LandscapeSettings = { version: 1, sync: true, manual: { hour: 12, season: 1, weather: 0, moonPhase: 0.5, cloud: 0.15, precip: 0, wind: 0.12, temperature: 20, growth: 0.5, harvest: 0, cpu: 0 } }
const normalize = (key: SliderKey, value: number) => {
  const slider = SLIDERS.find(s => s.key === key)!
  const bounded = Math.max(slider.min, Math.min(slider.max, value))
  return key === "season" || key === "weather" || key === "temperature" ? Math.round(bounded) : bounded
}
export function parseLandscapeSettings(text: string): LandscapeSettings {
  const data = JSON.parse(text)
  if (!data || data.version !== 1 || typeof data.sync !== "boolean" || !data.manual || typeof data.manual !== "object") throw Error("Invalid landscape controls")
  const manual = { ...DEFAULT_LANDSCAPE.manual }
  for (const { key } of SLIDERS) {
    if (typeof data.manual[key] !== "number" || !Number.isFinite(data.manual[key])) throw Error(`Invalid landscape slider: ${key}`)
    manual[key] = normalize(key, data.manual[key])
  }
  return { version: 1, sync: data.sync, manual }
}
export function seedManual(date: Date, environment: LandscapeEnvironment, crops: CropState, cpu: number): ManualLandscape {
  const raw: ManualLandscape = { hour: date.getHours() + date.getMinutes() / 60, season: SEASONS.indexOf(environment.season), weather: WEATHER.indexOf(environment.weather), moonPhase: environment.moonPhase, cloud: environment.cloud, precip: environment.precip, wind: environment.wind, temperature: environment.temperature ?? 15, growth: crops.growth, harvest: crops.harvest, cpu }
  return Object.fromEntries(SLIDERS.map(({ key }) => [key, normalize(key, Number.isFinite(raw[key]) ? raw[key] : DEFAULT_LANDSCAPE.manual[key])])) as ManualLandscape
}
export function setManual(settings: LandscapeSettings, key: SliderKey, value: number): LandscapeSettings {
  if (settings.sync || !Number.isFinite(value) || !SLIDERS.some(s => s.key === key)) return settings
  const manual = { ...settings.manual, [key]: normalize(key, value) }
  if (key === "growth" && manual.growth < 1) manual.harvest = 0
  if (key === "harvest" && manual.harvest > 0) manual.growth = 1
  if (key === "weather") {
    manual.cloud = [0.1, 0.65, 0.85, 0.85, 0.8, 1][manual.weather]!
    manual.precip = manual.weather >= 3 ? 0.7 : 0
    if (manual.weather === 4) manual.temperature = -3
    else if (manual.temperature < 0) manual.temperature = 15
  }
  if (JSON.stringify(manual) === JSON.stringify(settings.manual)) return settings
  return { ...settings, manual }
}
export function manualScene(settings: LandscapeSettings, realDate: Date, liveEnvironment: LandscapeEnvironment, liveCrops: CropState) {
  if (settings.sync) return { date: realDate, environment: liveEnvironment, crops: liveCrops }
  const m = settings.manual, date = new Date(+realDate)
  date.setHours(Math.floor(m.hour), Math.floor(m.hour % 1 * 60), 0, 0)
  const season = SEASONS[m.season]!, weather = WEATHER[m.weather]!
  const environment: LandscapeEnvironment = { ...liveEnvironment, season, weather, cloud: m.cloud, precip: m.precip, wind: m.wind, temperature: m.temperature, moonPhase: m.moonPhase % 1, moonIllumination: (1 - Math.cos(m.moonPhase * 2 * Math.PI)) / 2, sunrise: [6, 5, 6.5, 7.5][m.season]!, sunset: [18.5, 20, 18, 17][m.season]! }
  const crops = { ...advanceCrops(null, new Date(2026, [3, 6, 9, 0][m.season]!, 15)), growth: season === "winter" ? 0 : m.growth, harvest: season === "winter" ? 0 : m.harvest }
  return { date, environment, crops }
}
export function sliderLabel(key: SliderKey, value: number) {
  if (key === "hour") { const minutes = Math.round(value * 60); return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}` }
  if (key === "season") return SEASONS[Math.round(value)]!
  if (key === "weather") return WEATHER[Math.round(value)]!
  if (key === "temperature") return `${Math.round(value)} °C`
  if (key === "moonPhase") return ["New", "Waxing crescent", "First quarter", "Waxing gibbous", "Full", "Waning gibbous", "Last quarter", "Waning crescent", "New"][Math.round(value * 8)]!
  return `${Math.round(value * 100)}%`
}
