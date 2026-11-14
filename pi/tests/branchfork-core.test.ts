import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Herdr, CoreRpcError } from "../extensions/branchfork/herdr.ts";
import { run, type Run } from "../extensions/branchfork/process.ts";
import { present, type Layout } from "../extensions/branchfork/presentation.ts";

// Real Core API/CLI integration. Never touches the person's session, GUI or agents.
test("isolated core persists a four-tab workspace, survives presentation retries, and rejects stale document writes", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bf-core-"));
  const session = `bf-test-${process.pid}`;
  const env = {
    HC_SESSION: session, HC_SOCKET: path.join(dir, "core.sock"), HC_TERMINAL_ID: "", HERDR_TERMINAL_ID: "",
    HOME: dir, XDG_CONFIG_HOME: path.join(dir, "config"), XDG_STATE_HOME: path.join(dir, "state"),
    XDG_DATA_HOME: path.join(dir, "data"), XDG_RUNTIME_DIR: path.join(dir, "run"),
    PATH: `${path.join(dir, "bin")}:${process.env.PATH}`,
  };
  fs.mkdirSync(env.XDG_RUNTIME_DIR, { mode: 0o700 });
  fs.mkdirSync(path.join(dir, "bin"));
  fs.symlinkSync(process.execPath, path.join(dir, "bin/pi"));
  fs.mkdirSync(path.join(env.XDG_CONFIG_HOME, "herdr-core/templates"), { recursive: true });
  // Even a conflicting/broken pi template must never be parsed or sent a task.
  fs.writeFileSync(path.join(env.XDG_CONFIG_HOME, "herdr-core/templates/pi.md"), "deliberately invalid template");
  const isolated: Run = (program, argv, options) => run("env", [...Object.entries(env).map(([k, v]) => `${k}=${v}`), program, ...argv], options);
  const core = new Herdr(isolated);
  try {
    // A harmless persistent program stands in for Pi; no model call or user task.
    const agent = await core.launch("", dir, "integration", "agent", ["pi", "-e", "setInterval(() => {}, 1000)", "--", "--name", "repo:branch"]);
    const facts = JSON.parse(await core.exec("", "hc", ["get", "--json", agent.address]));
    expect(facts.parent).toBeNull();
    expect(facts.argv[0]).toBe(fs.realpathSync(process.execPath));
    expect(facts.argv.slice(-2)).toEqual(["--name", "repo:branch"]);
    expect(facts.first_message).toBeUndefined();
    const coreId = await core.identity("");
    expect(coreId).toBeTruthy();
    const receiver = `
      const { registerInbox, stateRoot } = await import(${JSON.stringify(path.resolve(import.meta.dir, "../extensions/branchfork/inbox.ts"))});
      const fs = await import('node:fs');
      process.env.PI_CODING_AGENT_DIR = ${JSON.stringify(path.join(dir, "pi"))};
      process.env.HC_TERMINAL_ID = ${JSON.stringify(agent.address)};
      process.env.HC_TERMINAL_SOCKET = ${JSON.stringify(env.HC_SOCKET)};
      process.env.HC_SOCKET = '/not-the-owning-core.sock';
      const handlers = new Map();
      registerInbox({ on(name, handler) { handlers.set(name, handler); } });
      const ctx = { cwd: ${JSON.stringify(dir)}, isIdle: () => true, sessionManager: { getSessionId: () => 'namespace-test', getBranch: () => [] }, ui: { notify(message) { throw Error(message); } } };
      await handlers.get('session_start')({}, ctx);
      process.stdout.write(fs.readFileSync(stateRoot() + '/live/namespace-test.json', 'utf8'));
      await handlers.get('session_shutdown')({}, ctx);
    `;
    const registration = await isolated(process.execPath, ["-e", receiver]);
    expect(registration.code).toBe(0);
    expect(JSON.parse(registration.stdout)).toMatchObject({ coreId, terminal: agent.address });
    expect(facts.die_with_parent).toBe(false);
    expect(facts.labels["branchfork.role"]).toBe("agent");
    const initial = await core.rpc<{ version: number }>("", "doc.get", { name: "herdr-app" });
    const unicode = "café 🫖 日本語 ".repeat(20000);
    await core.rpc("", "doc.set", { name: "herdr-app", version: initial.version, value: { spaces: [], unknownFutureField: unicode } });
    await present(core, "", dir, "integration", "test:branch", agent);
    const first = await core.rpc<{ version: number; value: Layout }>("", "doc.get", { name: "herdr-app" });
    expect(first.value.spaces[0]!.name).toBe("test:branch");
    expect(first.value.unknownFutureField).toBe(unicode);
    expect(first.value.spaces[0]!.tabs.map(tab => tab.name)).toEqual(["agent", "editor", "term1", "term2"]);
    const before = await core.terminals("");
    expect(before).toHaveLength(4);
    expect(before.map(t => [t.address, t.labels?.["herdr.space"]])).toEqual(before.map(t => [t.address, first.value.spaces[0]!.id]));
    await present(core, "", dir, "integration", "test:branch", agent);
    expect((await core.terminals("")).map(t => t.address).sort()).toEqual(before.map(t => t.address).sort());
    try {
      await core.rpc("", "doc.set", { name: "herdr-app", version: first.version, value: { spaces: [] } });
      throw Error("Expected stale version rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(CoreRpcError);
      expect((error as CoreRpcError).kind).toBe("conflict");
    }
    const current = await core.rpc<{ value: Layout }>("", "doc.get", { name: "herdr-app" });
    expect(current.value).toEqual(first.value);
  } finally {
    // This is exclusively our scratch core, not the live HC_SESSION.
    const stopped = await isolated("hc", ["server", "stop", "--json"]);
    fs.rmSync(dir, { recursive: true, force: true });
    if (stopped.code !== 0) throw Error(`Could not stop scratch core ${session}: ${stopped.stderr}`);
  }
}, 30000);
