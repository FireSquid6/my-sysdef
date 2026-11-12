// Pure menu decisions: no GI imports and no side effects.
export function filterItems<T extends { title: string; detail?: string }>(items: T[], query: string): T[] {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return items.filter(item => words.every(word => `${item.title} ${item.detail ?? ""}`.toLocaleLowerCase().includes(word)));
}

export function moveSelection(index: number, direction: number, count: number): number {
  return count ? ((index + direction) % count + count) % count : -1;
}

export function projectName(name: string): string {
  if (!name || name === "." || name === ".." || name.startsWith("-") || /[\/\x00-\x1f\x7f]/.test(name))
    throw new Error("Invalid project directory name");
  return name;
}

export function focusWindowArgs(address: string): string[] {
  if (!/^0x[0-9a-f]+$/i.test(address)) throw new Error("Invalid window address");
  return ["hyprctl", "eval", `local r = hl.dispatch(hl.dsp.focus({ window = "address:${address}" })); if r and not r.ok then error(r.message or "Focus failed") end`];
}

export type PowerAction = "suspend" | "logout" | "reboot" | "shutdown";
export function confirmPower(pending: PowerAction | null, action: PowerAction): { pending: PowerAction | null; execute: boolean } {
  const execute = action === "suspend" || pending === action;
  return { pending: execute ? null : action, execute };
}
export function powerArgs(action: PowerAction): string[] {
  switch (action) {
    case "suspend": return ["systemctl", "suspend"];
    case "logout": return ["hyprctl", "eval", "hl.dispatch(hl.dsp.exit())"];
    case "reboot": return ["systemctl", "reboot"];
    case "shutdown": return ["systemctl", "poweroff"];
  }
}

export function cycleAssignment(current: string | null, monitors: string[], direction: number): string | null {
  const choices = [null, ...monitors];
  return choices[moveSelection(Math.max(0, choices.indexOf(current)), direction, choices.length)] ?? null;
}

export function savedConnections(output: string): Array<{ uuid: string; name: string; type: string }> {
  return output.split("\n").filter(Boolean).map(line => {
    const parts = [""];
    let escaped = false;
    for (const char of line) {
      if (escaped) { parts[parts.length - 1] += char; escaped = false; }
      else if (char === "\\") escaped = true;
      else if (char === ":") parts.push("");
      else parts[parts.length - 1] += char;
    }
    return { uuid: parts[0] ?? "", name: parts[1] ?? "", type: parts[2] ?? "" };
  }).filter(item => item.uuid && item.name);
}
