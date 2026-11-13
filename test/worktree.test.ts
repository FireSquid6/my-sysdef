import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { WorktreeRepository, shellQuote } from "../scripts/worktree-model";
import { Cancelled, chooseWorktree, PICKER_OPTIONS, type Choice, type WorktreeUI } from "../scripts/worktree";

let dir: string, repo: string, home: string, remote: string;
function git(cwd: string, ...args: string[]) {
  return execFileSync("git", ["-C", cwd, "-c", "core.hooksPath=/dev/null", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function model(cwd = repo) { return new WorktreeRepository(cwd, home); }
function base(ref = "refs/remotes/origin/main", repository = model()) { return repository.bases().find(base => base.ref === ref)!; }
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "worktree-script-"));
  repo = path.join(dir, "repo with 'quotes'"); home = path.join(dir, "missing-home"); remote = path.join(dir, "origin.git");
  fs.mkdirSync(repo);
  git(dir, "init", "--bare", "--initial-branch=main", remote);
  git(repo, "init", "-b", "main");
  git(repo, "config", "user.email", "test@example.com"); git(repo, "config", "user.name", "Test");
  fs.writeFileSync(path.join(repo, "file"), "initial");
  git(repo, "add", "."); git(repo, "commit", "-m", "initial");
  git(repo, "remote", "add", "origin", remote); git(repo, "push", "-u", "origin", "main");
  git(repo, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function ui(options: { select?: string[]; inputs?: string[]; confirms?: boolean[] } = {}) {
  const messages: string[] = [], selections: string[][] = [], questions: string[] = [];
  const choose = [...(options.select ?? [])], inputs = [...(options.inputs ?? [])], confirms = [...(options.confirms ?? [])];
  const value: WorktreeUI = {
    info: text => messages.push(text),
    input: async () => { const next = inputs.shift(); if (next === undefined) throw new Cancelled(); return next; },
    confirm: async prompt => { questions.push(prompt); return confirms.shift() ?? false; },
    async pick<T>(_prompt: string, choices: Choice<T>[]) {
      selections.push(choices.map(choice => choice.label));
      const wanted = choose.shift();
      if (wanted === undefined) throw new Cancelled();
      const choice = choices.find(choice => choice.label.startsWith(wanted));
      if (!choice) throw Error(`Missing choice: ${wanted}`);
      return choice.value;
    },
  };
  return { value, messages, selections, questions };
}

describe("local worktree Git operations", () => {
  test("discovers from a subdirectory or linked worktree; uses the primary repo directory name", () => {
    fs.mkdirSync(path.join(repo, "deep/nested"), { recursive: true });
    expect(model(path.join(repo, "deep/nested")).root).toBe(repo);
    const existing = path.join(dir, "another-checkout");
    git(repo, "worktree", "add", "-b", "existing", existing);
    const m = model(existing);
    expect(m.root).toBe(existing);
    expect(m.primary).toBe(repo);
    expect(m.planNew("feature/new", base(undefined, m)).folder).toBe(path.join(home, "worktrees", path.basename(repo), "feature/new"));
  });
  test("walks out of nested submodules to the outermost parent", () => {
    const inner = path.join(dir, "inner"), middle = path.join(dir, "middle");
    for (const folder of [inner, middle]) {
      fs.mkdirSync(folder); git(folder, "init", "-b", "main");
      git(folder, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--allow-empty", "-m", "initial");
    }
    git(middle, "-c", "protocol.file.allow=always", "submodule", "add", inner, "nested");
    git(middle, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-am", "nested module");
    git(repo, "-c", "protocol.file.allow=always", "submodule", "add", middle, "module");
    git(repo, "-c", "protocol.file.allow=always", "submodule", "update", "--init", "--recursive");
    const nested = path.join(repo, "module/nested");
    fs.mkdirSync(path.join(nested, "deep"));
    expect(model(path.join(nested, "deep")).root).toBe(repo);
    const result = model(nested).apply(model(nested).planNew("outer-only", base()));
    expect(git(result.folder, "rev-parse", "--git-common-dir")).toBe(path.join(repo, ".git"));
    expect(git(nested, "branch", "--list", "outer-only")).toBe("");
  });
  test("rejects a non-repository without creating a destination", () => {
    expect(() => model(dir)).toThrow("rev-parse");
    expect(fs.existsSync(home)).toBe(false);
  });
  test("new branch defaults to fetched origin/main, not a dirty/unpublished current HEAD, with no upstream", () => {
    git(repo, "commit", "--allow-empty", "-m", "unpublished");
    fs.writeFileSync(path.join(repo, "file"), "unstaged");
    fs.writeFileSync(path.join(repo, "new file"), "untracked");
    fs.writeFileSync(path.join(repo, "staged file"), "staged");
    git(repo, "add", "staged file");
    const m = model();
    expect(m.dirty()).toBe(true);
    expect(m.fetchOrigin().fetched).toBe(true);
    expect(m.recommendedBase(true)).toBe("refs/remotes/origin/main");
    const plan = m.planNew("feature/login", base());
    const result = m.apply(plan);
    expect(git(result.folder, "rev-parse", "HEAD")).toBe(git(repo, "rev-parse", "origin/main"));
    expect(fs.readFileSync(path.join(result.folder, "file"), "utf8")).toBe("initial");
    expect(fs.existsSync(path.join(result.folder, "new file"))).toBe(false);
    expect(fs.existsSync(path.join(result.folder, "staged file"))).toBe(false);
    expect(git(repo, "diff", "--cached", "--name-only")).toBe("staged file");
    expect(git(repo, "branch", "--show-current")).toBe("main");
    expect(fs.readFileSync(path.join(repo, "file"), "utf8")).toBe("unstaged");
    expect(spawnSync("git", ["-C", result.folder, "rev-parse", "--verify", "@{upstream}"], { stdio: "ignore" }).status).not.toBe(0);
  });
  test("fetch updates all origin branches even with a single-branch fetch configuration", () => {
    git(repo, "config", "remote.origin.fetch", "+refs/heads/main:refs/remotes/origin/main");
    git(repo, "push", "origin", "HEAD:refs/heads/remote-only");
    expect(model().fetchOrigin().fetched).toBe(true);
    expect(model().branches().some(ref => ref.name === "remote-only")).toBe(true);
  });
  test("uses cached origin/HEAD then unambiguous local main/master as fallback proposals", () => {
    git(repo, "branch", "-m", "main", "trunk");
    git(repo, "push", "origin", "trunk");
    git(repo, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/trunk");
    expect(model().recommendedBase(false)).toBe("refs/remotes/origin/trunk");
    git(repo, "remote", "remove", "origin");
    expect(model().recommendedBase(false)).toBeUndefined();
    git(repo, "branch", "main");
    expect(model().recommendedBase(false)).toBe("refs/heads/main");
    git(repo, "branch", "master");
    expect(model().recommendedBase(false)).toBeUndefined();
  });
  test("a fetched remote with a different default proposes cached origin/HEAD when main is absent", () => {
    git(repo, "branch", "-m", "main", "trunk");
    git(repo, "push", "origin", "trunk");
    git(remote, "symbolic-ref", "HEAD", "refs/heads/trunk");
    git(repo, "push", "origin", "--delete", "main");
    git(repo, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/trunk");
    expect(model().fetchOrigin().fetched).toBe(true);
    expect(model().recommendedBase(true)).toBe("refs/remotes/origin/trunk");
  });
  test("missing origin and fetch failure are reported without pulling or changing HEAD", () => {
    const before = git(repo, "rev-parse", "HEAD");
    git(repo, "remote", "set-url", "origin", path.join(dir, "does-not-exist"));
    expect(model().fetchOrigin()).toMatchObject({ fetched: false });
    expect(model().fetchOrigin().problem).toContain("Fetching origin failed");
    git(repo, "remote", "remove", "origin");
    expect(model().fetchOrigin().problem).toContain("no origin");
    expect(git(repo, "rev-parse", "HEAD")).toBe(before);
  });
  test("existing unpublished local branches are used as-is, not reset to origin", () => {
    git(repo, "branch", "local-only");
    const m = model(), plan = m.planExisting("local-only");
    expect(plan.kind).toBe("local");
    const result = m.apply(plan);
    expect(git(result.folder, "branch", "--show-current")).toBe("local-only");
    expect(git(repo, "branch", "--show-current")).toBe("main");
  });
  test("local branches win over same-named origin refs and tags without detaching or resetting", () => {
    git(repo, "branch", "existing");
    git(repo, "push", "origin", "existing");
    git(repo, "tag", "existing");
    git(repo, "commit", "--allow-empty", "-m", "unpublished");
    git(repo, "branch", "-f", "existing", "HEAD");
    const m = model();
    expect(m.branches().filter(ref => ref.name === "existing")).toHaveLength(1);
    const result = m.apply(m.planExisting("existing"));
    expect(git(result.folder, "branch", "--show-current")).toBe("existing");
    expect(git(result.folder, "rev-parse", "HEAD")).toBe(git(repo, "rev-parse", "refs/heads/existing"));
    expect(git(result.folder, "rev-parse", "HEAD")).not.toBe(git(repo, "rev-parse", "refs/remotes/origin/existing"));
  });
  test("origin-only branches become tracking local branches", () => {
    git(repo, "push", "origin", "HEAD:refs/heads/remote-branch"); model().fetchOrigin();
    const m = model(), plan = m.planExisting("remote-branch");
    expect(plan.kind).toBe("tracking");
    const result = m.apply(plan);
    expect(git(result.folder, "rev-parse", "--abbrev-ref", "@{upstream}")).toBe("origin/remote-branch");
  });
  test("reuses the primary checkout or a dirty worktree elsewhere without modifications", () => {
    expect(model().planExisting("main")).toMatchObject({ kind: "reuse", folder: repo });
    const elsewhere = path.join(dir, "elsewhere");
    git(repo, "worktree", "add", "-b", "existing", elsewhere);
    fs.writeFileSync(path.join(elsewhere, "keep"), "untracked");
    const m = model(), result = m.apply(m.planExisting("existing"));
    expect(result).toEqual({ folder: elsewhere, reused: true, dirty: true });
    expect(fs.readFileSync(path.join(elsewhere, "keep"), "utf8")).toBe("untracked");
  });
  test("missing registered worktrees require explicit repair, not automatic pruning", () => {
    const elsewhere = path.join(dir, "missing"); git(repo, "worktree", "add", "-b", "existing", elsewhere);
    fs.rmSync(elsewhere, { recursive: true });
    expect(() => model().planExisting("existing")).toThrow("missing or prunable");
  });
  test.each(["../escape", "a/../../escape", "-bad", "@{-1}", "name\ninvalid"])("rejects invalid name %j without creating directories", branch => {
    expect(() => model().planNew(branch, base())).toThrow();
    expect(fs.existsSync(home)).toBe(false);
  });
  test("refuses directory collisions and escaping symlink ancestors", () => {
    const target = path.join(home, "worktrees", path.basename(repo));
    fs.mkdirSync(path.join(target, "collision"), { recursive: true });
    fs.writeFileSync(path.join(target, "collision", "keep"), "untouched");
    expect(() => model().planNew("collision", base())).toThrow("already exists");
    fs.symlinkSync(dir, path.join(target, "escape"), "dir");
    expect(() => model().planNew("escape/new", base())).toThrow("escapes");
    expect(fs.readFileSync(path.join(target, "collision", "keep"), "utf8")).toBe("untouched");
  });
  test("revalidates branch/path changes after confirmation; a new branch's base commit is pinned", () => {
    git(repo, "branch", "existing");
    const m = model(), local = m.planExisting("existing");
    git(repo, "branch", "-f", "existing", "HEAD");
    git(repo, "commit", "--allow-empty", "-m", "next");
    git(repo, "branch", "-f", "existing", "HEAD");
    expect(() => m.apply(local)).toThrow("changed since confirmation");
    const newPlan = m.planNew("pinned", base("HEAD"));
    git(repo, "commit", "--allow-empty", "-m", "later");
    expect(git(m.apply(newPlan).folder, "rev-parse", "HEAD")).toBe(newPlan.oid);
    const collision = m.planNew("late-collision", base());
    fs.mkdirSync(collision.folder, { recursive: true });
    expect(() => m.apply(collision)).toThrow("already exists");
  });
  test("cd command safely quotes whitespace and apostrophes", () => {
    const text = path.join(dir, "a'b $(touch never)");
    expect(execFileSync("sh", ["-c", `printf '%s' ${shellQuote(text)}`], { encoding: "utf8" })).toBe(text);
  });
});

describe("interactive worktree flow", () => {
  test("the actual fzf options search visible labels and return the original choice ID", () => {
    for (const query of ["Create a new", "origin/main"]) {
      const result = spawnSync("fzf", [...PICKER_OPTIONS, `--filter=${query}`], { input: "0\tCreate a new branch…\0" + "1\torigin/main  [origin]\0", encoding: "utf8",
        env: { ...process.env, FZF_DEFAULT_OPTS: "", FZF_DEFAULT_OPTS_FILE: "" } });
      expect(result.status).toBe(0);
      expect(result.stdout).toBe(query === "origin/main" ? "1\torigin/main  [origin]\0" : "0\tCreate a new branch…\0");
    }
  });
  test("fetches, proposes origin/main, confirms and prints path/cd without launching anything else", async () => {
    const prompts = ui({ select: ["Create a new", "origin/main"], inputs: ["feature/interactive"], confirms: [true] });
    const result = await chooseWorktree(model(), prompts.value);
    expect(prompts.selections[1]![0]).toContain("origin/main");
    expect(prompts.questions).toEqual(["Create this worktree?"]);
    expect(prompts.messages.join("\n")).toContain(`cd -- ${shellQuote(result.folder)}`);
    expect(git(result.folder, "branch", "--show-current")).toBe("feature/interactive");
  });
  test("dirty source is warned about; invalid/existing names are retried", async () => {
    fs.writeFileSync(path.join(repo, "file"), "dirty");
    const prompts = ui({ select: ["Create a new", "origin/main"], inputs: ["../bad", "main", "valid"], confirms: [true] });
    await chooseWorktree(model(), prompts.value);
    expect(prompts.messages.join("\n")).toContain("will NOT be transferred");
    expect(prompts.messages.join("\n")).toContain("exists already");
  });
  test("cancels after failed fetch or before creation without creating a branch or parent directories", async () => {
    const cancelCreation = ui({ select: ["Create a new", "origin/main"], inputs: ["cancelled"], confirms: [false] });
    await expect(chooseWorktree(model(), cancelCreation.value)).rejects.toBeInstanceOf(Cancelled);
    expect(git(repo, "branch", "--list", "cancelled")).toBe("");
    expect(fs.existsSync(home)).toBe(false);
    git(repo, "remote", "remove", "origin");
    const cancelFetch = ui({ confirms: [false] });
    await expect(chooseWorktree(model(), cancelFetch.value)).rejects.toBeInstanceOf(Cancelled);
    expect(cancelFetch.selections).toHaveLength(0);
  });
  test("continues offline with an explicit fallback selection", async () => {
    git(repo, "remote", "remove", "origin");
    const prompts = ui({ select: ["Create a new", "main"], inputs: ["offline"], confirms: [true, true] });
    await chooseWorktree(model(), prompts.value);
    expect(prompts.questions[0]).toContain("Continue");
    expect(prompts.selections[1]![0]).toContain("proposed default");
  });
  test("existing dirty worktrees are returned immediately without creation confirmation", async () => {
    fs.writeFileSync(path.join(repo, "keep"), "dirty");
    const prompts = ui({ select: ["main"] });
    expect((await chooseWorktree(model(), prompts.value)).folder).toBe(repo);
    expect(prompts.questions).toEqual([]);
    expect(prompts.messages.join("\n")).toContain("dirty; left untouched");
  });
});
