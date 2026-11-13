import { describe, expect, test } from "bun:test";
import { present, terminalsIn, validateLayout } from "../extensions/branchfork/presentation.ts";
import { CoreRpcError } from "../extensions/branchfork/herdr.ts";

function harness({ failRole = "", failLabel = false, conflicts = 0, layout = { spaces: [] } } = {}) {
  let value = structuredClone(layout), version = 1;
  const terminals = [{ address: "t1", cwd: "/worktree", state: "live", labels: {} }];
  const calls: any[] = [];
  let failing = failRole;
  const core: any = {
    terminals: async () => terminals,
    worker: async (_machine: string, _worker: unknown, request: any) => request.path,
    rpc: async (_machine: string, method: string, params: any) => {
      calls.push([method, structuredClone(params)]);
      if (method === "doc.get") return { value: structuredClone(value), version };
      expect(params.version).toBe(version);
      if (conflicts-- > 0) {
        value.spaces.push({ id: `concurrent-${version}`, name: "other", folder: "/other", tabs: [] });
        version++;
        throw new CoreRpcError("layout changed", "conflict");
      }
      value = structuredClone(params.value); version++;
      return { version };
    },
    launch: async (_machine: string, cwd: string, key: string, role: string, argv: string[]) => {
      calls.push(["launch", role, argv]);
      if (role === failing) throw Error("Launch failed");
      const terminal = { address: `t${terminals.length + 1}`, cwd, state: "live", labels: { "branchfork.key": key, "branchfork.role": role } };
      terminals.push(terminal);
      return terminal;
    },
    label: async (_machine: string, address: string, labels: any) => {
      calls.push(["label", address, labels]);
      if (failLabel && address !== "t1") { failLabel = false; throw Error("Label failed"); }
      Object.assign(terminals.find(t => t.address === address)!.labels, labels);
    },
  };
  return { core, calls, terminals, layout: () => value, recover: () => { failing = ""; },
    present: () => present(core, "", "/worktree", "key", "repo:branch", terminals[0]!) };
}

describe("core-owned workspace presentation", () => {
  test("creates a named four-tab document without GUI or Pi launch, then labels terminals", async () => {
    const h = harness();
    await h.present();
    const space = h.layout().spaces[0]!;
    expect(space.name).toBe("repo:branch");
    expect(space.folder).toBe("/worktree");
    expect(space.tabs.map((tab: any) => tab.name)).toEqual(["agent", "editor", "term1", "term2"]);
    expect(h.calls.filter(call => call[0] === "launch").map(call => [call[1], call[2]])).toEqual([["editor", ["nvim"]], ["term1", []], ["term2", []]]);
    expect(h.calls.findIndex(call => call[0] === "label")).toBeGreaterThan(h.calls.findIndex(call => call[0] === "doc.set"));
    await h.present();
    expect(h.calls.filter(call => call[0] === "launch")).toHaveLength(3);
    expect(h.layout().spaces).toHaveLength(1);
    expect(h.layout().spaces[0]!.tabs).toHaveLength(4);
  });
  test("CAS retries merge concurrent changes without extra terminals or lost unknown fields", async () => {
    const h = harness({ conflicts: 2, layout: { spaces: [], future: { preserve: true } } as any });
    await h.present();
    expect(h.calls.filter(call => call[0] === "launch")).toHaveLength(3);
    expect(h.layout().spaces.map((s: any) => s.id)).toContain("concurrent-1");
    expect(h.layout().spaces.map((s: any) => s.id)).toContain("concurrent-2");
    expect((h.layout() as any).future).toEqual({ preserve: true });
  });
  test("partial launches are reused after retry rather than duplicated", async () => {
    const h = harness({ failRole: "term1" });
    await expect(h.present()).rejects.toThrow("Launch failed");
    expect(h.terminals).toHaveLength(2);
    h.recover();
    await h.present();
    expect(h.calls.filter(call => call[0] === "launch" && call[1] === "editor")).toHaveLength(1);
    expect(h.terminals).toHaveLength(4);
  });
  test("a failed label after document commit is repaired on retry for every companion", async () => {
    const h = harness({ failLabel: true });
    await expect(h.present()).rejects.toThrow("Label failed");
    expect(h.layout().spaces).toHaveLength(1);
    await h.present();
    expect(h.terminals).toHaveLength(4);
    expect(h.terminals.every(t => t.labels["herdr.space"] && t.labels["herdr.tab"])).toBe(true);
  });
  test("a renamed companion is reused without a second pane or terminal", async () => {
    const h = harness();
    await h.present();
    h.layout().spaces[0]!.tabs[1]!.name = "my editor";
    await h.present();
    expect(h.terminals).toHaveLength(4);
    expect(h.layout().spaces[0]!.tabs.map((t: any) => t.name)).toEqual(["agent", "my editor", "term1", "term2"]);
  });
  test("existing renamed workspace, split agent pane, tabs and extra fields are preserved", async () => {
    const original = { id: "space", name: "user name", folder: "/worktree", extra: 42, tabs: [
      { id: "existing-agent", name: "custom Pi", root: { type: "row", children: [{ type: "block", content: { terminal: "t1" } }, { type: "block", content: { terminal: "user-shell" } }] } },
      { id: "existing-editor", name: "editor", root: { type: "block", content: { terminal: "user-editor" } } },
    ] };
    const h = harness({ layout: { spaces: [original] } as any });
    await h.present();
    expect(h.layout().spaces[0]).toMatchObject({ id: original.id, name: original.name, folder: original.folder, extra: original.extra });
    expect(h.layout().spaces[0]!.tabs.slice(0, 2)).toEqual(original.tabs);
    expect(h.calls.filter(call => call[0] === "launch").map(call => call[1])).toEqual(["term1", "term2"]);
    expect(h.calls.find(call => call[0] === "label" && call[1] === "t1")[2]).toEqual({ "herdr.space": "space", "herdr.tab": "existing-agent" });
  });
  test("ambiguous spaces or agent placements fail without replacing user layout", async () => {
    const h = harness({ layout: { spaces: [
      { id: "a", name: "a", folder: "/worktree", tabs: [] },
      { id: "b", name: "b", folder: "/worktree", tabs: [] },
    ] } });
    await expect(h.present()).rejects.toThrow("Multiple Herdr spaces");
    expect(h.calls.some(call => call[0] === "doc.set" || call[0] === "launch")).toBe(false);
  });
  test("unrecognized layout fails closed; nested and floating terminals are recognized", () => {
    for (const value of [undefined, {}, { spaces: {} }, { spaces: [null] }, { spaces: [{ id: "s", folder: "/", tabs: [null] }] }]) {
      expect(() => validateLayout(value)).toThrow("Unrecognized");
    }
    expect(terminalsIn({ children: [{ content: { terminal: "t1" } }], floating: [{ content: { terminal: "t2" } }] })).toEqual(["t2", "t1"]);
  });
  test("persistent conflict is bounded and leaves terminals for a safe retry", async () => {
    const h = harness({ conflicts: 10 });
    await expect(h.present()).rejects.toThrow("all 5 merge attempts");
    expect(h.terminals).toHaveLength(4);
    expect(h.calls.filter(call => call[0] === "launch")).toHaveLength(3);
    expect(h.calls.filter(call => call[0] === "doc.set")).toHaveLength(5);
  });
});
