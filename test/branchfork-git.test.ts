import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { gitWorker } from "../pi/extensions/branchfork/git-worker.js";

let dir: string, repo: string, home: string, origin: string;
function git(cwd: string, ...args: string[]) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function inspect(branch = "feature/new") {
  const result = gitWorker({ action: "inspect", cwd: repo, branch });
  if (!result.ok) throw new Error(result.error);
  return result.source;
}
function prepare(branch = "feature/new", local = true) {
  const source = inspect(branch)!;
  // Simulate a distinct host filesystem; the source's absolute checkout is absent there.
  if (!local) source.primary = "/nonexistent-branchfork-test-source/original";
  return gitWorker({ action: "prepare", source, branch, local, home });
}
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "branchfork-git-"));
  repo = path.join(dir, "original");
  home = path.join(dir, "missing-home");
  origin = `file://${path.join(dir, "origin.git")}`;
  fs.mkdirSync(repo);
  git(dir, "init", "--bare", "origin.git");
  git(repo, "init", "-b", "main");
  git(repo, "config", "user.email", "test@example.com");
  git(repo, "config", "user.name", "Test");
  fs.writeFileSync(path.join(repo, "file"), "initial");
  git(repo, "add", ".");
  git(repo, "commit", "-m", "initial");
  git(repo, "remote", "add", "origin", origin);
  git(repo, "push", "-u", "origin", "main");
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("branchfork Git guardrails (real Git repositories)", () => {
  test("creates all missing parents and a nested branch at the exact source HEAD", () => {
    const head = git(repo, "rev-parse", "HEAD");
    const result = prepare();
    expect(result.ok).toBe(true);
    expect(result.folder).toBe(path.join(home, "worktrees/original/feature/new"));
    expect(git(result.folder!, "branch", "--show-current")).toBe("feature/new");
    expect(git(result.folder!, "rev-parse", "HEAD")).toBe(head);
    expect(git(repo, "branch", "--show-current")).toBe("main");
  });
  test("retries its own unchanged local-only branch without pushing, but blocks unpublished destination commits", () => {
    const first = prepare();
    const again = prepare();
    expect(again.ok).toBe(true);
    expect(again.reused).toBe(true);
    expect(again.folder).toBe(first.folder);
    git(first.folder!, "commit", "--allow-empty", "-m", "unpublished destination work");
    expect(prepare().error).toContain("not exactly synced");
  });
  test.each(["untracked", "unstaged", "staged"])("blocks %s source changes", kind => {
    fs.writeFileSync(path.join(repo, kind === "untracked" ? "new" : "file"), "changed");
    if (kind === "staged") git(repo, "add", ".");
    const result = gitWorker({ action: "inspect", cwd: repo, branch: "next" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("dirty");
    expect(result.error).toContain("Recommended fix:");
    expect(fs.existsSync(home)).toBe(false);
  });
  test("ignored files are allowed", () => {
    fs.writeFileSync(path.join(repo, ".git/info/exclude"), "ignored\n");
    fs.writeFileSync(path.join(repo, "ignored"), "cache");
    expect(inspect()).toBeDefined();
  });
  test("blocks ahead, detached HEAD, and a missing remote branch", () => {
    git(repo, "commit", "--allow-empty", "-m", "unpublished");
    expect(gitWorker({ action: "inspect", cwd: repo, branch: "next" }).error).toContain("not exactly synced");
    git(repo, "checkout", "--detach");
    expect(gitWorker({ action: "inspect", cwd: repo, branch: "next" }).error).toContain("Detached HEAD");
    git(repo, "checkout", "-b", "unpublished");
    expect(gitWorker({ action: "inspect", cwd: repo, branch: "next" }).error).toContain("remote branch missing");
  });
  test("fetches and blocks a source behind origin", () => {
    const peer = path.join(dir, "peer");
    git(dir, "clone", "-b", "main", origin, peer);
    git(peer, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--allow-empty", "-m", "incoming");
    git(peer, "push");
    expect(gitWorker({ action: "inspect", cwd: repo, branch: "next" }).error).toContain("not exactly synced");
  });
  test("tracks an origin-only branch and reuses its worktree", () => {
    git(repo, "push", "origin", "HEAD:refs/heads/existing");
    const first = prepare("existing");
    expect(first.ok).toBe(true);
    expect(git(repo, "config", "branch.existing.remote")).toBe("origin");
    const again = prepare("existing");
    expect(again.reused).toBe(true);
    expect(again.folder).toBe(first.folder);
  });
  test("reuses a registered worktree elsewhere, preserving its history", () => {
    const elsewhere = path.join(dir, "elsewhere");
    git(repo, "branch", "existing");
    git(repo, "push", "origin", "existing");
    git(repo, "worktree", "add", elsewhere, "existing");
    const result = prepare("existing");
    expect(result.folder).toBe(elsewhere);
  });
  test("blocks dirty target worktrees and unsynced existing branches", () => {
    git(repo, "push", "origin", "HEAD:refs/heads/existing");
    const first = prepare("existing");
    fs.writeFileSync(path.join(first.folder!, "untracked"), "keep me");
    expect(prepare("existing").error).toContain("dirty");
    expect(fs.readFileSync(path.join(first.folder!, "untracked"), "utf8")).toBe("keep me");
    git(repo, "branch", "unpublished");
    expect(prepare("unpublished").error).toContain("remote branch missing");
  });
  test("clones main on a destination host before making the worktree", () => {
    const result = prepare("remote/new", false);
    expect(result.ok).toBe(true);
    expect(result.repository).toBe(path.join(home, "source/original"));
    expect(git(result.repository!, "branch", "--show-current")).toBe("main");
    expect(git(result.folder!, "branch", "--show-current")).toBe("remote/new");
  });
  test("reuses an origin-matching checkout known to Herdr outside ~/source", () => {
    const alternate = path.join(dir, "elsewhere-on-destination");
    git(dir, "clone", "-b", "main", origin, alternate);
    const source = inspect("known/new")!;
    source.primary = "/nonexistent-branchfork-test-source/original";
    const result = gitWorker({ action: "prepare", source, branch: "known/new", local: false, home, candidates: [alternate] });
    expect(result.ok).toBe(true);
    expect(result.repository).toBe(alternate);
    expect(fs.existsSync(path.join(home, "source/original"))).toBe(false);
  });
  test("blocks dirty destination primary checkout", () => {
    const first = prepare("existing", false);
    fs.writeFileSync(path.join(first.repository!, "local"), "keep");
    expect(prepare("another", false).error).toContain("dirty");
  });
  test("fails loudly on a missing main without falling back to another default", () => {
    git(repo, "push", "origin", "HEAD:refs/heads/master");
    git(path.join(dir, "origin.git"), "symbolic-ref", "HEAD", "refs/heads/master");
    git(repo, "push", "origin", "--delete", "main");
    // Use a clean, synced source on master.
    git(repo, "checkout", "-b", "master");
    const result = prepare("another", false);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("clone failed");
  });
  test.each(["../escape", "-bad", "@{-1}", "a/../../escape"])("rejects unsafe branch %s", branch => {
    expect(gitWorker({ action: "inspect", cwd: repo, branch }).ok).toBe(false);
  });
  test("does not overwrite unregistered directory collisions or follow symlinks outside root", () => {
    const base = path.join(home, "worktrees/original");
    fs.mkdirSync(path.join(base, "collision"), { recursive: true });
    fs.writeFileSync(path.join(base, "collision/keep"), "keep");
    expect(prepare("collision").error).toContain("already exists");
    fs.symlinkSync(dir, path.join(base, "escape"));
    expect(prepare("escape/child").error).toContain("escapes");
    fs.mkdirSync(path.join(home, "worktrees/other"), { recursive: true });
    fs.symlinkSync(path.join(home, "worktrees/other"), path.join(base, "cross-repo"));
    expect(prepare("cross-repo/child").error).toContain("escapes");
    expect(fs.readFileSync(path.join(base, "collision/keep"), "utf8")).toBe("keep");
  });
  test("does not silently accept a different origin in the destination", () => {
    const first = prepare("remote/new", false);
    git(first.repository!, "remote", "set-url", "origin", "https://example.com/wrong.git");
    expect(prepare("another", false).error).toContain("not the expected repository");
  });
  test("reports not-a-repository without creating anything", () => {
    expect(gitWorker({ action: "inspect", cwd: dir, branch: "next" }).ok).toBe(false);
    expect(fs.existsSync(home)).toBe(false);
  });
});
