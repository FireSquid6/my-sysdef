/** Local-calendar farming, independent of frame rate, machine load and uptime. */
export type CropKind = "peas" | "wheat" | "pumpkins" | "fallow"
export type CropState = {
  version: 1; hemisphere: "north" | "south"; cycle: string; crop: CropKind
  growth: number; harvest: number; updatedAt: number
}
export type CropPhase = "fallow" | "sowing" | "growing" | "ripe" | "harvesting"
const clamp = (n: number) => Math.max(0, Math.min(1, n))

export function cropSchedule(date: Date, latitude = 45) {
  if (!Number.isFinite(+date)) throw Error("Invalid crop date")
  const hemisphere = latitude < 0 ? "south" as const : "north" as const
  const shift = hemisphere === "south" ? 6 : 0
  const year = date >= new Date(date.getFullYear(), 2 + shift, 1) ? date.getFullYear() : date.getFullYear() - 1
  const at = (month: number, day: number) => +new Date(year, month + shift, day)
  const seasons = [
    { crop: "peas", start: at(2, 1), ripe: at(4, 18), harvest: at(4, 25), end: at(5, 1) },
    { crop: "wheat", start: at(5, 1), ripe: at(7, 13), harvest: at(7, 20), end: at(8, 1) },
    { crop: "pumpkins", start: at(8, 1), ripe: at(10, 3), harvest: at(10, 10), end: at(11, 1) },
    { crop: "fallow", start: at(11, 1), ripe: at(14, 1), harvest: at(14, 1), end: at(14, 1) },
  ] as const
  const season = seasons.find(s => +date >= s.start && +date < s.end)!
  return { ...season, hemisphere, cycle: `${year}-${hemisphere}-${season.crop}` }
}

/** A new installation joins today's season. Saved growth never runs backwards;
 * elapsed calendar time catches up across shutdown, suspension and skipped years.
 */
export function advanceCrops(previous: CropState | null, date: Date, latitude = 45): CropState {
  if (!Number.isFinite(+date)) throw Error("Invalid crop date")
  if (previous && +date < previous.updatedAt) return previous
  const season = cropSchedule(date, latitude)
  const same = previous?.cycle === season.cycle
  const growth = season.crop === "fallow" ? 0 : clamp((+date - season.start) / (season.ripe - season.start))
  const harvest = season.crop === "fallow" ? 0 : clamp((+date - season.harvest) / (season.end - season.harvest))
  return { version: 1, hemisphere: season.hemisphere, cycle: season.cycle, crop: season.crop,
    growth: Math.max(growth, same ? previous.growth : 0), harvest: Math.max(harvest, same ? previous.harvest : 0), updatedAt: +date }
}
export function cropPhase(state: CropState): CropPhase {
  return state.crop === "fallow" ? "fallow" : state.harvest > 0 ? "harvesting" : state.growth >= 1 ? "ripe" : state.growth < 0.12 ? "sowing" : "growing"
}
export function parseCropState(text: string): CropState {
  const s = JSON.parse(text)
  if (!s || typeof s !== "object" || s.version !== 1 || !["north", "south"].includes(s.hemisphere)
    || !["peas", "wheat", "pumpkins", "fallow"].includes(s.crop)
    || ![s.growth, s.harvest].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1)
    || typeof s.updatedAt !== "number" || !Number.isFinite(s.updatedAt) || !Number.isFinite(+new Date(s.updatedAt))) throw Error("Invalid crop state")
  const season = cropSchedule(new Date(s.updatedAt), s.hemisphere === "south" ? -45 : 45)
  if (s.cycle !== season.cycle || s.crop !== season.crop || (s.crop === "fallow" && (s.growth !== 0 || s.harvest !== 0))
    || (s.harvest > 0 && s.growth !== 1)) throw Error("Inconsistent crop state")
  return { version: 1, hemisphere: s.hemisphere, cycle: s.cycle, crop: s.crop, growth: s.growth, harvest: s.harvest, updatedAt: s.updatedAt }
}
