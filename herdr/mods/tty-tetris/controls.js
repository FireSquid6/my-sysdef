// Portable defaults; personal overrides are saved by the in-game Settings page.
export const DEFAULT_BINDINGS = {
  left: ["h", "left"], right: ["l", "right"], softDrop: ["j", "down"],
  rotateCW: ["k", "up", "x"], rotateCCW: ["z"], hardDrop: ["space"],
  hold: ["c"], pause: ["p"], restart: ["r"], settings: ["s"],
};
export const ACTIONS = Object.keys(DEFAULT_BINDINGS);
export const LABELS = {
  left: "Move left", right: "Move right", softDrop: "Soft drop", rotateCW: "Rotate clockwise",
  rotateCCW: "Rotate counterclockwise", hardDrop: "Hard drop", hold: "Hold / swap", pause: "Pause / resume",
  restart: "New game (confirmation)", settings: "Settings",
};
export function chord(event) {
  const m = event.modifiers || {};
  const key = String(event.key || "").toLowerCase();
  if (["shift", "control", "alt", "cmd", "platform", "function"].includes(key)) return "";
  return [m.control && "ctrl", m.alt && "alt", m.shift && "shift", m.platform && "cmd", key === " " ? "space" : key].filter(Boolean).join("-");
}
export function bindings(config = {}) {
  config = config && typeof config === "object" ? config : {};
  const result = Object.fromEntries(ACTIONS.map(a => [a, [...DEFAULT_BINDINGS[a]]]));
  // Apply overrides together, then reject invalid or colliding configuration.
  for (const action of ACTIONS) {
    if (Array.isArray(config[action]) && config[action].length && config[action].every(key => typeof key === "string" && key.length > 0)) result[action] = [...config[action]];
  }
  const seen = new Set();
  for (const action of ACTIONS) for (const key of result[action]) {
    if (["escape", "f2", "ctrl-alt-t"].includes(key) || seen.has(key)) return Object.fromEntries(ACTIONS.map(a => [a, [...DEFAULT_BINDINGS[a]]]));
    seen.add(key);
  }
  return result;
}
export function actionFor(event, keys) {
  const key = chord(event);
  return ACTIONS.find(action => keys[action].includes(key));
}
export function rebind(keys, action, key) {
  if (!ACTIONS.includes(action) || !key) return { error: "Press a non-modifier key." };
  if (["escape", "f2", "ctrl-alt-t"].includes(key)) return { error: "Escape, F2 and Ctrl+Alt+T are reserved." };
  const other = ACTIONS.find(a => a !== action && keys[a].includes(key));
  if (other) return { error: `${key} is already bound to ${LABELS[other]}. Change that binding first.` };
  return { value: { ...keys, [action]: [key] } };
}
