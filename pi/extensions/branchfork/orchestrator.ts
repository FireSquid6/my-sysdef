import { createHash, randomUUID } from "node:crypto";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { launchProject } from "../../../herdr/mods/source-picker/project-launch.js";
import { gitWorker } from "./git-worker.js";
import { storageWorker } from "./storage-worker.js";
import { callWorker, run, type Run } from "./process.ts";
import { findHerdr, type Herdr, type Selection, type Space, type World } from "./herdr.ts";
import { handoffId, idleInstruction, snapshot, summarize } from "./context.ts";

export interface Source { root: string; primary: string; repo: string; origin: string; currentBranch: string; head: string }
interface GitResult { ok: boolean; error?: string; source?: Source; folder?: string; completed?: string[] }
interface Agent { sessionId: string; cwd: string; terminal: string; tab?: string; received?: string[] }
interface Dependencies { run: Run; findHerdr: typeof findHerdr; summarize: typeof summarize }

export function parseArgs(args: string) {
  const parts = args.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 1 || parts.length > 2 || parts.some(part => part.startsWith("-") || /[\0\r\n]/.test(part))) {
    throw new Error("Usage: /branchfork <branch> [host]. Supply a literal branch and an optional saved Herdr machine name.");
  }
  return { branch: parts[0]!, host: parts[1] };
}

export async function matchingSpace(herdr: Herdr, machine: string, folder: string): Promise<Space | undefined> {
  const world = await herdr.app<World>({ ls: true });
  const matches: Space[] = [];
  for (const space of world.spaces.filter(space => (space.machine || "") === machine)) {
    if (!space.folder) continue;
    // Canonicalize paths on the destination, not the machine displaying Herdr.
    let canonical: string;
    try { canonical = await herdr.worker<string>(machine, storageWorker, { action: "canonical", path: space.folder }); }
    catch (error) {
      if (space.folder === folder) throw error;
      continue; // An unrelated workspace may point at a deleted folder.
    }
    if (canonical === folder) matches.push(space);
  }
  if (matches.length > 1) throw new Error("More than one Herdr workspace matches this host/worktree. Choose or consolidate them explicitly before retrying.");
  return matches[0];
}

export async function branchfork(args: string, ctx: ExtensionCommandContext, overrides: Partial<Dependencies> = {}) {
  const deps = { run, findHerdr, summarize, ...overrides };
  const { branch, host } = parseArgs(args);
  await ctx.waitForIdle();
  if (!ctx.model) throw new Error("Select a Pi model before forking its context.");
  const inspected = await callWorker<GitResult>(deps.run, "", gitWorker, { action: "inspect", cwd: ctx.cwd, branch });
  if (!inspected.ok || !inspected.source) throw new Error(inspected.error || "Could not inspect source repository.");
  const source = inspected.source;
  const herdr = await deps.findHerdr(deps.run);
  const target = await herdr.target(host);
  const key = createHash("sha256").update(JSON.stringify([source.origin, source.repo, branch])).digest("hex");
  const token = randomUUID();
  const completed: string[] = [];
  let operationError: Error | undefined;
  await herdr.worker(target.machine, storageWorker, { action: "lock", key, token });
  try {
    const known = await herdr.app<World>({ ls: true });
    const candidates = known.spaces.filter(space => (space.machine || "") === target.machine).map(space => space.folder);
    const prepared = await herdr.worker<GitResult>(target.machine, gitWorker, { action: "prepare", source, branch, local: target.local, candidates });
    completed.push(...(prepared.completed || []));
    if (!prepared.ok || !prepared.folder) throw new Error(prepared.error || "Could not prepare worktree.");
    const folder = prepared.folder;
    completed.push(`Worktree ready: ${target.hostname}:${folder}`);
    const space = await matchingSpace(herdr, target.machine, folder);
    const registrations = await herdr.worker<Agent[]>(target.machine, storageWorker, { action: "agents" });
    const terminals = space?.tabs.flatMap(tab => tab.terminals.map(terminal => ({ ...terminal, tab: tab.id }))) ?? [];
    const piTerminals = terminals.filter(terminal => terminal.app === "pi");
    const agents = registrations.filter(agent => (agent.cwd === folder || agent.cwd.startsWith(folder + "/")) && terminals.some(terminal => terminal.tab === agent.tab || (agent.terminal && terminal.terminal.split("/").at(-1) === agent.terminal.split("/").at(-1))));
    const identities = new Set([...piTerminals.map(terminal => terminal.terminal), ...agents.map(agent => terminals.find(terminal => terminal.tab === agent.tab || (agent.terminal && terminal.terminal.split("/").at(-1) === agent.terminal.split("/").at(-1)))?.terminal)].filter(Boolean));
    if (identities.size > 1 || agents.length > 1) throw new Error("More than one Pi agent is running in the destination workspace. Stop and choose the intended agent/workspace explicitly; no handoff was sent.");
    if (piTerminals.length && !agents.length) throw new Error("The existing Pi agent has no branchfork inbox registration. Run /reload there (install this extension on that host if needed), then retry; terminal keystrokes will not be used.");
    const agent = agents[0];
    const id = handoffId(ctx.sessionManager.getSessionId(), ctx.sessionManager.getBranch(), `${target.hostname}:${folder}:${source.currentBranch}:${source.head}:${ctx.model.provider}/${ctx.model.id}:${ctx.thinkingLevel || "off"}`);
    const note = `Branchfork from ${source.root} (${source.currentBranch} @ ${source.head}) to ${target.hostname}:${folder} (${branch}). Both checkouts passed clean/synced preflight; no uncommitted files were transferred.`;
    let agentArgv = ["pi"];
    let update: { id: string; text: string } | undefined;
    if (agent) {
      // Check durable receipts before spending tokens on a repeated summary.
      const status = await herdr.worker<{ exists: boolean }>(target.machine, storageWorker, { action: "handoff-status", sessionId: agent.sessionId, id });
      if (!status.exists && !agent.received?.includes(id)) update = { id, text: `${idleInstruction}\n\n${note}\n\n${await deps.summarize(ctx)}` };
    } else {
      await herdr.worker(target.machine, storageWorker, { action: "prerequisites" });
      const version = await herdr.exec(target.machine, "pi", ["--version"]);
      const match = version.match(/\b(\d+)\.(\d+)\.(\d+)\b/);
      if (!match || (Number(match[1]) < 1 || (Number(match[1]) === 1 && (Number(match[2]) < 5 || (Number(match[2]) === 5 && Number(match[3]) < 2))))) {
        throw new Error("The destination needs Pi 1.5.2 or newer for the verified fork/inbox APIs. Update Pi explicitly on that host, then retry.");
      }
      const file = await herdr.worker<string>(target.machine, storageWorker, { action: "snapshot", id, content: snapshot(ctx, id, note) });
      // --fork uses the DESTINATION cwd and discovers its instructions/extensions; no prompt argument starts a turn.
      agentArgv = ["pi", "--fork", file, "--provider", ctx.model.provider, "--model", ctx.model.id, "--thinking", ctx.thinkingLevel || "off", "--name", `${source.repo}:${branch}`];
    }
    const selection = await herdr.app<Selection>({ status: true });
    let launchError: unknown;
    let changedSelection = false;
    try {
      await launchProject({
        folder, machine: target.machine, name: `${source.repo}:${branch}`, agentArgv, focus: false,
        existing: space ? { space: space.id, agentTab: agent ? terminals.find(terminal => terminal.terminal.split("/").at(-1) === agent.terminal.split("/").at(-1) || terminal.tab === agent.tab)?.tab : undefined, tabNames: space.tabs.map(tab => tab.name) } : null,
      }, { command: (name: string, args: unknown) => {
        if (name === "space.new" || name === "tab.new") changedSelection = true;
        return herdr.command(name, args);
      } });
      completed.push(`Herdr workspace ${space ? "reused" : "created"}: ${source.repo}:${branch}`);
    } catch (error) {
      launchError = error;
      throw error;
    } finally {
      // Legacy herdr-app ignores focus:false. Restore original selection even on partial failure.
      try { if (changedSelection) await herdr.restore(selection); }
      catch (error) { throw new Error(`${launchError ? String(launchError) + "\n" : ""}Restoring Herdr selection failed: ${String(error)}`); }
    }
    if (agent && update) {
      await herdr.worker(target.machine, storageWorker, { action: "queue", sessionId: agent.sessionId, id, message: update });
      completed.push("Context-only handoff queued; the destination agent will ingest it when fully idle.");
    } else if (agent) completed.push("This handoff was already queued/delivered; not resent.");
    else completed.push("Pi launched with a full context fork; waiting for your instruction, with no automatic task prompt.");
    return completed.join("\n");
  } catch (error) {
    operationError = new Error(`${completed.length ? completed.join("\n") + "\n\n" : ""}${String(error instanceof Error ? error.message : error)}\nCreated resources are retained. Inspect them and resolve the blocker, then rerun /branchfork; nothing was rolled back.`);
    throw operationError;
  } finally {
    try { await herdr.worker(target.machine, storageWorker, { action: "unlock", key, token }); }
    catch (error) { throw new Error(`${operationError?.message || completed.join("\n")}\nCould not release branchfork lock: ${String(error)}. Recommended fix: inspect the destination lock and retained resources before manually removing a stale lock.`); }
  }
}
