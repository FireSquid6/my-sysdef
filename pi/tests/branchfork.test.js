import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { branchfork, parseArgs } from "../extensions/branchfork/orchestrator.ts";
import { receiveInbox } from "../extensions/branchfork/inbox.ts";
import { handoffId, snapshot } from "../extensions/branchfork/context.ts";
import { onHost, callWorker, run } from "../extensions/branchfork/process.ts";
import { storageWorker } from "../extensions/branchfork/storage-worker.js";
import { Herdr } from "../extensions/branchfork/herdr.ts";

const temporary = [];
afterEach(() => { for (const dir of temporary.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
function temp() { const dir = fs.mkdtempSync(path.join(os.tmpdir(), "branchfork-")); temporary.push(dir); return dir; }
const entry = { type: "message", id: "m1", parentId: null, timestamp: "2026-01-01T00:00:00Z", message: { role: "user", content: "Important requirements", timestamp: 1 } };
function context() {
  const entries = [structuredClone(entry)];
  return {
    cwd: "/source/repo", model: { provider: "test", id: "model" }, thinkingLevel: "high",
    waitForIdle: async () => {}, isIdle: () => true,
    sessionManager: { getBranch: () => entries, getSessionId: () => "source-session", getHeader: () => ({ type: "session", version: 3, id: "source-session", cwd: "/source/repo" }), getSessionFile: () => "/private/source.jsonl" },
  };
}
function harness({ existing = false, count = 1, registered = true, received = false, failEditor = false } = {}) {
  const ctx = context(), calls = [], folder = "/worktrees/repo/feature/next";
  const tabs = existing ? Array.from({ length: count }, (_, n) => ({ id: `tab${n}`, name: n ? `agent${n}` : "agent", terminals: [{ terminal: `host/t${n}`, pane: `p${n}`, app: "pi" }] })) : [];
  const space = { id: "space", name: "anything", folder, machine: "host", tabs };
  let summaries = 0, queued = false;
  const id = handoffId("source-session", ctx.sessionManager.getBranch(), `destination:${folder}:main:sha:test/model:high`);
  const registrations = registered ? tabs.map((tab, n) => ({ sessionId: `dest-${n}`, cwd: folder, terminal: `t${n}`, received: received ? [id] : [] })) : [];
  const herdr = {
    exec: async () => "1.5.2",
    target: async host => { calls.push(["target", host]); return { machine: "host", hostname: "destination", local: false }; },
    worker: async (_machine, _worker, request) => {
      calls.push([request.action, request]);
      switch (request.action) {
        case "prepare": return { ok: true, folder, completed: ["Created worktree"] };
        case "canonical": return request.path;
        case "agents": return registrations;
        case "snapshot": return "/private/snapshot.jsonl";
        case "handoff-status": return { exists: queued };
        case "queue": queued = true; return { queued: true };
        default: return { ok: true };
      }
    },
    app: async request => request.ls ? { spaces: existing ? [space] : [] } : { space: "original", tab: "original-tab", focused_pane: "original-pane" },
    command: async (name, args) => {
      calls.push([name, args]);
      if (failEditor && args.name === "editor") throw new Error("editor spawn failed");
      return { space: "space", tab: name === "space.new" ? "new-agent" : `new-${args.name}` };
    },
    restore: async selection => calls.push(["restore", selection]),
  };
  const deps = {
    run: async () => ({ code: 0, stdout: JSON.stringify({ ok: true, source: { root: "/source/repo", primary: "/source/repo", repo: "repo", origin: "git@example.com:repo", currentBranch: "main", head: "sha" } }), stderr: "" }),
    findHerdr: async () => herdr,
    summarize: async () => { summaries++; return "Relevant decisions and remaining work"; },
  };
  return { ctx, deps, calls, summaries: () => summaries, folder, tabs };
}

describe("branchfork orchestration", () => {
  test("new workspace uses the shared picker layout, exact model/thinking, full fork and no kickoff prompt", async () => {
    const h = harness();
    const result = await branchfork("feature/next other-host", h.ctx, h.deps);
    expect(h.calls.find(call => call[0] === "target")[1]).toBe("other-host");
    const create = h.calls.find(call => call[0] === "space.new")[1];
    expect(create.argv).toEqual(["pi", "--fork", "/private/snapshot.jsonl", "--provider", "test", "--model", "model", "--thinking", "high", "--name", "repo:feature/next"]);
    expect(create.focus).toBe(false);
    expect(h.calls.filter(call => call[0] === "tab.new").map(call => call[1].name)).toEqual(["editor", "term1", "term2"]);
    expect(h.calls.find(call => call[0] === "restore")[1].tab).toBe("original-tab");
    const content = h.calls.find(call => call[0] === "snapshot")[1].content;
    expect(content).toContain("Important requirements");
    expect(content).toContain("CONTEXT ONLY");
    expect(result).toContain("waiting for your instruction");
    expect(h.summaries()).toBe(0);
    expect(h.calls.some(call => /prompt|send_keys|task/.test(call[0]))).toBe(false);
  });
  test("existing workspace gets a summary via durable inbox, never another agent or terminal input", async () => {
    const h = harness({ existing: true });
    await branchfork("feature/next", h.ctx, h.deps);
    expect(h.calls.find(call => call[0] === "target")[1]).toBeUndefined();
    expect(h.calls.some(call => call[0] === "space.new")).toBe(false);
    expect(h.calls.filter(call => call[0] === "tab.new").some(call => call[1].name === "agent")).toBe(false);
    const queue = h.calls.find(call => call[0] === "queue")[1];
    expect(queue.sessionId).toBe("dest-0");
    expect(queue.message.text).toContain("CONTEXT ONLY");
    expect(queue.message.text).toContain("Relevant decisions");
    expect(h.summaries()).toBe(1);
    await branchfork("feature/next", h.ctx, h.deps);
    expect(h.calls.filter(call => call[0] === "queue")).toHaveLength(1);
    expect(h.summaries()).toBe(1);
  });
  test("does not resend a handoff already present in a fork's history", async () => {
    const h = harness({ existing: true, received: true });
    expect(await branchfork("feature/next", h.ctx, h.deps)).toContain("not resent");
    expect(h.summaries()).toBe(0);
  });
  test("stops whenever multiple Pi agents exist, even if only one has the extension", async () => {
    const h = harness({ existing: true, count: 2 });
    await expect(branchfork("feature/next", h.ctx, h.deps)).rejects.toThrow("More than one Pi agent");
    expect(h.calls.some(call => call[0] === "queue" || call[0] === "space.new")).toBe(false);
    expect(h.calls.at(-1)[0]).toBe("unlock");
  });
  test("asks for reload rather than typing into an unregistered Pi", async () => {
    const h = harness({ existing: true, registered: false });
    await expect(branchfork("feature/next", h.ctx, h.deps)).rejects.toThrow("Run /reload");
    expect(h.summaries()).toBe(0);
  });
  test("starts a fresh full fork in an existing workspace with no Pi agent", async () => {
    const h = harness({ existing: true, count: 0 });
    await branchfork("feature/next", h.ctx, h.deps);
    expect(h.calls.some(call => call[0] === "space.new")).toBe(false);
    const agent = h.calls.find(call => call[0] === "tab.new" && call[1].name === "agent")[1];
    expect(agent.space).toBe("space");
    expect(agent.argv).toContain("--fork");
  });
  test("reports retained worktree and partial tabs and restores selection after launch failure", async () => {
    const h = harness({ failEditor: true });
    await expect(branchfork("feature/next", h.ctx, h.deps)).rejects.toThrow("Created worktree");
    expect(h.calls.some(call => call[0] === "restore")).toBe(true);
    expect(h.calls.some(call => /close|kill|delete/.test(call[0]))).toBe(false);
    expect(h.calls.at(-1)[0]).toBe("unlock");
  });
  test("usage errors occur before Git or Herdr mutations", () => {
    for (const value of ["", "a b c", "-bad"]) expect(() => parseArgs(value)).toThrow("Usage:");
    expect(parseArgs("feature/nested")).toEqual({ branch: "feature/nested", host: undefined });
  });
});

describe("context-only inbox", () => {
  test("busy agent defers until idle, delivery triggers no turn, and receipts prevent replay", () => {
    const root = temp(), ctx = context(), sent = [];
    let idle = false;
    ctx.isIdle = () => idle;
    const folder = path.join(root, "inbox/source-session");
    fs.mkdirSync(folder, { recursive: true });
    const file = path.join(folder, "handoff.json");
    const data = { id: "handoff", text: "Context only, wait for instructions" };
    fs.writeFileSync(file, JSON.stringify(data));
    const pi = { sendMessage: (message, options) => {
      sent.push({ message, options });
      ctx.sessionManager.getBranch().push({ type: "custom_message", customType: message.customType, details: message.details });
    } };
    expect(receiveInbox(pi, ctx, root)).toBe(0);
    expect(sent).toHaveLength(0);
    expect(fs.existsSync(file)).toBe(true);
    idle = true;
    expect(receiveInbox(pi, ctx, root)).toBe(1);
    expect(sent[0].options).toEqual({ triggerTurn: false });
    expect(fs.existsSync(file)).toBe(false);
    fs.writeFileSync(file, JSON.stringify(data));
    expect(receiveInbox(pi, ctx, root)).toBe(0);
    expect(sent).toHaveLength(1);
    expect(fs.statSync(path.join(root, "receipts/source-session/handoff.json")).mode & 0o777).toBe(0o600);
  });
  test("snapshots are independent files with active branch entries and original remains unchanged", () => {
    const ctx = context(), original = structuredClone(ctx.sessionManager.getBranch());
    const lines = snapshot(ctx, "handoff", "Source and destination").trim().split("\n").map(JSON.parse);
    expect(lines[0].id).not.toBe("source-session");
    expect(lines[0].parentSession).toBe("/private/source.jsonl");
    expect(lines[1]).toEqual(original[0]);
    expect(lines.at(-1).parentId).toBe("m1");
    expect(ctx.sessionManager.getBranch()).toEqual(original);
  });
});

describe("host transport", () => {
  test("runs self-contained workers through a real Node subprocess", async () => {
    const value = await callWorker(run, "", storageWorker, { action: "identity" });
    expect(value.hostname).toBe(os.hostname());
    expect(value.home).toBe(os.homedir());
  });
  test("remote envelopes are base64 decoded and payloads travel on stdin without shell interpolation", async () => {
    const calls = [];
    const fake = async (...args) => { calls.push(args); return { code: 0, stdout: JSON.stringify({ code: 0, stdout: Buffer.from("answer").toString("base64"), stderr: "", truncated: false }), stderr: "" }; };
    expect(await onHost(fake, "desktop", "node", ["-e", "script"], "private transcript")).toBe("answer");
    expect(calls[0][1]).toEqual(["exec", "--json", "--on", "desktop", "--timeout", "180", "--stdin", "--", "node", "-e", "script"]);
    expect(calls[0][2].input).toBe("private transcript");
    expect(JSON.stringify(calls[0][1])).not.toContain("private transcript");
  });
  test("rejects truncated or timed-out remote results instead of parsing partial state", async () => {
    const fake = async () => ({ code: 0, stdout: JSON.stringify({ code: 0, stdout: "", stderr: "", truncated: true }), stderr: "" });
    await expect(onHost(fake, "host", "node", [])).rejects.toThrow("truncated");
  });
  test("private transported storage deduplicates payloads and enforces ownership of locks", async () => {
    const agentDir = temp();
    const isolated = (program, argv, options) => run("env", [`PI_CODING_AGENT_DIR=${agentDir}`, program, ...argv], options);
    const worker = request => callWorker(isolated, "", storageWorker, request);
    const content = "private context\n".repeat(20000);
    const file = await worker({ action: "snapshot", id: "snapshot", content });
    expect(fs.readFileSync(file, "utf8")).toBe(content);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(fs.statSync(path.dirname(file)).mode & 0o777).toBe(0o700);
    await worker({ action: "queue", sessionId: "custom.session-1", id: "handoff", message: { id: "handoff", text: "original" } });
    expect(await worker({ action: "queue", sessionId: "custom.session-1", id: "handoff", message: { id: "handoff", text: "do not overwrite" } })).toEqual({ queued: true, duplicate: true });
    const inbox = path.join(agentDir, "branchfork/inbox/custom.session-1/handoff.json");
    expect(JSON.parse(fs.readFileSync(inbox, "utf8")).text).toBe("original");
    await worker({ action: "lock", key: "repo", token: "first" });
    await expect(worker({ action: "lock", key: "repo", token: "second" })).rejects.toThrow("Another branchfork");
    await worker({ action: "unlock", key: "repo", token: "wrong" });
    await expect(worker({ action: "lock", key: "repo", token: "second" })).rejects.toThrow("Another branchfork");
    await worker({ action: "unlock", key: "repo", token: "first" });
    expect(await worker({ action: "lock", key: "repo", token: "second" })).toEqual({ ok: true });
  });
  test("nested routing via a remote GUI decodes both Core exec envelopes", async () => {
    const inner = JSON.stringify({ code: 0, stdout: Buffer.from("destination answer").toString("base64"), stderr: "" });
    const fake = async () => ({ code: 0, stdout: JSON.stringify({ code: 0, stdout: Buffer.from(inner).toString("base64"), stderr: "" }), stderr: "" });
    expect(await new Herdr(fake, "gui-host").exec("target-host", "node", ["-e", "script"], "payload")).toBe("destination answer");
  });
  test("omitted host maps the Pi hostname to a GUI-configured remote, not GUI-local", async () => {
    const herdr = new Herdr(async () => ({ code: 0, stdout: JSON.stringify({ hostname: "gui-machine" }), stderr: "" }), "");
    herdr.machines = async () => [{ name: "source-host", host: os.hostname(), id: "id", state: "connected" }];
    herdr.worker = async () => ({ hostname: os.hostname() });
    expect(await herdr.target()).toEqual({ machine: "source-host", hostname: os.hostname(), local: true });
  });
});
