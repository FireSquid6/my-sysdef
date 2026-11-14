/** wttr-compatible private endpoint; always send a location, never proxy IP lookup. */
export const WEATHER_ENDPOINT = "https://minibox-one.trex-city.ts.net:10443"
export const DEFAULT_WEATHER_LOCATION = "Austin"
export function weatherLocation(value?: string | null): string {
  const location = value?.trim()
  if (!location || location.length > 160 || /[\u0000-\u001f\u007f]/.test(location)) return DEFAULT_WEATHER_LOCATION
  try { encodeURIComponent(location); return location } catch { return DEFAULT_WEATHER_LOCATION }
}
export function weatherURL(location?: string | null): string {
  return `${WEATHER_ENDPOINT}/${encodeURIComponent(weatherLocation(location))}?format=j1`
}
