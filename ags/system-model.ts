/** Parse nmcli -t fields without treating escaped colons/backslashes as separators. */
export function nmFields(line: string): string[] {
  const fields = [""]
  let escaped = false
  for (const char of line) {
    if (escaped) { fields[fields.length - 1] += char; escaped = false }
    else if (char === "\\") escaped = true
    else if (char === ":") fields.push("")
    else fields[fields.length - 1] += char
  }
  return fields
}
export function networkLabel(text: string): string {
  const connected = text.trim().split("\n").map(nmFields).filter(row => row[1] === "connected")
  const device = connected.find(row => row[0] === "wifi") ?? connected.find(row => row[0] === "ethernet")
  if (!device) return "󱚼 Offline"
  return `${device[0] === "wifi" ? "" : "󰈀"} ${device[2] || "Connected"}`
}
export function batteryLabel(capacity: number, status: string): string {
  const percent = Math.round(Math.max(0, Math.min(100, capacity)))
  const icons = ["", "", "", "", ""]
  return `${status === "Charging" ? "󰂄" : icons[Math.min(4, Math.floor(percent / 25))]} ${percent}%`
}
export function batteryClass(capacity: number, status: string): string {
  return status === "Charging" ? "charging" : capacity <= 15 ? "critical" : capacity <= 30 ? "warning" : ""
}
