import { test } from "node:test";
import assert from "node:assert/strict";
import { launchProject, projectCommand, ProjectLaunchError } from "./project-launch.js";

const options = { folder: "/srv/source/a project", name: "a project", machine: "remote" };
function harness(failAt) {
  const calls = [];
  const exec = async (executable, argv) => {
    assert.equal(executable, "herdr-app");
    assert.equal(argv[0], "do");
    const [name, args] = [argv[1], JSON.parse(argv[2])];
    calls.push([name, args]);
    if (calls.length === failAt) return { code: 1, stderr: "permission denied", stdout: "" };
    return { code: 0, stdout: JSON.stringify(name === "space.new" ? { space: "remote/sp1", tab: "remote/tb1" } : { tab: `remote/tb${calls.length}` }) };
  };
  return { calls, exec };
}

for (const machine of ["", "remote"]) test(`external caller uses same launcher without focus (${machine || "local"})`, async () => {
  const { calls, exec } = harness();
  const agentArgv = ["pi", "--session", "/srv/sessions/fork session.jsonl"];
  const result = await launchProject({ ...options, machine, agentArgv, focus: false }, { exec, selectTab() { assert.fail("must not select"); } });
  assert.deepEqual(result, { space: "remote/sp1", agentTab: "remote/tb1" });
  assert.deepEqual(calls.map(([name]) => name), ["space.new", "tab.new", "tab.new", "tab.new"]);
  assert.deepEqual(calls.map(([, args]) => args.name), ["a project", "editor", "term1", "term2"]);
  assert.deepEqual(calls[0][1].argv, agentArgv);
  assert.equal(calls[0][1].machine, machine);
  for (const [, args] of calls) {
    assert.equal(args.focus, false);
    assert.equal(args.folder, options.folder);
  }
  for (const [, args] of calls.slice(1)) assert.equal(args.space, result.space);
  assert.deepEqual(calls.slice(1).map(([, args]) => args.argv), [["nvim"], [machine ? "fish" : "/usr/bin/fish"], [machine ? "fish" : "/usr/bin/fish"]]);
});

test("default external focus selects agent only after all four tabs exist", async () => {
  const { calls, exec } = harness();
  await launchProject(options, { exec });
  assert.deepEqual(calls.at(-1), ["tab.select", { id: "remote/tb1" }]);
  assert.equal(calls.length, 5);
});

for (const failAt of [1, 2, 3, 4, 5]) test(`failure at command ${failAt} retains known resources and actionable context`, async () => {
  const { calls, exec } = harness(failAt);
  await assert.rejects(launchProject(options, { exec }), error => {
    assert.ok(error instanceof ProjectLaunchError);
    assert.equal(error.space, failAt === 1 ? undefined : "remote/sp1");
    assert.equal(error.agentTab, failAt === 1 ? undefined : "remote/tb1");
    assert.equal(error.step, ["agent", "editor", "term1", "term2", "select agent tab"][failAt - 1]);
    assert.match(error.message, /permission denied/);
    assert.match(error.message, /retrying/);
    assert.deepEqual(error.args, calls.at(-1)[1]);
    assert.equal(error.tabs.length, failAt === 1 ? 0 : Math.min(failAt - 1, 4));
    return true;
  });
  assert.equal(calls.length, failAt, "no cleanup, selection, or subsequent setup after failure");
});

test("missing initial tab ID still reports the space that was created", async () => {
  await assert.rejects(launchProject(options, { command: async () => ({ space: "sp-existing" }) }), error => {
    assert.equal(error.space, "sp-existing");
    assert.match(error.message, /Missing new space\/tab IDs/);
    assert.match(error.message, /sp-existing.*retained/);
    return true;
  });
});

for (const response of [
  { code: 0, stdout: "not json" },
  { code: 0, stdout: "null" },
  { code: 0, stdout: '{"error":{"message":"offline"}}' },
  { code: 1, stdout: "fallback failure" },
]) test(`command adapter rejects ${JSON.stringify(response)}`, async () => {
  await assert.rejects(projectCommand(async () => response)("space.new", {}));
});

test("retry fills only missing tabs in the retained workspace", async () => {
  const calls = [];
  const result = await launchProject({ ...options, focus: false,
    existing: { space: "retained-space", agentTab: "retained-agent", tabNames: ["agent", "editor", "term1"] },
  }, { command: async (name, args) => { calls.push([name, args]); return { tab: "new-term2" }; } });
  assert.deepEqual(result, { space: "retained-space", agentTab: "retained-agent" });
  assert.deepEqual(calls.map(([name, args]) => [name, args.name, args.space]), [["tab.new", "term2", "retained-space"]]);
});

test("a complete existing workspace requires no creation or selection commands", async () => {
  await launchProject({ ...options, focus: false,
    existing: { space: "space", agentTab: "agent", tabNames: ["agent", "editor", "term1", "term2"] },
  }, { command() { assert.fail("must not change a complete existing workspace"); } });
});

test("invalid inputs fail before allocating resources", async () => {
  for (const invalid of [{ folder: "relative" }, { name: "" }, { agentArgv: [] }, { agentArgv: [1] }, { machine: null }]) {
    await assert.rejects(launchProject({ ...options, ...invalid }, { command() { assert.fail("must not create"); } }), TypeError);
  }
});
