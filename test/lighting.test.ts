import { expect, test } from "bun:test"
import { createLightingModel, EMPTY_LIGHTING, lightingLabel, parseLightingStatus, type LightingState } from "../ags/lighting-model"

const snapshot = (mode = "tokyonight", complete = true, error: string | null = null) => JSON.stringify({ mode, complete, error })
function fixture() {
  let current = snapshot(), calls = 0
  let state = { ...EMPTY_LIGHTING }
  let apply = async () => { current = snapshot("ghost") }
  const model = createLightingModel({ status: async () => current, toggle: async () => { calls++; await apply() } }, next => { state = next })
  return { model, state: () => state, calls: () => calls, status: (value: string) => { current = value }, apply: (fn: () => Promise<void>) => { apply = fn } }
}

test("parses local status, rejects invalid controller output", () => {
  expect(parseLightingStatus(snapshot())).toEqual({ mode: "tokyonight", complete: true, error: "" })
  expect(parseLightingStatus(snapshot("unknown", false, "interrupted"))).toMatchObject({ mode: "unknown", error: "interrupted" })
  for (const invalid of ["", "null", "[]", "{}", snapshot("bogus"), snapshot("unknown", true), '{"mode":"ghost","complete":"yes","error":null}']) {
    expect(() => parseLightingStatus(invalid)).toThrow()
  }
})

test("labels unknown, working, complete, and partial modes honestly", () => {
  expect(lightingLabel(EMPTY_LIGHTING)).toBe("Lighting: Unknown")
  expect(lightingLabel({ ...EMPTY_LIGHTING, busy: true })).toBe("Lighting: Working…")
  expect(lightingLabel({ ...EMPTY_LIGHTING, mode: "tokyonight", complete: true })).toBe("Lighting: Tokyo Night")
  expect(lightingLabel({ ...EMPTY_LIGHTING, mode: "ghost", complete: true })).toBe("Lighting: Ghost")
  expect(lightingLabel({ ...EMPTY_LIGHTING, mode: "ghost" })).toBe("Lighting: Ghost (partial)")
})

test("refresh reads without applying anything; toggle reads back the new state", async () => {
  const f = fixture()
  await f.model.refresh()
  expect(f.calls()).toBe(0)
  expect(f.state()).toEqual({ mode: "tokyonight", complete: true, busy: false, error: "" })
  await f.model.toggle()
  expect(f.calls()).toBe(1)
  expect(f.state()).toEqual({ mode: "ghost", complete: true, busy: false, error: "" })
})

test("duplicate activations and refresh cannot overlap an application", async () => {
  const f = fixture()
  let release!: () => void
  f.apply(() => new Promise<void>(resolve => { release = resolve }))
  const pending = f.model.toggle()
  expect(f.state().busy).toBe(true)
  await f.model.toggle()
  await f.model.refresh()
  expect(f.calls()).toBe(1)
  release()
  await pending
  expect(f.state().busy).toBe(false)
})

test("application failure rereads partial state and exposes the command error", async () => {
  const f = fixture()
  await f.model.refresh()
  f.apply(async () => {
    f.status(snapshot("unknown", false, "partial application"))
    throw Error("Mouse write failed")
  })
  await f.model.toggle()
  expect(f.state()).toMatchObject({ mode: "unknown", complete: false, busy: false })
  expect(f.state().error).toContain("Mouse write failed")
})

test("unreadable status after failure never preserves a stale success label", async () => {
  const f = fixture()
  await f.model.refresh()
  f.apply(async () => { f.status("corrupt"); throw Error("controller stopped") })
  await f.model.toggle()
  expect(f.state()).toMatchObject({ mode: "unknown", complete: false, busy: false })
  expect(f.state().error).toContain("controller stopped")
})

test("invalid refresh reports unknown; a successful refresh recovers", async () => {
  const f = fixture()
  f.status("corrupt")
  await f.model.refresh()
  expect(f.state().mode).toBe("unknown")
  expect(f.state().error).not.toBe("")
  f.status(snapshot("ghost"))
  await f.model.refresh()
  expect(f.state()).toMatchObject({ mode: "ghost", error: "", busy: false })
})

test("stopped model ignores outstanding completion and new operations", async () => {
  const states: LightingState[] = []
  let release!: (value: string) => void, writes = 0
  const model = createLightingModel({ status: () => new Promise(resolve => { release = resolve }), toggle: async () => { writes++ } }, state => states.push(state))
  const pending = model.refresh()
  model.stop()
  const count = states.length
  release(snapshot())
  await pending
  await model.toggle()
  await model.refresh()
  expect(states.length).toBe(count)
  expect(writes).toBe(0)
})
