import { createState } from "ags"
import GLib from "gi://GLib?version=2.0"
import { run } from "./controller"
import { createLightingModel, EMPTY_LIGHTING } from "../lighting-model"

/** Opt-in via an executable in local XDG config, never host checks or device IDs. */
export function createLightingService(enabled = true) {
  const executable = `${GLib.get_user_config_dir()}/sysdef/lighting/lighting.sh`
  if (!enabled || !GLib.file_test(executable, GLib.FileTest.IS_EXECUTABLE) || !GLib.file_test(executable, GLib.FileTest.IS_REGULAR)) return undefined
  const [state, setState] = createState({ ...EMPTY_LIGHTING })
  const model = createLightingModel({
    status: () => run(["timeout", "7", executable, "status"]),
    toggle: () => run(["timeout", "180", executable, "toggle"]),
  }, setState)
  return { state, ...model }
}
export type LightingService = NonNullable<ReturnType<typeof createLightingService>>
