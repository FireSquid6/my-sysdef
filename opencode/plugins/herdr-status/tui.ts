import { writeSync } from "node:fs"
import { isatty } from "node:tty"
import { Plugin } from "@opencode/plugin/tui"
import { createEffect, untrack } from "solid-js"
import { reporter, statusFor } from "./state"

export default Plugin.define({
  id: "herdr-status",
  setup(ctx) {
    if (!isatty(1)) return

    // Bypass OpenTUI's stdout capture: these are terminal control messages,
    // not transcript text. Never send them from the background server.
    const status = reporter((sequence) => {
      try { writeSync(1, sequence) } catch { /* A closing terminal must not break OpenCode. */ }
    })
    const remove = ctx.ui.slot({
      append: "app",
      render() {
        createEffect(() => {
          const route = ctx.ui.router.current()
          const id = route.type === "session" ? route.sessionID : undefined
          status.update(statusFor(id, ctx.data.session))
        })
        createEffect(() => {
          const route = ctx.ui.router.current()
          if (route.type !== "session") return
          const ids = [...new Set([route.sessionID, ...ctx.data.session.family(route.sessionID)])]
          // Hydrate pending prompts when attaching to an existing conversation.
          untrack(() => {
            for (const id of ids) {
              void Promise.all([
                ctx.data.session.permission.sync(id),
                ctx.data.session.form.sync(id),
              ]).catch(() => {})
            }
          })
        })
        return null
      },
    })
    return () => {
      remove()
      status.clear()
    }
  },
})
