import { spawn } from "node:child_process"
import { Plugin } from "@opencode/plugin"

function notify(summary: string, body: string, urgency = "normal") {
  const child = spawn(
    "notify-send",
    ["--app-name=OpenCode", `--urgency=${urgency}`, summary, body],
    { stdio: "ignore" },
  )
  child.on("error", () => {})
  child.unref()
}

export default Plugin.define({
  id: "desktop-notifications",
  setup(ctx) {
    const projectName = ctx.location.directory.split("/").filter(Boolean).at(-1) ?? ctx.location.directory
    const controller = new AbortController()

    void (async () => {
      for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
        if (event.type === "session.idle") {
          const session = await ctx.session.get({ sessionID: event.data.sessionID }).catch(() => undefined)
          if (session?.parentID) continue
          notify("OpenCode is ready", `${projectName}: task finished`)
          continue
        }

        if (event.type === "permission.asked") {
          notify("OpenCode needs permission", `${projectName}: ${event.data.action}`)
          continue
        }

        if (event.type === "form.created") {
          notify("OpenCode has a question", `${projectName}: ${event.data.form.title}`)
        }
      }
    })().catch((error) => {
      if (!controller.signal.aborted) console.error("OpenCode notification plugin failed", error)
    })

    return () => controller.abort()
  },
})
