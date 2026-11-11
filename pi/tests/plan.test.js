import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Use Pi's real loader and host-provided TypeBox, not a hand-written API shim.
// Override for non-managed installs with PI_TEST_PACKAGE_DIR.
const install = join(homedir(), ".pi/agent/install");
const versionFile = join(install, "current-version");
const packageDir = process.env.PI_TEST_PACKAGE_DIR ?? (existsSync(versionFile)
  ? join(install, "releases", readFileSync(versionFile, "utf8").trim(), "node_modules/@earendil-works/pi-coding-agent")
  : "");
const loaderFile = join(packageDir, "dist/core/extensions/loader.js");
const available = existsSync(loaderFile);
if (!available) console.warn("Skipping Pi integration tests: set PI_TEST_PACKAGE_DIR to an installed Pi package.");
const loader = available ? await import(pathToFileURL(loaderFile).href) : undefined;

async function harness(branch = []) {
  const runtime = loader.createExtensionRuntime();
  const entries = structuredClone(branch);
  const prompts = [];
  let tools = ["read", "bash", "write", "edit", "Agent"];
  let idle = true;
  let answer;
  let aborted = false;
  Object.assign(runtime, {
    appendEntry: (customType, data) => entries.push({ type: "custom", customType, data: structuredClone(data) }),
    sendUserMessage: (message) => prompts.push(message),
    sendMessage: () => {},
    getActiveTools: () => tools,
    setActiveTools: (names) => { tools = names; },
  });
  const loaded = await loader.loadExtensions([resolve("pi/extensions/plan.ts")], process.cwd(), undefined, runtime);
  expect(loaded.errors).toEqual([]);
  const extension = loaded.extensions[0];
  const ctx = {
    hasUI: true,
    isIdle: () => idle,
    abort: () => { aborted = true; },
    sessionManager: { getBranch: () => entries },
    ui: { notify() {}, setStatus() {}, setWidget() {}, input: async () => answer },
  };
  const event = async (name, payload = {}) => {
    let result;
    for (const handler of extension.handlers.get(name) ?? []) result = await handler(payload, ctx);
    return result;
  };
  await event("session_start");
  return {
    entries, prompts, ctx, event,
    state: () => entries.at(-1)?.data,
    command: (name, args = "") => extension.commands.get(name).handler(args, ctx),
    tool: (params, signal) => extension.tools.get("plan_todos").definition.execute("test", params, signal, undefined, ctx),
    busy: () => { idle = false; },
    answer: (value) => { answer = value; },
    aborted: () => aborted,
    tools: () => tools,
  };
}
const settle = { entries: [] };

describe.skipIf(!available)("persistent /plan extension (real Pi loader)", () => {
  test("starts exploration and keeps continuing before and after todo creation", async () => {
    const h = await harness();
    await h.command("plan", "Add a feature");
    expect(h.state().phase).toBe("planning");
    expect(h.prompts).toHaveLength(1);
    expect(h.tools()).toContain("Agent");
    expect(h.tools()).toContain("plan_todos");
    expect((await h.event("agent_before_settle", settle)).continue).toBe(true);
    await h.tool({ action: "create", todos: ["Implement", "Run tests"] });
    await h.tool({ action: "complete", id: 1, evidence: "Implemented in src/feature.ts" });
    // A prose 'done' message cannot clear remaining work.
    expect((await h.event("agent_before_settle", { ...settle, messages: [{ content: "All done!" }] })).continue).toBe(true);
    expect(h.state().todos[1].done).toBe(false);
    await h.tool({ action: "complete", id: 2, evidence: "bun test: 5 passed" });
    expect(h.state().phase).toBe("complete");
    expect(await h.event("agent_before_settle", settle)).toBeUndefined();
  });

  test("rejects empty lists, invalid ids, missing evidence, and dropping existing todos", async () => {
    const h = await harness();
    await h.command("plan", "Work");
    await expect(h.tool({ action: "create", todos: [] })).rejects.toThrow();
    await h.tool({ action: "create", todos: ["Implement"] });
    await expect(h.tool({ action: "create", todos: ["Replace"] })).rejects.toThrow();
    await expect(h.tool({ action: "complete", id: 999, evidence: "done" })).rejects.toThrow();
    await expect(h.tool({ action: "complete", id: 1 })).rejects.toThrow();
    await h.tool({ action: "add", todos: ["Verify"] });
    expect(h.state().todos).toHaveLength(2);
  });

  test("requires actionable blocker details, preserves work, and explicitly resumes", async () => {
    const h = await harness();
    await h.command("plan", "Work");
    await h.tool({ action: "create", todos: ["Implement"] });
    await expect(h.tool({ action: "block", reason: "No credentials" })).rejects.toThrow();
    expect(h.state().phase).toBe("executing");
    await h.tool({ action: "block", reason: "No credentials", attempted: "Checked configured auth; service returned 401", needed: "Supply service credentials" });
    expect(await h.event("agent_before_settle", settle)).toBeUndefined();
    expect(h.state().todos[0].done).toBe(false);
    await h.command("plan-resume");
    expect(h.state().phase).toBe("executing");
    expect(h.state().blocker).toBeUndefined();
    expect((await h.event("agent_before_settle", settle)).continue).toBe(true);
  });

  test("clarifies interactively; unanswered/headless questions become blockers", async () => {
    const h = await harness();
    await h.command("plan", "Work");
    h.answer("Use PostgreSQL");
    const answer = await h.tool({ action: "ask", question: "Which database?" });
    expect(answer.content[0].text).toContain("PostgreSQL");
    expect(h.state().phase).toBe("planning");
    h.ctx.hasUI = false;
    await h.tool({ action: "ask", question: "Which account?" });
    expect(h.state().phase).toBe("blocked");
    expect(h.state().blocker.reason).toBe("Which account?");
  });

  test("restores branch-relative state and injects it after compaction", async () => {
    const h = await harness();
    await h.command("plan", "Work");
    await h.tool({ action: "create", todos: ["Implement", "Verify"] });
    const earlierBranch = structuredClone(h.entries);
    await h.tool({ action: "complete", id: 1, evidence: "Implementation exists" });
    const reloaded = await harness(h.entries);
    const context = await reloaded.event("context", { messages: [] });
    expect(context.messages.at(-1).content).toContain('"done":true');
    expect(context.messages.at(-1).content).toContain("Verify");
    h.entries.splice(0, h.entries.length, ...earlierBranch);
    await h.event("session_tree");
    const branched = await h.tool({ action: "list" });
    expect(branched.details.todos[0].done).toBe(false);
    h.entries.length = 0;
    await h.event("session_tree");
    expect(await h.event("agent_before_settle", settle)).toBeUndefined();
  });

  test("honors cancellation, abort signals, and busy commands", async () => {
    const h = await harness();
    await h.command("plan");
    expect(h.prompts).toHaveLength(0);
    h.busy();
    await h.command("plan", "Work");
    expect(h.prompts).toHaveLength(0);
    const active = await harness();
    await active.command("plan", "Work");
    await active.command("plan", "Overwrite");
    expect(active.prompts).toHaveLength(1);
    await expect(active.tool({ action: "create", todos: ["Work"] }, AbortSignal.abort())).rejects.toThrow();
    await active.command("plan-cancel");
    expect(active.aborted()).toBe(true);
    expect(active.state().phase).toBe("cancelled");
    expect(await active.event("agent_before_settle", settle)).toBeUndefined();
    await expect(active.tool({ action: "create", todos: ["Work"] })).rejects.toThrow();
  });
});
