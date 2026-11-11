import { describe, expect, test } from "bun:test"
import { reporter, statusFor } from "./state"

function sessions() {
  const running = new Set<string>()
  const permissions = new Set<string>()
  const forms = new Set<string>()
  return {
    running, permissions, forms,
    family: () => ["parent", "child"],
    status: (id: string): "idle" | "running" => running.has(id) ? "running" : "idle",
    permission: { list: (id: string) => permissions.has(id) ? [{}] : [] },
    form: { list: (id: string) => forms.has(id) ? [{}] : [] },
  }
}

describe("Herdr status", () => {
  test("follows the displayed conversation and its helpers, not unrelated work", () => {
    const data = sessions()
    data.running.add("unrelated")
    expect(statusFor("parent", data)).toBe("idle")
    data.running.add("child")
    expect(statusFor("parent", data)).toBe("working")
    expect(statusFor(undefined, data)).toBe("idle")
    data.running.clear()
    expect(statusFor("parent", data)).toBe("idle")
  })

  test("pending permissions and questions override working until resolved", () => {
    const data = sessions()
    data.running.add("parent")
    data.permissions.add("child")
    expect(statusFor("parent", data)).toBe("blocked")
    data.permissions.clear()
    data.forms.add("parent")
    expect(statusFor("parent", data)).toBe("blocked")
    data.forms.clear()
    expect(statusFor("parent", data)).toBe("working")
  })

  test("encodes OSC 7501, suppresses duplicate states, and clears on cleanup", () => {
    const writes: string[] = []
    const status = reporter((text) => writes.push(text))
    status.update("idle")
    status.update("idle")
    status.update("working")
    status.update("blocked")
    status.update("idle")
    status.clear()
    expect(writes).toEqual([
      "\x1b]7501;state=idle:app=opencode\x1b\\",
      "\x1b]7501;state=working:app=opencode\x1b\\",
      "\x1b]7501;state=blocked:app=opencode\x1b\\",
      "\x1b]7501;state=idle:app=opencode\x1b\\",
      "\x1b]7501;state=clear\x1b\\",
    ])
  })
})
