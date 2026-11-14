// Pure weather/astronomy boundary: no GI, network, or shell dependencies.
export type Season = "spring" | "summer" | "autumn" | "winter"
export type WeatherKind = "clear" | "cloudy" | "fog" | "rain" | "snow" | "storm"
export interface LandscapeEnvironment {
  season: Season; weather: WeatherKind; cloud: number; precip: number; wind: number
  windDirection: number; moonPhase: number; moonIllumination: number
  sunrise: number; sunset: number; temperature: number | null
  source: "wttr.in" | "fallback"; latitude: number
}
export interface WeatherObservation {
  observedAt: number; fetchedAt: number; latitude: number
  weather: WeatherKind; cloud: number; precip: number; wind: number; windDirection: number; temperature: number
  moonPhase: number; moonIllumination: number; astronomyDate: string
  sunrise: number | null; sunset: number | null
}
const DAY = 86400000, LUNATION = 29.530588853
const cycle = (n: number) => ((n % 1) + 1) % 1
const clamp = (n: number) => Math.max(0, Math.min(1, n))
const record = (v: unknown): Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {}
const first = (v: unknown) => record(Array.isArray(v) ? v[0] : undefined)
function numeric(v: unknown): number | null {
  if (typeof v !== "number" && (typeof v !== "string" || !v.trim())) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
function required(v: unknown, name: string, min: number, max: number): number {
  const n = numeric(v)
  if (n === null || n < min || n > max) throw Error(`Invalid wttr.in ${name}`)
  return n
}
function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}
function clock(value: unknown): number | null {
  if (typeof value !== "string") return null
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(value.trim())
  if (!m || +m[1] < 1 || +m[1] > 12 || +m[2] > 59) return null
  return +m[1] % 12 + (m[3].toUpperCase() === "PM" ? 12 : 0) + +m[2] / 60
}
const phases: Record<string, number> = { "new moon": 0, "waxing crescent": 0.125, "first quarter": 0.25, "waxing gibbous": 0.375, "full moon": 0.5, "waning gibbous": 0.625, "last quarter": 0.75, "third quarter": 0.75, "waning crescent": 0.875 }
const estimateMoon = (date: Date) => cycle((+date - Date.UTC(2000, 0, 6, 18, 14)) / DAY / LUNATION)
const illumination = (phase: number) => (1 - Math.cos(phase * 2 * Math.PI)) / 2
function kind(code: number): WeatherKind {
  if ([200, 386, 389, 392, 395].includes(code)) return "storm"
  if ([179, 182, 185, 227, 230, 281, 284, 311, 314, 317, 320, 323, 326, 329, 332, 335, 338, 350, 362, 365, 368, 371, 374, 377].includes(code)) return "snow"
  if ([143, 248, 260].includes(code)) return "fog"
  if ([176, 263, 266, 293, 296, 299, 302, 305, 308, 353, 356, 359].includes(code)) return "rain"
  if ([116, 119, 122].includes(code)) return "cloudy"
  if (code === 113) return "clear"
  throw Error("Unknown wttr.in weatherCode")
}
/** Reject broken current conditions; optional geolocation/astronomy degrade independently. */
export function parseWttr(json: unknown, now = new Date()): WeatherObservation {
  if (!Number.isFinite(+now)) throw Error("Invalid observation date")
  const root = record(json), current = first(root.current_condition)
  const code = required(current.weatherCode, "weatherCode", 100, 999)
  const weather = kind(code)
  const cloud = required(current.cloudcover, "cloudcover", 0, 100) / 100
  // Visual saturation: 8 mm precipitation and 80 km/h wind reach full intensity.
  const precip = clamp(required(current.precipMM, "precipMM", 0, 10000) / 8)
  const wind = clamp(required(current.windspeedKmph, "windspeedKmph", 0, 1000) / 80)
  const windDirection = required(current.winddirDegree, "winddirDegree", 0, 360) % 360
  const temperature = required(current.temp_C, "temp_C", -100, 70)
  const lat = numeric(first(root.nearest_area).latitude)
  const latitude = lat !== null && Math.abs(lat) <= 90 ? lat : 45
  const days = Array.isArray(root.weather) ? root.weather.map(record) : []
  const today = days.find(day => day.date === dayKey(now))
  const astronomy = first(today?.astronomy)
  const name = typeof astronomy.moon_phase === "string" ? astronomy.moon_phase.trim().toLowerCase() : ""
  const age = numeric(astronomy.moon_age), light = numeric(astronomy.moon_illumination)
  const namedPhase = phases[name]
  let moonPhase = namedPhase ?? (age !== null && age >= 0 && age <= 30 ? cycle(age / LUNATION) : estimateMoon(now))
  // Phase names cover multi-day spans. Use the reported illuminated area to
  // place the terminator within a crescent/gibbous span, not a fixed eighth.
  if (namedPhase !== undefined && namedPhase !== 0 && namedPhase !== 0.5 && light !== null && light >= 0 && light <= 100) {
    const waxing = Math.acos(1 - 2 * light / 100) / (2 * Math.PI)
    moonPhase = namedPhase > 0.5 ? cycle(1 - waxing) : waxing
  }
  let observedAt = +now
  if (typeof current.localObsDateTime === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}:\d{2}\s*[AP]M)$/i.exec(current.localObsDateTime.trim())
    const hour = m ? clock(m[4]) : null
    if (m && hour !== null) {
      const parsed = new Date(+m[1], +m[2] - 1, +m[3], Math.floor(hour), Math.round((hour % 1) * 60))
      if (dayKey(parsed) === `${m[1]}-${m[2]}-${m[3]}`) observedAt = +parsed
    }
  }
  const sunrise = clock(astronomy.sunrise), sunset = clock(astronomy.sunset)
  const validSun = sunrise !== null && sunset !== null && sunrise < sunset
  return { observedAt, fetchedAt: +now, latitude, weather, cloud, precip, wind, windDirection, temperature,
    moonPhase, moonIllumination: light !== null && light >= 0 && light <= 100 ? light / 100 : illumination(moonPhase),
    astronomyDate: dayKey(now), sunrise: validSun ? sunrise : null, sunset: validSun ? sunset : null }
}
/** Last good data stays stored, but never represents current weather beyond six hours. */
export function resolveEnvironment(date: Date, observation?: WeatherObservation | null): LandscapeEnvironment {
  const latitude = observation?.latitude ?? 45
  const month = (date.getMonth() + (latitude < 0 ? 6 : 0)) % 12
  const season: Season = month < 2 || month === 11 ? "winter" : month < 5 ? "spring" : month < 8 ? "summer" : "autumn"
  // Safe local-clock approximation, deliberately bounded away from polar singularities.
  const yearStart = new Date(date.getFullYear(), 0, 1)
  const day = (+date - +yearStart) / DAY
  const halfDay = 6 + 2.5 * Math.sin((day - 80) / 365.2425 * 2 * Math.PI) * Math.sin(latitude * Math.PI / 180)
  const fresh = observation && +date >= observation.observedAt - 5 * 60000 && +date - observation.observedAt <= 6 * 3600000 && +date >= observation.fetchedAt
  const moonPhase = fresh ? cycle(observation.moonPhase + (+date - observation.fetchedAt) / DAY / LUNATION) : estimateMoon(date)
  const sameDay = fresh && observation.astronomyDate === dayKey(date)
  return { season, latitude, weather: fresh ? observation.weather : "clear", cloud: fresh ? observation.cloud : 0.15,
    precip: fresh ? observation.precip : 0, wind: fresh ? observation.wind : 0.12, windDirection: fresh ? observation.windDirection : 270,
    temperature: fresh ? observation.temperature : null, source: fresh ? "wttr.in" : "fallback", moonPhase,
    moonIllumination: fresh ? clamp(observation.moonIllumination + illumination(moonPhase) - illumination(observation.moonPhase)) : illumination(moonPhase),
    sunrise: sameDay && observation.sunrise !== null ? observation.sunrise : 12 - halfDay,
    sunset: sameDay && observation.sunset !== null ? observation.sunset : 12 + halfDay }
}
