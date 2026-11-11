import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source = await readFile(new URL("./paths.js", import.meta.url), "utf8");
const { parsePath, resolvePath, matchingDirectories } = await import("data:text/javascript," + encodeURIComponent(source));
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
test("rejects outside-home suggestions and exact paths, including traversal and lookalike prefixes", () => {
  for (const value of ["/etc/", "~/../../", "/archive/projects/de", home + "-other/", "~/../other", "/"]) {
    assert.throws(() => resolvePath(value, home), /inside your home/);
    assert.throws(() => parsePath(value, home), /inside your home/);
  }
});
test("opening resolves the entire entered path, not its suggestion parent", () => {
  for (const [value, expected] of [
    ["~/source/project", home + "/source/project"],
    ["~/source/project/", home + "/source/project"],
    ["source/my project", home + "/source/my project"],
    ["~", home], [home + "/", home], [home + "/source/../Documents//", home + "/Documents"],
    ["~/source/..", home],
  ]) assert.equal(resolvePath(value, home), expected);
  assert.throws(() => resolvePath("", home), /Enter a directory/);
});
test("matching keeps case-insensitive substring behavior", () => {
  assert.deepEqual(matchingDirectories(["Alpha", "myALPHA", "beta"], "aLp"), ["Alpha", "myALPHA"]);
  assert.deepEqual(matchingDirectories(["a", "b"], ""), ["a", "b"]);
});
