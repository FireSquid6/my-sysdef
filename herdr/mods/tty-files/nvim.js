import { spaces, panes, exec, run } from "herdr";

// Neovim's TUI may spawn a separate embedded Neovim server. Inspect this
// process and its Neovim children, never an unrelated editor from /tmp.
const SOCKETS = `import json, os, sys
pid = int(sys.argv[1])
pids = [pid]
for current in pids:
    try:
        with open('/proc/%d/task/%d/children' % (current, current)) as children:
            for child in children.read().split():
                child = int(child)
                if len(pids) < 64 and os.path.basename(os.readlink('/proc/%d/exe' % child)) == 'nvim':
                    pids.append(child)
    except OSError: pass
inodes = set()
for owner in pids:
    try:
        for fd in os.listdir('/proc/%d/fd' % owner):
            try:
                target = os.readlink('/proc/%d/fd/%s' % (owner, fd))
                if target.startswith('socket:['): inodes.add(target[8:-1])
            except OSError: pass
    except OSError: pass
paths = []
with open('/proc/net/unix') as sockets:
    for line in sockets:
        fields = line.rstrip('\\n').split(None, 7)
        if len(fields) == 8 and fields[6] in inodes and fields[3] == '00010000':
            paths.append(fields[7])
print(json.dumps(paths))`;

const vimString = value => "'" + value.replace(/'/g, "''") + "'";
const isNvim = pane => pane.program?.key === "nvim";

export async function openInNvim(file, context, valid) {
  const space = spaces().find(s => s.id === context.space && (s.machine ?? null) === (context.on ?? null));
  if (!space) return false;
  const tabs = new Set(space.tabs.map(tab => tab.id));
  const active = space.tabs.find(tab => tab.active)?.id;
  const candidates = panes().filter(pane => tabs.has(pane.tab) && pane.terminal && isNvim(pane))
    .sort((a, b) => Number(b.tab === active) - Number(a.tab === active));
  for (const pane of candidates) {
    if (!valid()) return false;
    try {
      const result = await exec("hc", ["get", pane.terminal, "--json"]);
      if (result.code !== 0) continue;
      const terminal = JSON.parse(result.stdout);
      const process = terminal.foreground ?? { pid: terminal.pid, argv: terminal.argv };
      if (terminal.state !== "live" || !process?.pid || !/(^|\/)nvim$/.test(process.name ?? process.argv?.[0] ?? "")) continue;
      const sockets = await exec("python3", ["-c", SOCKETS, String(process.pid)], { on: context.on, timeout: 3000 });
      if (sockets.code !== 0) continue;
      for (const socket of JSON.parse(sockets.stdout)) {
        if (!valid()) return false;
        // Structured nvim_cmd arguments handle filenames, not Ex command text;
        // no force flag, so an unsaved buffer is never silently discarded.
        const expression = `luaeval('vim.api.nvim_cmd({cmd="edit",args={vim.fn.fnameescape(vim.fn.json_decode(_A))}}, {})', ${vimString(JSON.stringify(file))})`;
        const binary = process.argv?.[0]?.startsWith("/") ? process.argv[0] : "nvim";
        const opened = await exec(binary, ["--server", socket, "--remote-expr", expression], { on: context.on, timeout: 3000 });
        if (opened.code !== 0) continue;
        if (!valid()) return false;
        if (!panes().some(p => p.pane === pane.pane && p.terminal === pane.terminal && isNvim(p))) return false;
        run("tab.select", { id: pane.tab });
        run("pane.focus", { pane: pane.pane });
        return true;
      }
    } catch { /* No reachable Neovim server: retain the built-in preview. */ }
  }
  return false;
}
