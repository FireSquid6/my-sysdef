import os from "node:os";
import { callWorker, checked, onHost, type Run } from "./process.ts";
import { coreRpcWorker } from "./core-rpc-worker.js";
import { storageWorker } from "./storage-worker.js";

export interface Target { machine: string; local: boolean; hostname: string }
export interface CoreTerminal {
  address: string; cwd: string; state: string; argv?: string[];
  agent?: string | null; status?: { app?: string } | null;
  foreground?: { cwd?: string; argv?: string[]; name?: string } | null;
  labels?: Record<string, string>; reason?: string | null;
}
interface Machine { name: string; host: string; id: string; state: string; temporary?: boolean }

export class CoreRpcError extends Error {
  constructor(message: string, readonly kind?: string) { super(message); }
}

// All target operations run against that host's own core. Layout documents are
// machine-owned too; any connected GUI can display them without reverse routing.
export class Herdr {
  constructor(readonly run: Run) {}
  exec(machine: string, program: string, argv: string[], input = "") {
    return onHost(this.run, machine, program, argv, input);
  }
  worker<T>(machine: string, worker: Function, request: unknown): Promise<T> {
    return callWorker(this.run, machine, worker, request);
  }
  async target(host?: string): Promise<Target> {
    if (!host) return { machine: "", local: true, hostname: os.hostname() };
    const { machines } = JSON.parse(await checked(this.run, "hc", ["machine", "ls", "--json"])) as { machines: Machine[] };
    const matches = machines.filter(machine => machine.name === host || machine.id === host);
    if (matches.length !== 1) throw new Error(`Cannot uniquely resolve ${host} in this core's saved machines. Add/connect it with hc machine, then retry.`);
    const machine = matches[0]!;
    const actual = await this.worker<{ hostname: string }>(machine.name, storageWorker, { action: "identity" });
    // An explicit saved machine is always a remote filesystem route, even if
    // another machine happens to share this host's hostname.
    return { machine: machine.name, local: false, hostname: actual.hostname };
  }
  async identity(machine: string): Promise<string> {
    const status = JSON.parse(await this.exec(machine, "hc", ["server", "status", "--json"])) as { core?: { id?: string } };
    if (!status.core?.id) throw new Error("Cannot identify destination Core namespace");
    return status.core.id;
  }
  async terminals(machine: string): Promise<CoreTerminal[]> {
    const listing = JSON.parse(await this.exec(machine, "hc", ["ls", "--json"])) as { terminals: CoreTerminal[] };
    if (!Array.isArray(listing.terminals)) throw new Error("Core returned an invalid terminal list");
    // A target's listing can include its own connected machines. Only inspect
    // terminals owned by the target core, not unrelated hosts or terminal text.
    return Promise.all(listing.terminals.filter(t => !t.address.includes("/") && t.state === "live")
      .map(async t => JSON.parse(await this.exec(machine, "hc", ["get", "--json", t.address])) as CoreTerminal));
  }
  async launch(machine: string, folder: string, key: string, role: string, argv: string[], extraLabels: Record<string, string> = {}): Promise<CoreTerminal> {
    const labels = { "branchfork.key": key, "branchfork.role": role, "branchfork.folder": folder, ...extraLabels };
    // hc interprets bare argv[0] as a template first. An absolute executable
    // bypasses templates and their automatic first messages, for Pi and nvim.
    const executable = argv.length ? await this.worker<string>(machine, storageWorker, { action: "executable", program: argv[0] }) : undefined;
    const command = executable ? [executable, ...argv.slice(1)] : [];
    const result = JSON.parse(await this.exec(machine, "hc", ["run", "--json", "--bg", "--no-parent", "--outlive-parent", "--no-notify",
      "--name", `bf-${key.slice(0, 16)}-${role}`, "--cwd", folder,
      ...Object.entries(labels).flatMap(([k, v]) => ["--label", `${k}=${v}`]), "--", ...command])) as CoreTerminal;
    if (!result.address || result.address.includes("/") || result.state !== "live" || result.reason === "spawn_pending") {
      throw new Error(`Core launch was not confirmed (${result.address || "unknown terminal"}, ${result.reason || result.state}). Inspect retained terminals before retrying.`);
    }
    // hc run's CLI reply can omit labels even though Core persisted them.
    return { ...result, labels: { ...result.labels, ...labels } };
  }
  async label(machine: string, terminal: string, labels: Record<string, string>) {
    await this.exec(machine, "hc", ["label", "--json", terminal, ...Object.entries(labels).map(([k, v]) => `${k}=${v}`)]);
  }
  async rpc<T>(machine: string, method: string, params: unknown): Promise<T> {
    const reply = await this.worker<{ result: T; error?: { kind?: string; message: string } }>(machine, coreRpcWorker, { method, params });
    if (reply.error) throw new CoreRpcError(reply.error.message, reply.error.kind);
    return reply.result;
  }
}

export async function findHerdr(run: Run): Promise<Herdr> {
  // No GUI probe or discovery. A missing hc is an actionable prerequisite error.
  await checked(run, "hc", ["--version"]);
  return new Herdr(run);
}
