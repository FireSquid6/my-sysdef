export type Status = "idle" | "working" | "blocked"

interface Sessions {
  family(id: string): string[]
  status(id: string): "idle" | "running"
  permission: { list(id: string): unknown[] | undefined }
  form: { list(id: string): unknown[] | undefined }
}

export function statusFor(sessionID: string | undefined, sessions: Sessions): Status {
  if (!sessionID) return "idle"
  const ids = [...new Set([sessionID, ...sessions.family(sessionID)])]
  if (ids.some((id) => sessions.permission.list(id)?.length || sessions.form.list(id)?.length)) {
    return "blocked"
  }
  return ids.some((id) => sessions.status(id) === "running") ? "working" : "idle"
}

export function reporter(write: (sequence: string) => void) {
  let previous: Status | undefined
  return {
    update(status: Status) {
      if (status === previous) return
      write(`\x1b]7501;state=${status}:app=opencode\x1b\\`)
      previous = status
    },
    clear() {
      write("\x1b]7501;state=clear\x1b\\")
      previous = undefined
    },
  }
}
