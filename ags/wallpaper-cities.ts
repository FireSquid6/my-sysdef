import { normalizeTailnet } from "./sidebar-model"

export const CITY_MACHINES = ["minibox-one", "deisslaptop", "desktop"] as const
export type CityMachine = typeof CITY_MACHINES[number]
export type CityActivity = Record<CityMachine, boolean>
export const INACTIVE_CITIES: CityActivity = { "minibox-one": false, deisslaptop: false, desktop: false }
export function cityMachine(hostname: string): CityMachine | undefined {
  const name = hostname.toLowerCase().split(".")[0]
  return name === "kotoko" ? "desktop" : CITY_MACHINES.find(machine => machine === name)
}
export function localCities(hostname: string): CityActivity {
  const result = { ...INACTIVE_CITIES }, self = cityMachine(hostname)
  if (self) result[self] = true
  return result
}
/** Probe actual tailnet reachability, not the daemon's cached Online flag. */
export async function sampleCities(hostname: string, run: (argv: string[]) => Promise<string>): Promise<CityActivity> {
  const result = localCities(hostname)
  try {
    const tailnet = normalizeTailnet(JSON.parse(await run(["timeout", "5", "tailscale", "status", "--json"])))
    const self = tailnet.devices.find(device => device.self)
    const machine = self && cityMachine(self.name)
    if (machine) result[machine] = true
  } catch { /* Local hostname still identifies this machine when Tailscale is unavailable. */ }
  await Promise.all(CITY_MACHINES.map(async machine => {
    if (result[machine]) return
    try {
      await run(["timeout", "5", "tailscale", "ping", "--c=1", "--timeout=3s", "--until-direct=false", machine])
      result[machine] = true
    } catch { result[machine] = false }
  }))
  return result
}
