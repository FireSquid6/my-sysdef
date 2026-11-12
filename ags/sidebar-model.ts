// Pure, allowlisted view models: never retain raw Tailscale status or credentials.
export type CpuSample = { total: number; idle: number };
export function parseCpu(text: string): CpuSample | null {
  const line = text.split("\n").find(line => /^cpu\s/.test(line));
  const values = line?.trim().split(/\s+/).slice(1, 9).map(Number);
  if (!values || values.length < 4 || values.some(n => !Number.isFinite(n) || n < 0)) return null;
  return { total: values.reduce((a, b) => a + b, 0), idle: values[3]! + (values[4] ?? 0) };
}
export function cpuDelta(previous: CpuSample | null, current: CpuSample | null): number | null {
  if (!previous || !current) return null;
  const total = current.total - previous.total, idle = current.idle - previous.idle;
  return total > 0 && idle >= 0 && idle <= total ? (total - idle) / total * 100 : null;
}
export function parseMemory(text: string): { total: number; used: number } | null {
  const read = (key: string) => { const match = text.match(new RegExp(`^${key}:\\s+(\\d+)\\s+kB$`, "m")); return match ? Number(match[1]) * 1024 : NaN; };
  const total = read("MemTotal"), available = read("MemAvailable");
  return Number.isFinite(total) && Number.isFinite(available) && total > 0 && available >= 0 && available <= total ? { total, used: total - available } : null;
}
export function formatBytes(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value) || value < 0) return "Unavailable";
  const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
  const exponent = value ? Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024))) : 0;
  return `${(value / 1024 ** exponent).toFixed(exponent ? 1 : 0)} ${units[exponent]}`;
}
export type TailDevice = { id: string; name: string; os: string; self: boolean; online: boolean; ips: string[]; connection: string; lastSeen: string; rx?: number; tx?: number; exitNode: boolean };
export type Tailnet = { status: string; devices: TailDevice[]; health: string[] };
/** Prefer the familiar Tailscale IPv4 address, otherwise the first daemon-supplied IP. */
export function deviceIP(device: Pick<TailDevice, "ips">): string | null {
  return device.ips.find(ip => /^\d+\.\d+\.\d+\.\d+$/.test(ip)) ?? device.ips[0] ?? null;
}
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value : "";
const strings = (value: unknown) => Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
const bytes = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
export function normalizeTailnet(input: unknown): Tailnet {
  const raw = record(input), state = text(raw.BackendState);
  const devices = new Map<string, TailDevice>();
  function add(value: unknown, self: boolean, fallback: string) {
    const d = record(value);
    if (!Object.keys(d).length) return;
    const id = text(d.ID) || fallback;
    if (devices.has(id)) return;
    devices.set(id, { id, name: text(d.HostName) || text(d.DNSName).replace(/\.$/, "") || "Unnamed device", os: text(d.OS) || "Unknown OS", self,
      online: d.Online === true, ips: strings(d.TailscaleIPs).length ? strings(d.TailscaleIPs) : self ? strings(raw.TailscaleIPs) : [],
      connection: text(d.CurAddr) ? "Direct" : d.Active === true && text(d.Relay) ? "Relay" : "Idle",
      lastSeen: text(d.LastSeen), rx: bytes(d.RxBytes), tx: bytes(d.TxBytes), exitNode: d.ExitNode === true });
  }
  add(raw.Self, true, "self");
  for (const [key, value] of Object.entries(record(raw.Peer))) add(value, false, key);
  return { status: state === "Running" ? "Connected" : state === "NeedsLogin" ? "Tailscale login required" : state ? `Tailscale ${state}` : "Invalid Tailscale status",
    devices: [...devices.values()].sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)), health: strings(raw.Health) };
}
