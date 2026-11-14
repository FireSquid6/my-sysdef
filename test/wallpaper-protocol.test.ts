import { expect, test } from "bun:test"
import { parseWallpaperFrame, wallpaperRuntime, type WallpaperFrame } from "../ags/wallpaper-protocol"
import { advanceCrops } from "../ags/wallpaper-crops"
import { DEFAULT_LANDSCAPE } from "../ags/landscape-controls-model"
const snapshot: WallpaperFrame = { version: 1, animated: true, resources: { cpu: 0.4 }, crops: advanceCrops(null, new Date(2026, 6, 15)), controls: DEFAULT_LANDSCAPE, weather: null }
test("isolated renderer receives scene state without owning mutable preferences", () => {
  expect(parseWallpaperFrame(JSON.stringify(snapshot))).toEqual(snapshot)
  expect(parseWallpaperFrame(JSON.stringify({ ...snapshot, resources: { cpu: 4 } })).resources.cpu).toBe(1)
  for (const value of [null, {}, { ...snapshot, version: 2 }, { ...snapshot, animated: "yes" }, { ...snapshot, resources: { cpu: null } }, { ...snapshot, crops: {} }, { ...snapshot, controls: {} }, { ...snapshot, weather: {} }]) expect(() => parseWallpaperFrame(JSON.stringify(value))).toThrow()
  expect(() => parseWallpaperFrame(" ".repeat(65537))).toThrow()
})
test("runtime filenames cannot escape the session's private directory", () => {
  expect(wallpaperRuntime("sysdef-test", "/run/user/1000")).toBe("/run/user/1000/sysdef-wallpaper-sysdef-test")
  expect(() => wallpaperRuntime("../another", "/run/user/1000")).toThrow()
  expect(() => wallpaperRuntime("sysdef", "relative")).toThrow()
})
