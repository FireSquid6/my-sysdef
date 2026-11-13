import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { snapshot } from "../extensions/branchfork/context.ts";

const install = path.join(os.homedir(), ".pi/agent/install");
const version = path.join(install, "current-version");
const packageDir = process.env.PI_TEST_PACKAGE_DIR ?? (fs.existsSync(version) ? path.join(install, "releases", fs.readFileSync(version, "utf8").trim(), "node_modules/@earendil-works/pi-coding-agent") : "");
const available = fs.existsSync(path.join(packageDir, "dist/core/extensions/loader.js"));
if (!available) console.warn("Skipping branchfork Pi compatibility tests: set PI_TEST_PACKAGE_DIR to an installed Pi package.");
const loader = available ? await import(pathToFileURL(path.join(packageDir, "dist/core/extensions/loader.js")).href) : undefined;
const SessionManager = available ? (await import(pathToFileURL(path.join(packageDir, "dist/core/session-manager.js")).href)).SessionManager : undefined;
const directories = [];
afterEach(() => { for (const dir of directories.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
const temporary = () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), "branchfork-pi-")); directories.push(dir); return dir; };

describe.skipIf(!available)("branchfork compatibility with the installed Pi", () => {
  test("real loader discovers /branchfork, and startup/reload/shutdown own their inbox resources", async () => {
    const dir = temporary(), original = process.env.PI_CODING_AGENT_DIR;
    const originalTerminal = process.env.HC_TERMINAL_ID;
    delete process.env.HC_TERMINAL_ID; // Standalone Pi: never inspect the user's core from a loader test.
    process.env.PI_CODING_AGENT_DIR = dir;
    let extension;
    try {
      const runtime = loader.createExtensionRuntime();
      const sm = SessionManager.inMemory(dir);
      const sent = [];
      runtime.sendMessage = (message, options) => {
        sent.push({ message, options });
        sm.appendCustomMessageEntry(message.customType, message.content, message.display, message.details);
      };
      const linked = path.join(dir, "extensions");
      fs.symlinkSync(path.resolve("pi/extensions"), linked, "dir");
      const loaded = await loader.loadExtensions([path.join(linked, "branchfork/index.ts")], dir, undefined, runtime);
      expect(loaded.errors).toEqual([]);
      extension = loaded.extensions[0];
      expect(extension.commands.has("branchfork")).toBe(true);
      const ctx = { cwd: dir, isIdle: () => true, sessionManager: sm, ui: { notify() {}, setStatus() {} } };
      const dispatch = async name => { for (const handler of extension.handlers.get(name) ?? []) await handler({}, ctx); };
      await dispatch("session_start");
      const live = path.join(dir, "branchfork/live", `${sm.getSessionId()}.json`);
      expect(fs.existsSync(live)).toBe(true);
      expect(fs.statSync(live).mode & 0o777).toBe(0o600);
      const inbox = path.join(dir, "branchfork/inbox", sm.getSessionId());
      fs.mkdirSync(inbox, { recursive: true });
      fs.writeFileSync(path.join(inbox, "update.json"), JSON.stringify({ id: "update", text: "New context, wait for instruction" }));
      await dispatch("agent_settled");
      expect(sent).toHaveLength(1);
      expect(sent[0].options).toEqual({ triggerTurn: false });
      expect(sm.getBranch().at(-1).customType).toBe("branchfork-handoff");
      await extension.commands.get("branchfork").handler("", ctx);
      expect(sent.at(-1).message.customType).toBe("branchfork-status");
      expect(sent.at(-1).message.content).toContain("Recommended fix:");
      expect(sent.at(-1).message.content).toContain("What would you like to do next?");
      expect(sent.at(-1).options).toEqual({ triggerTurn: false });
      await dispatch("session_shutdown");
      expect(fs.existsSync(live)).toBe(false);
      await dispatch("session_start");
      expect(fs.existsSync(live)).toBe(true);
      await dispatch("session_shutdown");
    } finally {
      for (const handler of extension?.handlers.get("session_shutdown") ?? []) await handler({}, {});
      if (original === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = original;
      if (originalTerminal === undefined) delete process.env.HC_TERMINAL_ID; else process.env.HC_TERMINAL_ID = originalTerminal;
    }
  });
  test("real SessionManager forks only the active path, preserves compaction/context edits, and changes cwd", () => {
    const dir = temporary(), sourceCwd = path.join(dir, "source"), targetCwd = path.join(dir, "target");
    fs.mkdirSync(sourceCwd); fs.mkdirSync(targetCwd);
    const source = SessionManager.create(sourceCwd, path.join(dir, "source-sessions"));
    const root = source.appendMessage({ role: "user", content: "Original requirements", timestamp: 1 });
    source.appendMessage({ role: "user", content: "Abandoned alternative", timestamp: 2 });
    source.branch(root);
    const current = source.appendMessage({ role: "user", content: "Current decision", timestamp: 3 });
    source.appendCompaction("Earlier decisions summarized", current, 1000);
    source.appendContextEdit(current, { content: "Corrected current decision" });
    source.appendModelChange("test", "exact-model");
    source.appendThinkingLevelChange("high");
    const before = structuredClone(source.getEntries());
    const ctx = { cwd: sourceCwd, sessionManager: source };
    const file = path.join(dir, "snapshot.jsonl");
    fs.writeFileSync(file, snapshot(ctx, "handoff", "Source and destination details"));
    const fork = SessionManager.forkFrom(file, targetCwd, path.join(dir, "target-sessions"));
    expect(fork.getCwd()).toBe(targetCwd);
    expect(fork.getSessionId()).not.toBe(source.getSessionId());
    expect(fork.getBranch().some(entry => entry.message?.content === "Abandoned alternative")).toBe(false);
    const projection = fork.buildSessionProjection();
    expect(JSON.stringify(projection.messages)).toContain("Earlier decisions summarized");
    expect(JSON.stringify(projection.messages)).toContain("Corrected current decision");
    expect(JSON.stringify(projection.messages)).toContain("CONTEXT ONLY");
    expect(projection.model).toEqual({ provider: "test", modelId: "exact-model" });
    expect(projection.thinkingLevel).toBe("high");
    expect(source.getEntries()).toEqual(before);
  });
});
