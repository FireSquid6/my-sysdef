// Keep the native command catalog; add only the two personal agent-view choices.
export function paletteRows(catalog, bindings, sort, query) {
  const effective = new Map();
  for (const section of ["global", "layout:tty"]) {
    for (const binding of bindings.filter(binding => binding.section === section)) effective.set(binding.keys, binding.action);
  }
  const shortcuts = new Map([...effective].map(([key, action]) => [action, key]));
  const rows = [
    { id: "agents-priority", title: "Agents: Priority", detail: "Show agents by urgency", sort: "priority", selected: sort !== "grouped" },
    { id: "agents-grouped", title: "Agents: Grouped by space", detail: "Group agents under their space", sort: "grouped", selected: sort === "grouped" },
    ...catalog.map(command => ({ id: command.name, command: command.name, title: command.name, detail: command.about, shortcut: shortcuts.get(command.name) ?? "" })),
  ];
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return rows.filter(row => words.every(word => `${row.title} ${row.detail}`.toLowerCase().includes(word)));
}
