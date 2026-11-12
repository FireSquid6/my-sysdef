// Read-only host integration: no GTK application, menus, or network mutations.
import GLib from "gi://GLib?version=2.0"
import Gio from "gi://Gio?version=2.0"
import { execAsync } from "ags/process"
import { createResourceSampler } from "../services/resources"
import { normalizeTailnet } from "../sidebar-model"
const loop = new GLib.MainLoop(null, false)
let failure = false
const sampler = createResourceSampler()
void (async () => {
  try {
    const cancellation = new Gio.Cancellable()
    await sampler.sample(cancellation)
    await new Promise<void>(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => { resolve(); return GLib.SOURCE_REMOVE }))
    const resources = await sampler.sample(cancellation)
    if (resources.error || Object.values(resources).some(value => /unavailable|sampling|loading/i.test(value))) throw Error("A native system resource could not be sampled")
    const tailnet = normalizeTailnet(JSON.parse(await execAsync(["timeout", "4", "tailscale", "status", "--json"])))
    if (tailnet.status.startsWith("Invalid")) throw Error("Invalid Tailscale response")
    console.log(`Resource smoke passed: CPU, RAM, load, disk; Tailscale ${tailnet.status.toLowerCase()}, ${tailnet.devices.length} devices. No device identifiers logged.`)
  } catch (error) { console.error(error); failure = true }
  finally { loop.quit() }
})()
loop.run()
if (failure) throw Error("Read-only resource smoke failed")
