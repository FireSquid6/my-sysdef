import Gio from "gi://Gio?version=2.0"
import { createState } from "ags"
import { execAsync } from "ags/process"
import { readFile } from "ags/file"

export interface DesktopStatus {
  version?: number
  primary: string
  primaryAssignment: string | null
  monitors: Array<{ name: string; focused?: boolean; [key: string]: any }>
  workspaces: Array<{ name: string; monitor: string; assignment: string | null; mode: "tiling" | "floating"; icon: string; active: boolean; occupied: boolean }>
  clients: Array<{ address: string; title?: string; class?: string; workspace: { name: string }; monitor?: number; focusHistoryID?: number; [key: string]: any }>
}

export const EMPTY_DESKTOP: DesktopStatus = { primary: "", primaryAssignment: null, monitors: [], workspaces: [], clients: [] }
export const run = (argv: string[]) => execAsync(argv)

/** One file watcher per shell, not a Bun/hyprctl subprocess per widget or interval. */
export function createController(root: string, report: (error: unknown) => void) {
  const [desktop, setDesktop] = createState<DesktopStatus>(EMPTY_DESKTOP)
  const [error, setError] = createState("")
  let watcher: Gio.FileMonitor | undefined
  let stopped = false
  const fail = (e: unknown) => { setError(String(e)); report(e) }
  async function controller(command: string, ...args: string[]): Promise<DesktopStatus> {
    const value = JSON.parse(await run(["bun", `${root}/scripts/workspace-manager.ts`, command, ...args])) as DesktopStatus
    setDesktop(value)
    return value
  }
  async function start() {
    try {
      const runtime = (await run(["bun", `${root}/scripts/workspace-manager.ts`, "runtime"])).trim()
      if (stopped) return
      const refresh = () => {
        try {
          const data = JSON.parse(readFile(`${runtime}/desktop.json`)) as DesktopStatus
          if (data.version !== 1 || !Array.isArray(data.monitors) || !Array.isArray(data.workspaces) || !Array.isArray(data.clients)) throw Error("Unsupported desktop controller snapshot")
          setDesktop(data); setError("")
        } catch (e) { fail(e) }
      }
      watcher = Gio.File.new_for_path(runtime).monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, null)
      watcher.connect("changed", (_watcher, file, other) => {
        if (file.get_basename() === "desktop.json" || other?.get_basename() === "desktop.json") refresh()
      })
      refresh()
    } catch (e) { fail(e) }
  }
  return { desktop, error, controller, start, stop() { stopped = true; watcher?.cancel() } }
}
