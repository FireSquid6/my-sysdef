import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const json = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
test("Repo is registered in the personal layout and keyboard bindings", async () => {
  const keys = await json("../keys.json"), layout = await json("../layouts/tty.json");
  const find = node => node.id === "repo" ? node : (node.children ?? []).map(find).find(Boolean);
  assert.equal(find(layout).content.mod, "tty-repo");
  assert.equal(keys["layout:tty"]["alt-r"], "tty-tabs.repo");
  assert.equal(keys["mod:tty-repo"]["ctrl-tab"], "tty-repo.cycle");
  assert.equal(keys["mod:tty-changes"]["ctrl-tab"], "tty-changes.cycle");
  for (const section of ["mod:tty-repo", "mod:tty-changes"]) assert.equal(keys[section]["shift-tab"], undefined);
});
