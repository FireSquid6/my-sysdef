import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { branchfork, destinationAgent, parseArgs } from "../extensions/branchfork/orchestrator.ts";
import { receiveInbox } from "../extensions/branchfork/inbox.ts";
import { handoffId, snapshot } from "../extensions/branchfork/context.ts";
import { onHost, callWorker, run } from "../extensions/branchfork/process.ts";
import { storageWorker } from "../extensions/branchfork/storage-worker.js";
import { Herdr } from "../extensions/branchfork/herdr.ts";
import { createHash } from "node:crypto";

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
function harness({ existing = false, count = 1, registered = true, received = false, failPresentation = false } = {}) {
  const ctx = context(), calls = [], folder = "/worktrees/repo/feature/next";
  let summaries = 0, queued = false;
  const key = createHash("sha256").update(JSON.stringify(["git@example.com:repo", "repo", "feature/next"])).digest("hex");
  const id = handoffId("source-session", ctx.sessionManager.getBranch(), `destination:${folder}:main:sha:test/model:high`);
  const terminals = existing ? Array.from({ length: count }, (_, n) => ({ address: `t${n}`, cwd: folder, state: "live", argv: ["pi"], labels: {} })) : [];
  const registrations = registered ? terminals.map((t, n) => ({ sessionId: `dest-${n}`, cwd: folder, terminal: t.address, coreId: "target-core", received: received ? [id] : [] })) : [];
  const herdr = {
    exec: async () => "1.5.2",
    identity: async () => "target-core",
    terminals: async () => terminals,
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
    launch: async (machine, cwd, key, role, argv, labels) => {
      calls.push(["launch", { machine, cwd, key, role, argv, labels }]);
      const terminal = { address: "tnew", cwd, argv, state: "live", labels: { "branchfork.key": key, "branchfork.role": role, ...labels } };
      terminals.push(terminal);
      return terminal;
    },
  };
  const deps = {
    run: async () => ({ code: 0, stdout: JSON.stringify({ ok: true, source: { root: "/source/repo", primary: "/source/repo", repo: "repo", origin: "git@example.com:repo", currentBranch: "main", head: "sha" } }), stderr: "" }),
    findHerdr: async () => herdr,
    summarize: async () => { summaries++; return "Relevant decisions and remaining work"; },
    present: async () => { calls.push(["present"]); if (failPresentation) throw Error("editor spawn failed"); return "Herdr workspace ready"; },
  };
  return { ctx, deps, calls, summaries: () => summaries, folder, terminals, registrations, key, id };
}

describe("branchfork orchestration", () => {
  test("core launch preserves exact model/thinking, full fork and no kickoff prompt", async () => {
    const h = harness();
    const result = await branchfork("feature/next other-host", h.ctx, h.deps);
    expect(h.calls.find(call => call[0] === "target")[1]).toBe("other-host");
    const create = h.calls.find(call => call[0] === "launch")[1];
    expect(create.argv).toEqual(["pi", "--fork", "/private/snapshot.jsonl", "--provider", "test", "--model", "model", "--thinking", "high", "--name", "repo:feature/next"]);
    expect(create.role).toBe("agent");
    expect(create.labels["branchfork.handoff"]).toBe(h.id);
    expect(result).toContain("hc attach host/tnew");
    expect(h.calls.some(call => call[0] === "present")).toBe(true);
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
    expect(h.calls.some(call => call[0] === "launch")).toBe(false);
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
    expect(h.calls.some(call => call[0] === "queue" || call[0] === "launch")).toBe(false);
    expect(h.calls.at(-1)[0]).toBe("unlock");
  });
  test("asks for reload rather than typing into an unregistered Pi", async () => {
    const h = harness({ existing: true, registered: false });
    await expect(branchfork("feature/next", h.ctx, h.deps)).rejects.toThrow("/reload");
    expect(h.summaries()).toBe(0);
  });
  test("headless runs never access presentation and still fork an independent agent", async () => {
    const h = harness();
    const result = await branchfork("feature/next --headless", h.ctx, h.deps);
    expect(h.calls.some(call => call[0] === "present")).toBe(false);
    expect(h.calls.find(call => call[0] === "launch")[1].argv).toContain("--fork");
    expect(result).toContain("Headless");
  });
  test("presentation failure is success, retains the agent, and retry before registration never duplicates it", async () => {
    const h = harness({ failPresentation: true });
    const result = await branchfork("feature/next", h.ctx, h.deps);
    expect(result).toContain("Branchfork succeeded; optional workspace presentation failed");
    expect(result).toContain("host/tnew");
    await expect(branchfork("feature/next", h.ctx, h.deps)).rejects.toThrow("no matching branchfork inbox registration");
    expect(h.calls.filter(call => call[0] === "launch")).toHaveLength(1);
    h.registrations.push({ sessionId: "new-session", cwd: h.folder, terminal: "tnew", coreId: "target-core", received: [h.id] });
    expect(await branchfork("feature/next", h.ctx, h.deps)).toContain("not resent");
    expect(h.calls.filter(call => call[0] === "launch")).toHaveLength(1);
    expect(h.summaries()).toBe(0);
    expect(h.calls.some(call => /close|kill|delete/.test(call[0]))).toBe(false);
    expect(h.calls.at(-1)[0]).toBe("unlock");
  });
  test("registered agents in hidden terminals are discovered without any GUI workspace", async () => {
    const h = harness({ existing: true });
    h.terminals[0].argv = ["fish"];
    h.terminals[0].foreground = { argv: ["pi"], cwd: h.folder + "/src" };
    await branchfork("feature/next --headless", h.ctx, h.deps);
    expect(h.calls.some(call => call[0] === "queue")).toBe(true);
    expect(h.calls.some(call => call[0] === "launch" || call[0] === "present")).toBe(false);
  });
  test("a Pi in a subdirectory without registration also blocks duplication", async () => {
    const h = harness({ existing: true, registered: false });
    h.terminals[0].cwd += "/src";
    await expect(branchfork("feature/next --headless", h.ctx, h.deps)).rejects.toThrow("run /reload");
  });
  test("registrations from another core namespace cannot select an unrelated terminal with the same ID", async () => {
    const h = harness({ existing: true });
    h.registrations[0].coreId = "other-core";
    h.terminals[0].argv = ["fish"];
    h.terminals[0].cwd = "/unrelated";
    expect(await destinationAgent({}, "", h.folder, h.key, h.terminals, h.registrations, "target-core")).toBeUndefined();
    h.registrations[0].terminal = "other-core/t0";
    expect(await destinationAgent({}, "", h.folder, h.key, h.terminals, h.registrations, "target-core")).toBeUndefined();
  });
  test("usage errors occur before Git or Herdr mutations", () => {
    for (const value of ["", "a b c", "-bad", "a --unknown", "a --headless --headless"]) expect(() => parseArgs(value)).toThrow("Usage:");
    expect(parseArgs("feature/nested")).toEqual({ branch: "feature/nested", host: undefined, headless: false });
    expect(parseArgs("feature/nested minibox-one --headless")).toEqual({ branch: "feature/nested", host: "minibox-one", headless: true });
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
  test("omitted host uses the Pi host without consulting a GUI or saved machines", async () => {
    const herdr = new Herdr(async () => { throw Error("No external process should run"); });
    expect(await herdr.target()).toEqual({ machine: "", hostname: os.hostname(), local: true });
  });
  test("explicit host resolves using the invoking core's saved machine list", async () => {
    const herdr = new Herdr(async (program, argv) => {
      expect(program).toBe("hc");
      expect(argv).toEqual(["machine", "ls", "--json"]);
      return { code: 0, stdout: JSON.stringify({ machines: [{ name: "minibox-one", id: "remote-id", host: "minibox-one", state: "connected" }] }), stderr: "" };
    });
    herdr.worker = async () => ({ hostname: os.hostname() });
    expect(await herdr.target("minibox-one")).toEqual({ machine: "minibox-one", hostname: os.hostname(), local: false });
    await expect(herdr.target("missing")).rejects.toThrow("Cannot uniquely resolve");
  });
  test("an explicit saved machine named like this hostname is still a remote route", async () => {
    const herdr = new Herdr(async () => ({ code: 0, stdout: JSON.stringify({ machines: [{ name: os.hostname(), id: "other-core", host: os.hostname(), state: "connected" }] }), stderr: "" }));
    herdr.worker = async () => ({ hostname: os.hostname() });
    expect(await herdr.target(os.hostname())).toEqual({ machine: os.hostname(), hostname: os.hostname(), local: false });
  });
  test("core launch owns an independent persistent terminal, with no task or GUI flags", async () => {
    const calls = [];
    const herdr = new Herdr(async (program, argv) => {
      calls.push([program, argv]);
      return { code: 0, stdout: JSON.stringify({ address: "t42", state: "live" }), stderr: "" };
    });
    herdr.worker = async (_machine, _worker, request) => {
      expect(request).toEqual({ action: "executable", program: "pi" });
      return "/absolute/pi";
    };
    await herdr.launch("", "/worktree", "abcdef", "agent", ["pi", "--fork", "/private/context"]);
    expect(calls[0][0]).toBe("hc");
    for (const flag of ["--bg", "--json", "--no-parent", "--outlive-parent", "--no-notify"]) expect(calls[0][1]).toContain(flag);
    expect(calls[0][1].slice(-4)).toEqual(["--", "/absolute/pi", "--fork", "/private/context"]);
  });
});
