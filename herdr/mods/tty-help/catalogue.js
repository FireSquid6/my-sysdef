import { keys, shared } from "herdr";
// Tetris publishes rows from its effective controls, avoiding a second defaults table.

export const TABS = [
  ["general", "General", []], ["terminal", "Terminal", [["Ctrl+Tab", "Forward to terminal program when quick terminal is closed"]]],
  ["tty-files", "Files", [["/", "Search files"], ["j/k, arrows", "Move; prefix with a count"], ["g / G", "First / last row"], ["h/l, left/right", "Collapse / expand folder"], ["Enter", "Expand folder or preview file"], ["h / Escape", "Back from preview; Escape leaves search"]]],
  ["tty-changes", "Changes", [["Ctrl+Tab", "Cycle files, preview, message and available action buttons"], ["j/k, arrows; g/G", "Navigate list or diff; numeric count supported"], ["h/l", "List / preview; move between buttons"], ["i", "Edit commit message"], ["Enter / Space", "Activate focused button"], ["Escape", "Leave input/preview or close upstream diff"]]],
  ["tty-repo", "Repo", [["Ctrl+Tab / h / l", "Cycle sections (h returns from detail first)"], ["j/k; g/G", "Rows or detail scroll; numeric count supported"], ["/", "Filter; Enter applies; Escape leaves search"], ["Enter", "Open detail"], ["r", "Refresh all sections"], ["o", "Open URL in local browser (best effort)"]]],
  ["source-picker", "Projects", [["Type", "Filter directories or enter path"], ["Up/Down", "Choose directory"], ["Tab", "Browse selected directory"], ["Enter", "Open project"], ["Ctrl+Tab", "Cycle machine"], ["Escape", "Cancel"]]],
  ["tty-picker", "Tabs", [["Type", "Filter spaces and tabs"], ["Up/Down", "Choose result"], ["Enter", "Activate result"], ["Ctrl+d", "Close selected tab (normal safety confirmation applies)"], ["Escape", "Cancel"]]],
  ["tty-menu", "Menu", [["Up/Down", "Choose action"], ["Enter", "Activate"], ["Escape", "Dismiss"]]],
  ["tty-new-menu", "New item", [["1–9", "Launch numbered installed agent"], ["Escape", "Dismiss; click an action to launch"]]],
  ["tty-prompt", "Prompt", [["Enter", "Save input"], ["Escape", "Cancel"]]],
  ["tty-confirm", "Confirm", [["Enter", "Confirm destructive action"], ["Escape", "Cancel"]]],
  ["tty-machine-add", "Machine", [["Enter", "Add typed SSH target"], ["Escape", "Close; connection guidance remains available in settings"]]],
  ["tty-worktree", "Worktrees", [["Type", "Filter checkouts or enter branch name"], ["Up/Down", "Select checkout in Open mode"], ["Enter", "Open, create or remove (subject to safety checks)"], ["Escape", "Cancel"]]],
  ["tty-arcade", "Arcade", [["j/k, arrows", "Select game"], ["Enter / Space", "Play"], ["1–3", "Launch game"], ["Escape", "Close"]]],
  ["tty-minesweeper", "Minesweeper", [["hjkl / arrows", "Move"], ["Enter / Space", "Reveal"], ["f", "Flag"], ["r", "New game setup: choose board size and bomb count"], ["Setup: j/k; h/l", "Choose size/bombs; decrease/increase"], ["Setup: Enter / y / n", "Start / start / cancel without changing current game"], ["Escape", "Save and close"], ["Left / right click", "Reveal / flag; X marks wrong flag"]]],
  ["tty-solitaire", "Solitaire", [["h/l, left/right", "Choose pile"], ["j/k, up/down", "Choose card or row"], ["Enter / Space", "Select stack or move; same source cancels"], ["d", "Draw / recycle"], ["a", "Autocomplete when all tableau cards are face-up and stock/waste are empty"], ["r; y / n", "Request restart; confirm / cancel"], ["Escape", "Save and close"]]],
  ["tty-tetris", "Tetris", [["F2", "Settings (always)"], ["Escape", "Pause, save and close (also during capture)"], ["y / n", "Confirm / cancel new game"], ["Settings: j/k/h/l, Ctrl+Tab", "Select binding or starting level"], ["Settings: Enter", "Capture new binding"], ["Settings: Backspace / d", "Restore row default / all defaults"], ["Settings: q / F2", "Back to game"], ["Level: h/l, Enter, Backspace", "Decrease / increase / reset starting level"]]],
  ["quick-terminal", "Quick terminal", [["Alt+s", "Toggle; closing keeps shell running"], ["Ctrl+Tab", "Cycle machine while open; otherwise forwarded to program"], ["Terminal keys", "Same bindings as Terminal tab"]]],
  ["tty-help", "Help", [["[ / ]", "Previous / next tab, wrapping; reserved even in search"], ["Type", "Filter current tab; query survives tab changes"], ["Mouse wheel", "Scroll results or tab strip"], ["Escape / Ctrl+Alt+H", "Close only help and restore underlying interface"]]],
];

export function rowsFor(id) {
  const sections = ["global", `layout:${shared("layout")}`, ...(id === "terminal" || id === "quick-terminal" ? ["terminal"] : id === "general" ? [] : [`mod:${id}`])];
  const effective = new Map();
  for (const section of sections) for (const row of keys().filter(k => k.section === section)) effective.set(row.keys, row);
  const configured = [...effective.values()].map(k => [k.keys, `${k.action} (${k.section})`]);
  const local = TABS.find(t => t[0] === id)?.[2] || [];
  const game = id === "tty-tetris" ? shared("tetris.help") || [["Gameplay", "Open Tetris once to load its current configured controls"]] : [];
  // Local plain-key handlers take precedence over same-key app entries.
  const normalize = key => key.toLowerCase().replace(/\+/g, "-").trim();
  const owned = new Set([...local, ...game].flatMap(row => row[0].split(/\s*\/\s*|,\s*/).map(normalize)));
  return [...local, ...game, ...configured.filter(k => !owned.has(normalize(k[0])))];
}
