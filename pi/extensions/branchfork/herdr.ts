import os from "node:os";
import { callWorker, checked, onHost, type Run } from "./process.ts";

// The old herdr-app control protocol actually used by this repo's project picker.
export function appWorker(message: unknown) {
  const net = require("node:net"), path = require("node:path"), os = require("node:os");
  const home = process.env.HERDR_APP_HOME || path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "herdr-app");
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(path.join(home, "herdr-app.sock"));
    let received = "";
    socket.setTimeout(7000, () => socket.destroy(new Error("Herdr app did not answer")));
    socket.on("connect", () => socket.write(JSON.stringify(message) + "\n"));
    socket.on("error", reject);
    socket.on("end", () => { if (!received.includes("\n")) reject(new Error("Herdr closed without a complete response")); });
    socket.on("data", (chunk: Buffer) => {
      received += chunk.toString();
      if (received.length > 8 * 1024 * 1024) { socket.destroy(new Error("Herdr response is too large")); return; }
      if (!received.includes("\n")) return;
      socket.end();
      try {
        const result = JSON.parse(received.split("\n")[0]!);
        if (result.error) reject(new Error(String(result.error))); else resolve(result);
      } catch (error) { reject(error); }
    });
  });
}

export interface Terminal { terminal: string; pane: string; app: string | null; status?: string }
export interface Tab { id: string; name: string; terminals: Terminal[] }
export interface Space { id: string; name: string; folder: string; machine?: string | null; tabs: Tab[] }
export interface World { spaces: Space[] }
export interface Selection { space?: string; tab?: string; focused_pane?: string }
interface Machine { name: string; host: string; id: string; state: string; temporary?: boolean }

export class Herdr {
  constructor(readonly run: Run, readonly gui: string) {}
  app<T>(message: unknown): Promise<T> { return callWorker(this.run, this.gui, appWorker, message); }
  command = (name: string, args: unknown) => this.app<Record<string, unknown>>({ do: name, args });
  async machines(): Promise<Machine[]> {
    return (JSON.parse(await onHost(this.run, this.gui, "herdr-core", ["machine", "ls", "--json"])) as { machines: Machine[] }).machines;
  }
  async exec(machine: string, program: string, argv: string[], input = "") {
    if (!this.gui) return onHost(this.run, machine, program, argv, input);
    // A Pi on host A can reach GUI B, which owns the configured connection to C.
    // Each exec envelope is decoded separately; payloads still travel over stdin.
    if (!machine) return onHost(this.run, this.gui, program, argv, input);
    const raw = await onHost(this.run, this.gui, "herdr-core", ["exec", "--json", "--on", machine, "--timeout", "180", "--stdin", "--", program, ...argv], input);
    const result = JSON.parse(raw);
    if (result.truncated || result.timed_out || result.code !== 0) throw new Error(`Remote command failed on ${machine}: ${Buffer.from(result.stderr || "", "base64").toString() || "timed out/truncated output"}`);
    return Buffer.from(result.stdout, "base64").toString();
  }
  async worker<T>(machine: string, worker: Function, request: unknown): Promise<T> {
    const script = `const request=JSON.parse(require("node:fs").readFileSync(0,"utf8"));Promise.resolve((${worker.toString()})(request)).then(r=>process.stdout.write(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1});`;
    return JSON.parse(await this.exec(machine, "node", ["-e", script], JSON.stringify(request))) as T;
  }
  async target(host?: string): Promise<{ machine: string; local: boolean; hostname: string }> {
    const guiIdentity = await callWorker<{ hostname: string }>(this.run, this.gui, identityWorker, {});
    const wanted = host || os.hostname();
    if (wanted === guiIdentity.hostname) return { machine: "", local: wanted === os.hostname(), hostname: guiIdentity.hostname };
    const matches = (await this.machines()).filter(machine => host ? machine.name === wanted || machine.id === wanted : machine.host === wanted);
    if (matches.length !== 1) throw new Error(`Cannot uniquely resolve ${wanted} in the GUI's configured Herdr machines. Add/connect that host or specify its saved machine name.`);
    const selected = matches[0]!;
    const actual = await this.worker<{ hostname: string }>(selected.name, identityWorker, {});
    if (!host && actual.hostname !== os.hostname()) throw new Error("The saved default-host identity changed. Reconnect the machine running Pi before retrying.");
    return { machine: selected.name, local: actual.hostname === os.hostname(), hostname: actual.hostname };
  }
  async restore(selection: Selection) {
    if (selection.tab) await this.command("tab.select", { id: selection.tab });
    else if (selection.space) await this.command("space.select", { id: selection.space });
    if (selection.focused_pane) await this.command("pane.focus", { pane: selection.focused_pane });
  }
}

function identityWorker() { return { hostname: require("node:os").hostname() }; }

export async function findHerdr(run: Run, explicit = process.env.BRANCHFORK_GUI_HOST): Promise<Herdr> {
  if (explicit !== undefined) {
    const app = new Herdr(run, explicit === os.hostname() ? "" : explicit);
    await app.app<World>({ ls: true });
    return app;
  }
  const local = new Herdr(run, "");
  try { await local.app<World>({ ls: true }); return local; } catch { /* Try connected saved hosts. */ }
  const machines = JSON.parse(await checked(run, "herdr-core", ["machine", "ls", "--json"])) as { machines: Machine[] };
  const found: Herdr[] = [];
  for (const machine of machines.machines.filter(m => m.state === "connected" && !m.temporary)) {
    const app = new Herdr(run, machine.name);
    try { await app.app<World>({ ls: true }); found.push(app); } catch { /* Not a GUI host. */ }
  }
  if (found.length !== 1) throw new Error(`Found ${found.length} reachable Herdr GUI hosts. Set BRANCHFORK_GUI_HOST to the saved Herdr machine name running the intended GUI (or start/connect Herdr).`);
  return found[0]!;
}
