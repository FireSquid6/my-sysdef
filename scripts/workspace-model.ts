export const WORKSPACES = ["S", "G", "R", "N", ...Array.from({ length: 9 }, (_, i) => String(i + 1))];
export const ICONS: Record<string, string> = { S: "", G: "", R: "󰚩", N: "󰠮" };
export type Mode = "tiling" | "floating";
export interface Preferences { version: 1; primary: string | null; assignments: Record<string, string>; }
export interface Monitor {
  name: string; id: number; description?: string; focused?: boolean;
  x: number; y: number; width: number; height: number; scale: number; transform?: number;
  reserved?: number[]; activeWorkspace?: { name: string };
}
export interface Client {
  address: string; stableId?: string; class?: string; pid: number; floating: boolean; pinned?: boolean;
  workspace: { name: string }; monitor: number; at: number[]; size: number[]; tags: string[];
}
export interface Geometry { x: number; y: number; width: number; height: number; }
export const DEFAULT_PREFERENCES: Preferences = { version: 1, primary: null, assignments: {} };
export const selector = (name: string) => /^\d+$/.test(name) ? name : `name:${name}`;
export const isNumeric = (name: string) => /^[1-9]$/.test(name);
export const modeOf = (name: string, modes: Record<string, Mode>): Mode => isNumeric(name) ? modes[name] ?? "floating" : "tiling";

export function validatePreferences(value: unknown): Preferences {
  const p = value as Preferences;
  if (!p || p.version !== 1 || (p.primary !== null && typeof p.primary !== "string") || !p.assignments || typeof p.assignments !== "object" || Array.isArray(p.assignments)) throw new Error("Invalid monitor preferences");
  const validMonitor = (name: string) => /^[a-zA-Z0-9_.:-]+$/.test(name);
  if (p.primary !== null && !validMonitor(p.primary)) throw new Error("Invalid primary monitor name");
  for (const [workspace, monitor] of Object.entries(p.assignments)) {
    if (!WORKSPACES.includes(workspace) || typeof monitor !== "string" || !validMonitor(monitor)) throw new Error("Invalid workspace assignment");
  }
  return p;
}

export function allocation(monitors: Monitor[], preferences: Preferences, hostname: string) {
  if (!monitors.length) throw new Error("No active monitors found");
  const names = monitors.map(m => m.name).sort();
  const preferred = hostname.split(".")[0] === "deisslaptop" ? ["eDP-1", "DP-1"] : ["DP-1", "eDP-1"];
  const primary = names.find(n => n === preferences.primary) ?? preferred.find(n => names.includes(n)) ?? names[0];
  const others = names.filter(n => n !== primary);
  const numericMonitors = others.length ? others : [primary];
  const placements: Record<string, string> = {};
  for (const workspace of WORKSPACES) {
    const manual = preferences.assignments[workspace];
    placements[workspace] = manual ? names.includes(manual) ? manual : primary
      : isNumeric(workspace) ? numericMonitors[Math.floor((Number(workspace) - 1) * numericMonitors.length / 9)] : primary;
  }
  return { primary, placements };
}

export function geometryOf(client: Client): Geometry {
  return { x: client.at[0], y: client.at[1], width: client.size[0], height: client.size[1] };
}
export function floatingGeometry(monitor: Monitor, saved?: Geometry): Geometry {
  const rotated = (monitor.transform ?? 0) % 2 === 1;
  const width = (rotated ? monitor.height : monitor.width) / monitor.scale;
  const height = (rotated ? monitor.width : monitor.height) / monitor.scale;
  const [left, top, right, bottom] = monitor.reserved ?? [0, 0, 0, 0];
  const area = { x: monitor.x + left, y: monitor.y + top, width: Math.max(1, width - left - right), height: Math.max(1, height - top - bottom) };
  const w = Math.max(1, Math.min(saved?.width ?? 1200, area.width - Math.min(40, area.width / 10)));
  const h = Math.max(1, Math.min(saved?.height ?? 900, area.height - Math.min(40, area.height / 10)));
  return { width: Math.round(w), height: Math.round(h),
    x: Math.round(Math.max(area.x, Math.min(saved?.x ?? area.x + (area.width - w) / 2, area.x + area.width - w))),
    y: Math.round(Math.max(area.y, Math.min(saved?.y ?? area.y + (area.height - h) / 2, area.y + area.height - h))) };
}

// JSON strings are not Lua strings: escape bytes explicitly, including newlines and backslashes.
export function lua(value: unknown): string {
  if (value === null || value === undefined) return "nil";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (typeof value === "string") return '"' + value.replace(/[\\"\n\r\0]/g, c => ({ "\\": "\\\\", '"': '\\"', "\n": "\\n", "\r": "\\r", "\0": "\\000" })[c]!) + '"';
  if (Array.isArray(value)) return `{${value.map(lua).join(",")}}`;
  return `{${Object.entries(value as object).map(([k, v]) => `[${lua(k)}]=${lua(v)}`).join(",")}}`;
}
