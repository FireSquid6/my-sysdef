import { describe, expect, test } from "bun:test"
import { advanceCrops, cropPhase, cropSchedule, parseCropState } from "../ags/wallpaper-crops"
const date = (month: number, day = 1, year = 2026) => new Date(year, month - 1, day, 12)

describe("persistent yearly crop cycle", () => {
  test("rotates spring peas, summer wheat, autumn pumpkins and winter fallow", () => {
    for (const [month, day, crop, phase] of [[3, 1, "peas", "sowing"], [4, 15, "peas", "growing"], [5, 20, "peas", "ripe"], [5, 28, "peas", "harvesting"], [6, 1, "wheat", "sowing"], [8, 15, "wheat", "ripe"], [8, 25, "wheat", "harvesting"], [9, 1, "pumpkins", "sowing"], [11, 5, "pumpkins", "ripe"], [11, 20, "pumpkins", "harvesting"], [12, 15, "fallow", "fallow"], [1, 15, "fallow", "fallow"]] as const) {
      const state = advanceCrops(null, date(month, day))
      expect(state.crop).toBe(crop)
      expect(cropPhase(state)).toBe(phase)
      expect(parseCropState(JSON.stringify(state))).toEqual(state)
    }
  })
  test("grows with elapsed calendar time and catches up after offline restarts", () => {
    const seed = advanceCrops(null, date(3))
    const saved = parseCropState(JSON.stringify(advanceCrops(seed, date(4))))
    expect(saved.growth).toBeGreaterThan(seed.growth)
    const grown = advanceCrops(saved, date(5, 20))
    expect(grown.growth).toBe(1)
    expect(grown.harvest).toBe(0)
    const harvested = advanceCrops(grown, date(5, 28))
    expect(harvested.harvest).toBeGreaterThan(0)
    expect(harvested.harvest).toBeLessThan(1)
    expect(advanceCrops(harvested, date(5, 30)).harvest).toBeGreaterThan(harvested.harvest)
  })
  test("harvest ends at the next sowing, missed years never replay stale harvests", () => {
    const wheat = advanceCrops(null, date(8, 31))
    expect(wheat.harvest).toBeGreaterThan(0.9)
    const pumpkin = advanceCrops(wheat, new Date(2026, 8, 1))
    expect(pumpkin).toMatchObject({ crop: "pumpkins", growth: 0, harvest: 0 })
    const future = advanceCrops(pumpkin, date(7, 1, 2029))
    expect(future.crop).toBe("wheat")
    expect(future.cycle).toBe("2029-north-wheat")
    expect(future.growth).toBeGreaterThan(0)
    expect(future.harvest).toBe(0)
  })
  test("shifts the full annual schedule six months in the southern hemisphere", () => {
    expect(advanceCrops(null, date(10), -35).crop).toBe("peas")
    expect(advanceCrops(null, date(1), -35).crop).toBe("wheat")
    expect(advanceCrops(null, date(4), -35).crop).toBe("pumpkins")
    expect(advanceCrops(null, date(7), -35).crop).toBe("fallow")
    const south = advanceCrops(null, date(1), -35)
    expect(south.hemisphere).toBe("south")
    expect(parseCropState(JSON.stringify(south))).toEqual(south)
  })
  test("handles leap years, year boundaries, and clock rollback without ungrowing", () => {
    const winter = advanceCrops(null, date(12, 31, 2027))
    expect(advanceCrops(winter, date(2, 29, 2028)).cycle).toBe(winter.cycle)
    expect(advanceCrops(winter, date(3, 1, 2028)).crop).toBe("peas")
    const grown = advanceCrops(null, date(5, 28))
    expect(advanceCrops(grown, date(4))).toEqual(grown)
    expect(advanceCrops(grown, date(4, 1, 2025))).toEqual(grown)
    expect(() => cropSchedule(new Date(NaN))).toThrow()
    expect(() => advanceCrops(grown, new Date(NaN))).toThrow()
  })
  test("validates saved progress and rejects unknown versions, corruption and impossible states", () => {
    const valid = advanceCrops(null, date(4))
    for (const bad of [null, {}, { ...valid, version: 2 }, { ...valid, growth: -1 }, { ...valid, growth: 2 }, { ...valid, growth: null }, { ...valid, updatedAt: "today" }, { ...valid, updatedAt: 1e20 }, { ...valid, crop: "corn" }, { ...valid, cycle: "2025-north-peas" }, { ...valid, harvest: 0.5 }, { ...valid, hemisphere: "unknown" }]) expect(() => parseCropState(JSON.stringify(bad))).toThrow()
    expect(() => parseCropState("not json")).toThrow()
  })
})
