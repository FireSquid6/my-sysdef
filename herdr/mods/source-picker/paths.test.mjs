import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePath, matchingDirectories } from "./paths.js";
const home = "/home/test";

test("default and home paths", () => {
  assert.deepEqual(parsePath("~/source/", home), { folder: home + "/source", filter: "" });
  assert.deepEqual(parsePath("~", home), { folder: home, filter: "" });
  assert.deepEqual(parsePath("~/Documents/proj", home), { folder: home + "/Documents", filter: "proj" });
});
test("absolute, relative, spaces and parent traversal", () => {
  assert.deepEqual(parsePath(home + "/My Projects/demo", home), { folder: home + "/My Projects", filter: "demo" });
  assert.deepEqual(parsePath("source/../Documents/", home), { folder: home + "/Documents", filter: "" });
  assert.deepEqual(parsePath("~/source/..", home), { folder: home, filter: "" });
});
test("reject paths outside home", () => {
  for (const path of ["/etc/", "~/../../", home + "-other/"]) {
    assert.throws(() => parsePath(path, home), /inside your home/);
  }
});
test("matching keeps case-insensitive substring behavior", () => {
  assert.deepEqual(matchingDirectories(["Alpha", "myALPHA", "beta"], "aLp"), ["Alpha", "myALPHA"]);
  assert.deepEqual(matchingDirectories(["a", "b"], ""), ["a", "b"]);
});
