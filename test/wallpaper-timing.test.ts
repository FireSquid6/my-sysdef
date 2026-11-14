import { expect, test } from "bun:test"
import { nextFrameDeadline } from "../ags/wallpaper-timing"
test("rounded 60 Hz presentation ticks maintain 30 FPS without deadline drift", () => {
  for (const hz of [60, 59.94, 120, 144]) {
    let deadline = 0, frames = 0
    for (let tick = 0; tick < hz * 10; tick++) {
      const now = Math.round(tick / hz * 1e6) / 1e6
      const next = nextFrameDeadline(now, deadline)
      if (next !== null) { deadline = next; frames++ }
    }
    expect(frames).toBeGreaterThanOrEqual(299)
    expect(frames).toBeLessThanOrEqual(301)
  }
})
test("missed frames and suspend discard backlog without catch-up bursts", () => {
  expect(nextFrameDeadline(100, 1)).toBeCloseTo(100 + 1 / 30)
  expect(nextFrameDeadline(100, 100 + 1 / 30)).toBeNull()
  expect(nextFrameDeadline(100 + 1 / 60, 100 + 1 / 30)).toBeNull()
  expect(nextFrameDeadline(100 + 1 / 30, 100 + 1 / 30)).toBeCloseTo(100 + 2 / 30)
})
