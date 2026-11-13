import { createHash, randomUUID } from "node:crypto";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { gitWorker } from "./git-worker.js";
import { storageWorker } from "./storage-worker.js";
import { callWorker, run, type Run } from "./process.ts";
import { findHerdr, type Herdr, type CoreTerminal } from "./herdr.ts";
import { handoffId, idleInstruction, snapshot, summarize } from "./context.ts";
import { present } from "./presentation.ts";

export interface Source { root: string; primary: string; repo: string; origin: string; currentBranch: string; head: string }
interface GitResult { ok: boolean; error?: string; source?: Source; folder?: string; completed?: string[] }
interface Agent { sessionId: string; cwd: string; terminal: string; coreId?: string; received?: string[] }
interface Dependencies { run: Run; findHerdr: typeof findHerdr; summarize: typeof summarize; present: typeof present }

export function parseArgs(args: string) {
  const parts = args.trim().split(/\s+/).filter(Boolean);
  const headless = parts.includes("--headless");
  const positional = parts.filter(part => part !== "--headless");
  if (positional.length < 1 || positional.length > 2 || parts.filter(part => part === "--headless").length > 1
    || positional.some(part => part.startsWith("-") || /[\0\r\n]/.test(part))) {
    throw new Error("Usage: /branchfork <branch> [host] [--headless]. Supply a literal branch and an optional saved Core machine name.");
  }
  return { branch: positional[0]!, host: positional[1], headless };
}
const within = (cwd: string, folder: string) => cwd === folder || cwd.startsWith(folder + "/");
const isPi = (terminal: CoreTerminal) => terminal.agent === "pi" || terminal.status?.app === "pi"
  || (terminal.foreground?.argv?.[0] ?? terminal.argv?.[0] ?? "").split("/").at(-1) === "pi";

export async function destinationAgent(core: Herdr, machine: string, folder: string, key: string, terminals: CoreTerminal[], registrations: Agent[], coreId: string) {
  // Terminal IDs are only unique within one Core. Never strip qualifications or
  // correlate a registration from another HC_SESSION by its tN suffix.
  const inFolder = registrations.filter(agent => agent.coreId === coreId && within(agent.cwd, folder));
  const candidates: CoreTerminal[] = [];
  for (const terminal of terminals) {
    const registered = inFolder.some(agent => agent.terminal && agent.terminal === terminal.address);
    const retained = terminal.labels?.["branchfork.key"] === key && terminal.labels?.["branchfork.role"] === "agent";
    if (registered || retained) { candidates.push(terminal); continue; }
    if (!isPi(terminal)) continue;
    const cwd = terminal.foreground?.cwd || terminal.cwd;
    const canonical = await core.worker<string>(machine, storageWorker, { action: "canonical", path: cwd });
    if (within(canonical, folder)) candidates.push(terminal);
  }
  const agents = inFolder.filter(agent => agent.terminal && candidates.some(t => t.address === agent.terminal));
  if (candidates.length > 1 || agents.length > 1) throw new Error("More than one Pi agent is running in the destination worktree. Choose the intended agent explicitly; no handoff was sent.");
  if (candidates.length && !agents.length) throw new Error(`The existing destination terminal ${candidates[0]!.address} has no matching branchfork inbox registration. Inspect its startup/recovery state and run /reload in Pi (install the extension if needed), then retry; no duplicate will be launched.`);
  return agents[0] ? { agent: agents[0], terminal: candidates[0]! } : undefined;
}

export async function branchfork(args: string, ctx: ExtensionCommandContext, overrides: Partial<Dependencies> = {}) {
  const deps = { run, findHerdr, summarize, present, ...overrides };
  const { branch, host, headless } = parseArgs(args);
  await ctx.waitForIdle();
  if (!ctx.model) throw new Error("Select a Pi model before forking its context.");
  const inspected = await callWorker<GitResult>(deps.run, "", gitWorker, { action: "inspect", cwd: ctx.cwd, branch });
  if (!inspected.ok || !inspected.source) throw new Error(inspected.error || "Could not inspect source repository.");
  const source = inspected.source;
  const core = await deps.findHerdr(deps.run);
  const target = await core.target(host);
  const key = createHash("sha256").update(JSON.stringify([source.origin, source.repo, branch])).digest("hex");
  const token = randomUUID();
  const completed: string[] = [];
  let operationError: Error | undefined;
  await core.worker(target.machine, storageWorker, { action: "lock", key, token });
  try {
    const terminals = await core.terminals(target.machine);
    const candidates = terminals.flatMap(t => [t.cwd, t.foreground?.cwd]).filter((cwd): cwd is string => !!cwd);
    const prepared = await core.worker<GitResult>(target.machine, gitWorker, { action: "prepare", source, branch, local: target.local, candidates });
    completed.push(...(prepared.completed || []));
    if (!prepared.ok || !prepared.folder) throw new Error(prepared.error || "Could not prepare worktree.");
    const folder = prepared.folder;
    completed.push(`Worktree ready: ${target.hostname}:${folder}`);
    const registrations = await core.worker<Agent[]>(target.machine, storageWorker, { action: "agents" });
    // Fetching/cloning can take time; do not discover agents from the earlier
    // repository-candidate snapshot after another Pi may have started.
    const currentTerminals = await core.terminals(target.machine);
    const coreId = await core.identity(target.machine);
    const existing = await destinationAgent(core, target.machine, folder, key, currentTerminals, registrations, coreId);
    const id = handoffId(ctx.sessionManager.getSessionId(), ctx.sessionManager.getBranch(), `${target.hostname}:${folder}:${source.currentBranch}:${source.head}:${ctx.model.provider}/${ctx.model.id}:${ctx.thinkingLevel || "off"}`);
    const note = `Branchfork from ${source.root} (${source.currentBranch} @ ${source.head}) to ${target.hostname}:${folder} (${branch}). Both checkouts passed clean/synced preflight; no uncommitted files were transferred.`;
    let terminal: CoreTerminal;
    if (existing) {
      terminal = existing.terminal;
      const status = await core.worker<{ exists: boolean }>(target.machine, storageWorker, { action: "handoff-status", sessionId: existing.agent.sessionId, id });
      if (status.exists || existing.agent.received?.includes(id)) {
        completed.push("This handoff was already queued/delivered; not resent.");
      } else {
        const text = `${idleInstruction}\n\n${note}\n\n${await deps.summarize(ctx)}`;
        await core.worker(target.machine, storageWorker, { action: "queue", sessionId: existing.agent.sessionId, id, message: { id, text } });
        completed.push("Context-only handoff queued; the destination agent will ingest it when fully idle.");
      }
    } else {
      await core.worker(target.machine, storageWorker, { action: "prerequisites" });
      const version = await core.exec(target.machine, "pi", ["--version"]);
      const match = version.match(/\b(\d+)\.(\d+)\.(\d+)\b/);
      if (!match || (Number(match[1]) < 1 || (Number(match[1]) === 1 && (Number(match[2]) < 5 || (Number(match[2]) === 5 && Number(match[3]) < 2))))) {
        throw new Error("The destination needs Pi 1.5.2 or newer. Update Pi explicitly on that host, then retry.");
      }
      const file = await core.worker<string>(target.machine, storageWorker, { action: "snapshot", id, content: snapshot(ctx, id, note) });
      terminal = await core.launch(target.machine, folder, key, "agent", ["pi", "--fork", file, "--provider", ctx.model.provider, "--model", ctx.model.id,
        "--thinking", ctx.thinkingLevel || "off", "--name", `${source.repo}:${branch}`], { "branchfork.handoff": id });
      completed.push("Pi terminal launched with a full context fork, waiting for your instruction; startup/inbox registration may still be pending. No automatic task prompt was sent.");
    }
    const address = target.machine ? `${target.machine}/${terminal.address}` : terminal.address;
    completed.push(`Agent: ${address} (hc attach ${address}; independent of the source session).`);
    if (headless) completed.push("Headless: GUI layout and editor/shell terminals skipped.");
    else {
      try { completed.push(await deps.present(core, target.machine, folder, key, `${source.repo}:${branch}`, terminal)); }
      catch (error) { completed.push(`Branchfork succeeded; optional workspace presentation failed: ${String(error)}\nAgent and created resources remain running. Resolve the layout/tool blocker and rerun the same command; no duplicate agent will be launched.`); }
    }
    return completed.join("\n");
  } catch (error) {
    operationError = new Error(`${completed.length ? completed.join("\n") + "\n\n" : ""}${String(error instanceof Error ? error.message : error)}\nCreated resources are retained. Inspect them and resolve the blocker, then rerun /branchfork; nothing was rolled back.`);
    throw operationError;
  } finally {
    try { await core.worker(target.machine, storageWorker, { action: "unlock", key, token }); }
    catch (error) { throw new Error(`${operationError?.message || completed.join("\n")}\nCould not release branchfork lock: ${String(error)}. Recommended fix: inspect the destination lock and retained resources before manually removing a stale lock.`); }
  }
}
