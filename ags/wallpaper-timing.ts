/** Stable 30 Hz deadlines on presentation clocks rounded to microseconds.
 * Do not derive every deadline from a late tick: that drifts to 20 FPS on some
 * 60 Hz outputs. After a missed frame/suspend, drop backlog instead of bursting. */
export function nextFrameDeadline(now: number, deadline: number, period = 1 / 30): number | null {
  if (now + 0.0005 < deadline) return null
  return now - deadline >= period ? now + period : deadline + period
}
