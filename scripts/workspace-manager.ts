#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import { createHash } from "node:crypto";
import { allocation, DEFAULT_PREFERENCES, floatingGeometry, geometryOf, ICONS, isNumeric, lua, modeOf, selector, validatePreferences, WORKSPACES, type Client, type Geometry, type Mode, type Monitor, type Preferences } from "./workspace-model";

const signature = process.env.HYPRLAND_INSTANCE_SIGNATURE;
const runtimeBase = process.env.XDG_RUNTIME_DIR;
// Keep AF_UNIX paths below Linux's 108-byte limit, even with long instance signatures.
export const runtime = path.join(runtimeBase ?? os.tmpdir(), `sysdef-workspaces-${process.getuid!()}`, createHash("sha256").update(signature ?? "offline").digest("hex").slice(0, 12));
const socketPath = path.join(runtime, "manager.sock");
const preferencesPath = path.join(process.env.XDG_STATE_HOME ?? path.join(os.homedir(), ".local/state"), "sysdef/monitors", `${os.hostname()}.json`);
const MANAGED = "sysdef-mode-float";
const EXEMPT = "sysdef-explicit-float";
interface WindowMemory { identity: string; workspace: string; exempt: boolean; geometry?: Geometry; }
interface Session { modes: Record<string, Mode>; windows: Record<string, WindowMemory>; temporary: Record<string, string>; startup?: { started: number; pending: boolean }; }
interface Snapshot { monitors: Monitor[]; clients: Client[]; workspaces: { name: string; monitor: string }[]; }

export function atomicJSON(file: string, value: unknown, pretty = true) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, pretty ? 2 : undefined) + "\n", { mode: 0o600 });
  fs.renameSync(temp, file);
}
function readJSON<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(fallback); throw error; }
}
export async function hypr(...args: string[]) {
  const result = Bun.spawn(["hyprctl", ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([new Response(result.stdout).text(), new Response(result.stderr).text(), result.exited]);
  if (code !== 0 || /^(error:|unknown request|Invalid dispatcher)/m.test(stdout)) throw new Error(`hyprctl ${args[0]}: ${stderr || stdout}`);
  return stdout;
}
export class Manager {
  preferences: Preferences;
  session: Session;
  previousPlacements: Record<string, string> = {};
  topology = "";
  desktopCache = "";
  initial = true;
  constructor(public io = hypr, public prefsFile = preferencesPath, public runtimeDir = runtime, public hostname = os.hostname()) {
    this.preferences = validatePreferences(readJSON(prefsFile, DEFAULT_PREFERENCES));
    this.session = readJSON(path.join(runtimeDir, "session.json"), { modes: {}, windows: {}, temporary: {} });
  }
  async snapshot(): Promise<Snapshot> {
    const [monitors, clients, workspaces] = await Promise.all([this.io("-j", "monitors"), this.io("-j", "clients"), this.io("-j", "workspaces")]);
    return { monitors: JSON.parse(monitors), clients: JSON.parse(clients), workspaces: JSON.parse(workspaces) };
  }
  async evaluate(code: string[]) {
    if (code.length) await this.io("eval", code.join("\n"));
  }
  dispatch(name: string, args: object) {
    const window = (args as { window?: string }).window;
    const guard = window ? `if hl.get_window(${lua(window)}) then ` : "";
    return `do ${guard}local r = hl.dispatch(hl.dsp.${name}(${lua(args)})); if r and not r.ok then error(r.message or "Workspace operation failed") end ${window ? "end " : ""}end`;
  }
  saveSession() { atomicJSON(path.join(this.runtimeDir, "session.json"), this.session); }
  which(command: string) { return Bun.which(command); }
  notify(message: string) { report(message); }
  status(snapshot: Snapshot) {
    const { primary, placements } = allocation(snapshot.monitors, this.preferences, this.hostname);
    return { version: 1, primary, primaryAssignment: this.preferences.primary,
      monitors: snapshot.monitors.map(m => ({ ...m, primary: m.name === primary })),
      clients: snapshot.clients,
      workspaces: WORKSPACES.map(name => {
        const monitor = snapshot.workspaces.find(w => w.name === name)?.monitor ?? placements[name];
        return { name, monitor, icon: ICONS[name] ?? "󰣆",
          assignment: this.preferences.assignments[name] ?? null, mode: modeOf(name, this.session.modes),
          active: snapshot.monitors.some(m => m.name === monitor && m.activeWorkspace?.name === name),
          occupied: snapshot.clients.some(c => c.workspace.name === name) };
      }) };
  }
  observeMoves(snapshot: Snapshot) {
    for (const workspace of snapshot.workspaces) {
      const last = this.previousPlacements[workspace.name];
      if (last && last !== workspace.monitor) {
        this.session.temporary[workspace.name] = workspace.monitor;
        this.previousPlacements[workspace.name] = workspace.monitor;
      }
    }
  }
  async applyPlacement(snapshot: Snapshot, reason: "startup" | "primary" | "assign" | "topology", changed?: string) {
    if (reason === "primary" || reason === "assign") this.observeMoves(snapshot);
    const { placements, primary } = allocation(snapshot.monitors, this.preferences, this.hostname);
    const previousTemporary = structuredClone(this.session.temporary);
    const planned: Record<string, string> = {};
    const code: string[] = [];
    const connected = new Set(snapshot.monitors.map(m => m.name));
    for (const name of WORKSPACES) {
      const current = snapshot.workspaces.find(w => w.name === name);
      let target = placements[name];
      // A primary-only change must not reshuffle numeric workspaces already on a monitor.
      if (reason === "primary" && isNumeric(name) && current && !this.preferences.assignments[name]) {
        this.session.temporary[name] = current.monitor;
      }
      if ((reason === "assign" && name === changed) || (reason === "primary" && !isNumeric(name) && !this.preferences.assignments[name])) delete this.session.temporary[name];
      // Preserve temporary keyboard moves; an absent destination temporarily falls back to primary.
      const temporary = this.session.temporary[name];
      if (temporary) target = connected.has(temporary) ? temporary : primary;
      if (reason === "assign" && name !== changed && current) target = current.monitor;
      code.push(`hl.workspace_rule(${lua({ workspace: selector(name), monitor: target, persistent: true, layout: "dwindle" })})`);
      if (current && current.monitor !== target) code.push(this.dispatch("workspace.move", { workspace: selector(name), monitor: target }));
      planned[name] = target;
    }
    try { await this.evaluate(code); }
    catch (error) { this.session.temporary = previousTemporary; throw error; }
    this.previousPlacements = planned;
    this.saveSession();
  }
  async reconcile(snapshot: Snapshot, forceWorkspace?: string) {
    const code: string[] = [];
    const before = this.session.windows;
    const next = structuredClone(before);
    const alive = new Set<string>();
    for (const client of snapshot.clients) {
      alive.add(client.address);
      const name = client.workspace.name;
      if (!WORKSPACES.includes(name)) continue;
      const identity = `${client.stableId ?? client.address}:${client.pid}`;
      let memory = next[client.address];
      const fresh = !memory || memory.identity !== identity;
      const moved = !fresh && memory.workspace !== name;
      if (fresh) memory = { identity, workspace: name, exempt: client.tags.includes(EXEMPT) || (client.floating && !client.tags.includes(MANAGED)) };
      if (client.tags.includes(EXEMPT) || (client.floating && !client.tags.includes(MANAGED))) memory.exempt = true;
      next[client.address] = memory;
      if (memory.exempt || client.pinned) { memory.workspace = name; continue; }
      if (!fresh && !moved && forceWorkspace !== name) continue;
      const window = `address:${client.address}`;
      const shouldFloat = modeOf(name, this.session.modes) === "floating";
      if (!shouldFloat && client.floating) {
        memory.geometry = geometryOf(client);
        code.push(this.dispatch("window.float", { action: "disable", window }));
        code.push(this.dispatch("window.tag", { tag: `-${MANAGED}`, window }));
      } else if (shouldFloat && !client.floating) {
        const monitor = snapshot.monitors.find(m => m.id === client.monitor) ?? snapshot.monitors[0];
        const geometry = floatingGeometry(monitor, memory.geometry);
        code.push(this.dispatch("window.tag", { tag: `+${MANAGED}`, window }));
        code.push(this.dispatch("window.float", { action: "enable", window }));
        code.push(this.dispatch("window.resize", { window, x: geometry.width, y: geometry.height, relative: false }));
        code.push(this.dispatch("window.move", { window, x: geometry.x, y: geometry.y, relative: false }));
      }
      memory.workspace = name;
    }
    await this.evaluate(code);
    for (const address of Object.keys(next)) if (!alive.has(address)) delete next[address];
    this.session.windows = next;
    this.saveSession();
  }
  async refresh() {
    let snapshot = await this.snapshot();
    const topology = snapshot.monitors.map(m => `${m.name}:${m.x}:${m.y}:${m.width}:${m.height}:${m.scale}`).sort().join("|");
    if (this.initial || topology !== this.topology) {
      await this.applyPlacement(snapshot, this.initial ? "startup" : "topology");
      this.topology = topology;
      this.initial = false;
      snapshot = await this.snapshot();
    } else {
      // External workspace moves are temporary and must not be fought by the daemon.
      this.observeMoves(snapshot);
    }
    await this.reconcile(snapshot);
    if (this.session.startup?.pending) {
      const herdr = snapshot.clients.find(c => c.class === "herdr-app" && c.workspace.name === "S");
      if (herdr) {
        await this.evaluate([this.dispatch("focus", { workspace: selector("S") }), this.dispatch("focus", { window: `address:${herdr.address}` })]);
        this.session.startup.pending = false;
        this.saveSession();
      } else if (Date.now() - this.session.startup.started > 30000) {
        this.session.startup.pending = false;
        this.saveSession();
        report("Herdr did not open on S within 30 seconds; startup will not keep trying to focus it.");
      }
    }
    await this.writeDesktop(snapshot);
  }
  async writeDesktop(snapshot: Snapshot) {
    // UI-neutral, event-driven snapshot. AGS watches the directory for atomic renames.
    const status = this.status(snapshot);
    const serialized = JSON.stringify(status);
    if (this.desktopCache === serialized) return;
    atomicJSON(path.join(this.runtimeDir, "desktop.json"), status, false);
    this.desktopCache = serialized;
  }
  async command(command: string, args: string[] = []) {
    let snapshot = await this.snapshot();
    if (command === "status") return this.status(snapshot);
    const [name, destination] = args;
    if (command === "startup") {
      if (this.session.startup) return this.status(snapshot);
      const apps = [["S", "herdr-app"], ["R", "hermes desktop"], ["G", "proton-mail"], ["N", "obsidian"]];
      // Old optional applications are preserved, but missing commands are reported visibly.
      for (const [, app] of apps) {
        if (!this.which(app.split(" ")[0])) this.notify(`Startup command is not installed: ${app}`);
      }
      for (const [, app] of apps.slice(0, 3)) if (!this.which(app.split(" ")[0])) throw new Error(`Required startup application is not installed: ${app}`);
      this.session.startup = { started: Date.now(), pending: true };
      this.saveSession();
      const code: string[] = [];
      const { primary, placements } = allocation(snapshot.monitors, this.preferences, this.hostname);
      for (const monitor of snapshot.monitors.filter(m => m.name !== primary)) {
        const first = WORKSPACES.find(n => isNumeric(n) && placements[n] === monitor.name);
        if (first) code.push(this.dispatch("focus", { workspace: selector(first) }));
      }
      code.push(this.dispatch("focus", { workspace: selector("S") }));
      for (const [workspace, app] of apps) {
        if (this.which(app.split(" ")[0])) code.push(`hl.exec_cmd(${lua(app)}, ${lua({ workspace: `${selector(workspace)} silent`, no_initial_focus: true })})`);
      }
      await this.evaluate(code);
    } else if (command === "primary" || command === "assign") {
      const target = command === "primary" ? name : destination;
      if (target !== "auto" && !snapshot.monitors.some(m => m.name === target)) throw new Error("Choose an active monitor or Automatic");
      if (command === "assign" && !WORKSPACES.includes(name)) throw new Error("Unknown workspace");
      const old = structuredClone(this.preferences);
      try {
        if (command === "primary") this.preferences.primary = target === "auto" ? null : target;
        else if (target === "auto") delete this.preferences.assignments[name];
        else this.preferences.assignments[name] = target;
        await this.applyPlacement(snapshot, command, name);
        atomicJSON(this.prefsFile, this.preferences);
      } catch (error) { this.preferences = old; throw error; }
    } else if (command === "toggle") {
      const active = name ?? JSON.parse(await this.io("-j", "activeworkspace")).name;
      if (!WORKSPACES.includes(active)) throw new Error("Unknown workspace");
      if (!isNumeric(active)) return this.status(snapshot);
      const previous = modeOf(active, this.session.modes);
      this.session.modes[active] = previous === "floating" ? "tiling" : "floating";
      try { await this.reconcile(snapshot, active); }
      catch (error) { this.session.modes[active] = previous; throw error; }
    } else if (command === "focus" || command === "move" || command === "move-follow") {
      if (!WORKSPACES.includes(name)) throw new Error("Unknown workspace");
      const args = command === "focus" ? { workspace: selector(name) } : { workspace: selector(name), follow: command === "move-follow" };
      await this.evaluate([this.dispatch(command === "focus" ? "focus" : "window.move", args)]);
    } else if (command === "manual-float") {
      const active = JSON.parse(await this.io("-j", "activewindow")) as Client;
      if (!active.address) return this.status(snapshot);
      const window = `address:${active.address}`;
      const memory = this.session.windows[active.address];
      const floats = !active.floating;
      // A mode-floated window is already floating: explicitly claim it rather than tile it.
      const claim = active.floating && active.tags.includes(MANAGED) && !active.tags.includes(EXEMPT);
      const exempt = floats || claim;
      await this.evaluate([
        this.dispatch("window.tag", { window, tag: `-${MANAGED}` }),
        this.dispatch("window.tag", { window, tag: `${exempt ? "+" : "-"}${EXEMPT}` }),
        this.dispatch("window.float", { window, action: exempt ? "enable" : "disable" }),
        ...(exempt ? [this.dispatch("window.resize", { window, x: 1200, y: 1000, relative: false }), this.dispatch("window.center", { window })] : []),
      ]);
      if (memory) memory.exempt = exempt;
      this.saveSession();
    } else throw new Error(`Unknown workspace command: ${command}`);
    snapshot = await this.snapshot();
    await this.reconcile(snapshot);
    await this.writeDesktop(snapshot);
    return this.status(snapshot);
  }
}

async function request(command: string, args: string[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    let data = "";
    socket.setTimeout(15000, () => socket.destroy(new Error("Workspace controller timed out")));
    socket.on("connect", () => socket.write(JSON.stringify({ command, args }) + "\n"));
    socket.on("data", chunk => {
      data += chunk;
      if (data.includes("\n")) {
        try { const response = JSON.parse(data); socket.end(); response.ok ? resolve(response.value) : reject(new Error(response.error)); }
        catch (error) { socket.destroy(); reject(error); }
      }
    });
    socket.on("error", reject);
    socket.on("end", () => { if (!data.includes("\n")) reject(new Error("Workspace controller disconnected")); });
  });
}
async function daemon() {
  if (!signature || !runtimeBase) throw new Error("The workspace controller must run inside a Hyprland session");
  fs.mkdirSync(runtime, { recursive: true, mode: 0o700 });
  try { await request("status", []); return; }
  catch (error) {
    if (!["ENOENT", "ECONNREFUSED"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
    fs.rmSync(socketPath, { force: true });
  }
  const manager = new Manager();
  let queue = Promise.resolve();
  const schedule = <T>(fn: () => Promise<T>) => {
    const task = queue.then(fn);
    queue = task.then(() => {}, error => { console.error(error); report(error); });
    return task;
  };
  const server = net.createServer(socket => {
    let input = "";
    socket.setTimeout(15000, () => socket.destroy());
    socket.on("error", console.error);
    socket.on("data", chunk => {
      input += chunk;
      if (input.length > 8192) { socket.destroy(); return; }
      if (!input.includes("\n")) return;
      socket.pause();
      void schedule(async () => {
        try {
          const { command, args } = JSON.parse(input);
          if (typeof command !== "string" || !Array.isArray(args) || !args.every(a => typeof a === "string")) throw new Error("Invalid controller request");
          const value = await manager.command(command, args);
          socket.end(JSON.stringify({ ok: true, value }) + "\n");
        } catch (error) { socket.end(JSON.stringify({ ok: false, error: String(error) }) + "\n"); }
      });
    });
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(socketPath, resolve); });
  fs.chmodSync(socketPath, 0o600);
  await schedule(() => manager.refresh());
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let events: net.Socket;
  let stopped = false;
  const connectEvents = () => {
    events = net.createConnection(path.join(runtimeBase, "hypr", signature, ".socket2.sock"));
    events.on("data", chunk => {
      if (chunk.toString().includes("configreloaded>>")) manager.initial = true;
      if (!debounce) debounce = setTimeout(() => { debounce = undefined; void schedule(() => manager.refresh()); }, 100);
    });
    events.on("error", error => console.error("Hyprland event stream:", error.message));
    events.on("close", () => { if (!stopped) setTimeout(connectEvents, 1000); });
  };
  connectEvents();
  const stop = () => { stopped = true; if (debounce) clearTimeout(debounce); events?.destroy(); server.close(); fs.rmSync(socketPath, { force: true }); process.exit(0); };
  process.on("SIGTERM", stop); process.on("SIGINT", stop);
}
function report(error: unknown) {
  Bun.spawn(["notify-send", "-u", "critical", "Workspace manager", String(error)], { stdout: "ignore", stderr: "ignore" });
}

if (import.meta.main) {
  const [command, ...args] = process.argv.slice(2);
  try {
    if (command === "runtime") console.log(runtime);
    else if (command === "daemon") await daemon();
    else console.log(JSON.stringify(await request(command, args)));
  } catch (error) {
    console.error(String(error));
    if (command !== "status") report(error);
    process.exitCode = 1;
  }
}
