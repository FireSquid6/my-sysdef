// Native process/pipe lifetime check. Child background stays hidden throughout.
import GLib from "gi://GLib?version=2.0"
import Gio from "gi://Gio?version=2.0"
import GdkPixbuf from "gi://GdkPixbuf?version=2.0"
import { createRoot } from "ags"
import { execAsync } from "ags/process"
import { createWallpaperRenderer } from "../services/wallpaper-renderer"
import { advanceCrops } from "../wallpaper-crops"
import { DEFAULT_LANDSCAPE } from "../landscape-controls-model"
import { wallpaperRuntime, type WallpaperFrame } from "../wallpaper-protocol"
const instance = GLib.getenv("SYSDEF_AGS_INSTANCE")!
if (!instance?.startsWith("sysdef-renderer-test-")) throw Error("Use wallpaper-renderer-smoke.sh")
const loop = new GLib.MainLoop(null, false)
const pause = () => new Promise<void>(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 40, () => { resolve(); return GLib.SOURCE_REMOVE }))
const repository = GLib.getenv("SYSDEF_ROOT_DIR")!
let failed = false
createRoot(dispose => {
  let packet: WallpaperFrame = { version: 1, animated: false, resources: { cpu: 0 }, crops: advanceCrops(null, new Date()), controls: DEFAULT_LANDSCAPE, weather: null }
  const disabled = createWallpaperRenderer(repository, () => packet, false)
  let attempts = 0, canceledAttempts = 0
  const renderer = createWallpaperRenderer(repository, () => packet, true, () => {
    if (++attempts === 1) throw Error("Simulated temporary spawn failure")
    return Gio.Subprocess.new(["ags", "run", `${repository}/ags/wallpaper-app.tsx`, "--gtk", "4"], Gio.SubprocessFlags.STDIN_PIPE)
  })
  const canceledRetry = createWallpaperRenderer(repository, () => packet, true, () => {
    canceledAttempts++; throw Error("Simulated canceled spawn failure")
  })
  async function status() {
    try { return JSON.parse(await execAsync(["ags", "request", "-i", `${instance}-wallpaper`, "status"])).value }
    catch { return null }
  }
  async function waitFor(check: () => Promise<boolean>) {
    for (let i = 0; i < 150; i++) { if (await check()) return; await pause() }
    throw Error("Timed out waiting for isolated renderer")
  }
  void (async () => {
    try {
      disabled.start()
      if (disabled.state().running) throw Error("Disabled instance spawned a renderer")
      canceledRetry.start(); canceledRetry.stop()
      renderer.start(); renderer.start()
      if (renderer.state().running || !renderer.state().error.includes("Simulated temporary")) throw Error("Spawn failure was not reported")
      await waitFor(async () => (await status())?.received >= 1)
      if (attempts !== 2 || canceledAttempts !== 1 || renderer.state().error) throw Error("Bounded spawn recovery/stop cancellation failed")
      const first = await status()
      if (first.animated || first.frames !== 0) throw Error("Test renderer became visible")
      packet = { ...packet, resources: { cpu: 0.7 } }
      await waitFor(async () => (await status())?.received >= 2)
      if (Gio.File.new_for_path(`${GLib.get_user_state_dir()}/sysdef/crops.json`).query_exists(null)) throw Error("Renderer wrote farm state")
      // Simulate lock/occlusion: no desktop window can draw in headless mode,
      // but the dedicated timer must keep producing valid opaque scene PNGs.
      const image = Gio.File.new_for_path(`${wallpaperRuntime(instance, GLib.get_user_runtime_dir())}/frame.png`)
      packet = { ...packet, animated: true }
      await waitFor(async () => image.query_exists(null))
      const pixbuf = GdkPixbuf.Pixbuf.new_from_file(image.get_path()!)
      if (pixbuf.get_has_alpha() || pixbuf.get_height() !== 270) throw Error("Lock feed is not a valid opaque native-resolution image")
      const hash = () => GLib.compute_checksum_for_data(GLib.ChecksumType.SHA256, image.load_contents(null)[1])
      const firstHash = hash()
      await waitFor(async () => hash() !== firstHash)
      if ((await status()).frames !== 0) throw Error("Headless lock export mapped a desktop window")
      packet = { ...packet, animated: false }
      await waitFor(async () => !image.query_exists(null))
      renderer.stop()
      await waitFor(async () => !(await status()))
      console.log("Wallpaper renderer smoke passed: isolated GTK process, scene streaming, spawn retry/stop cancellation, disabled mode, opaque animated PNG export without desktop frame callbacks, no preference writes and EOF shutdown. No windows shown; no locking.")
    } catch (error) { failed = true; console.error(error) }
    finally { disabled.stop(); canceledRetry.stop(); renderer.stop(); dispose(); loop.quit() }
  })()
})
loop.run()
if (failed) throw Error("Wallpaper renderer smoke failed")
