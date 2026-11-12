// Pure forwarding policy. Herdr already suppresses seen agent alerts upstream.
export function notification(props, active, focus) {
  const terminal = props.action?.name === "agent.focus" ? props.action.args?.terminal : null;
  const shown = focus?.shown ?? focus?.terminal ?? focus?.agent;
  if (terminal && active && (terminal === shown || terminal === focus?.agent)) return null;
  return {
    title: String(props.title ?? "Herdr"), body: String(props.body ?? ""),
    level: props.level ?? "info", icon: props.icon ?? null,
    timeout: Number.isFinite(props.timeout) ? Math.max(0, Math.min(600000, Math.round(props.timeout))) : 10000,
    action: props.action?.name ? { name: props.action.name, args: props.action.args ?? {} } : null,
  };
}

export function notifyArgs(message) {
  const args = ["--app-name=Herdr", "--hint=boolean:suppress-sound:true", `--urgency=${message.level === "error" ? "critical" : "normal"}`, `--expire-time=${message.timeout}`];
  if (message.icon) args.push(`--icon=${message.icon}`);
  if (message.action) args.push("--action=default=Open Herdr");
  return [...args, "--", message.title, message.body];
}
