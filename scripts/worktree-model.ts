import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

export type Ref = { name: string; ref: string; oid: string; kind: "local" | "origin" | "head" };
export type Worktree = { path: string; branch?: string; prunable?: string };
export type Plan = { branch: string; folder: string; oid: string; sourceRef: string; kind: "reuse" | "local" | "tracking" | "new" };
export type FetchResult = { fetched: boolean; problem?: string };

function git(cwd: string, args: string[], optional = false) {
  // Repository discovery must follow cwd, not a caller's alternate Git index or
  // repository environment. Authentication/SSH configuration remains inherited.
  const env = { ...process.env };
  for (const name of ["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_PREFIX"]) delete env[name];
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8", env, timeout: 120000, maxBuffer: 16 * 1024 * 1024, stdio: ["inherit", "pipe", "pipe"] });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (optional && result.status === 1) return undefined;
    throw new Error(`git ${args[0]} failed in ${JSON.stringify(cwd)}: ${result.stderr.trim() || `exit ${result.status}`}`);
  }
  return result.stdout;
}
const line = (text: string) => text.replace(/\n$/, "");
function canonical(candidate: string): string {
  if (fs.lstatSync(candidate, { throwIfNoEntry: false })) return fs.realpathSync(candidate);
  const parent = path.dirname(candidate);
  return parent === candidate ? candidate : path.join(canonical(parent), path.basename(candidate));
}
const inside = (child: string, parent: string) => child.startsWith(parent + path.sep);
export const shellQuote = (text: string) => `'${text.replaceAll("'", "'\"'\"'")}'`;

export class WorktreeRepository {
  readonly root: string;
  readonly primary: string;
  readonly name: string;
  constructor(cwd: string, readonly home = os.homedir()) {
    let root = fs.realpathSync(line(git(cwd, ["rev-parse", "--show-toplevel"])!));
    const seen = new Set<string>();
    while (true) {
      if (seen.has(root)) throw new Error("Cycle while resolving submodule parents");
      seen.add(root);
      const parent = line(git(root, ["rev-parse", "--show-superproject-working-tree"])!);
      if (!parent) break;
      root = fs.realpathSync(parent);
    }
    this.root = root;
    this.primary = this.worktrees()[0]?.path ?? root;
    this.name = path.basename(this.primary);
    if (!this.name || this.name === "." || this.name === "..") throw new Error("Cannot determine a safe primary repository directory name");
  }
  worktrees(): Worktree[] {
    const fields = git(this.root, ["worktree", "list", "--porcelain", "-z"])!.split("\0");
    const trees: Worktree[] = [];
    for (const field of fields) {
      if (field.startsWith("worktree ")) trees.push({ path: field.slice(9) });
      else if (field.startsWith("branch refs/heads/") && trees.length) trees.at(-1)!.branch = field.slice(18);
      else if (field.startsWith("prunable") && trees.length) trees.at(-1)!.prunable = field;
    }
    return trees;
  }
  dirty(folder = this.root) {
    return !!git(folder, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignore-submodules=none"]);
  }
  fetchOrigin(): FetchResult {
    const remotes = git(this.root, ["remote"])!.trim().split("\n");
    if (!remotes.includes("origin")) return { fetched: false, problem: "This repository has no origin remote." };
    try {
      // Explicit refspec includes all origin branches even in a single-branch
      // clone. This updates cached refs, never the current checkout or local branches.
      git(this.root, ["fetch", "--prune", "origin", "+refs/heads/*:refs/remotes/origin/*"]);
      return { fetched: true };
    } catch (error) { return { fetched: false, problem: `Fetching origin failed: ${String(error)}` }; }
  }
  refs(): Ref[] {
    return git(this.root, ["for-each-ref", "--sort=refname", "--format=%(refname)%00%(objectname)%00%(symref)", "refs/heads/", "refs/remotes/origin/"])!
      .split("\n").filter(Boolean).flatMap(record => {
        const [ref, oid, symbolic] = record.split("\0");
        if (!ref || !oid || symbolic || ref === "refs/remotes/origin/HEAD") return [];
        const local = ref.startsWith("refs/heads/");
        return [{ ref, oid, kind: local ? "local" as const : "origin" as const, name: ref.slice(local ? 11 : 20) }];
      });
  }
  branches(): Ref[] {
    const refs = this.refs();
    const local = new Set(refs.filter(ref => ref.kind === "local").map(ref => ref.name));
    return refs.filter(ref => ref.kind === "local" || !local.has(ref.name));
  }
  bases(): Ref[] {
    const refs = this.refs();
    const head = git(this.root, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"], true);
    return head ? [...refs, { name: "Current HEAD", ref: "HEAD", kind: "head", oid: line(head) }] : refs;
  }
  recommendedBase(fetched: boolean): string | undefined {
    const refs = this.refs();
    if (fetched && refs.some(ref => ref.ref === "refs/remotes/origin/main")) return "refs/remotes/origin/main";
    const remoteHead = git(this.root, ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"], true);
    if (remoteHead && refs.some(ref => ref.ref === line(remoteHead))) return line(remoteHead);
    const defaults = refs.filter(ref => ref.kind === "local" && ["main", "master"].includes(ref.name));
    // main/master are proposals, not proof of the remote's actual default.
    return defaults.length === 1 ? defaults[0]!.ref : undefined;
  }
  validateBranch(branch: string) {
    if (!branch || branch.startsWith("-") || /[\0\r\n]/.test(branch)) throw new Error("Enter a literal Git branch name, not an option or shorthand.");
    const checked = line(git(this.root, ["check-ref-format", "--branch", branch])!);
    if (checked !== branch) throw new Error("Branch shorthand is not allowed; enter a literal branch name.");
  }
  private destination(branch: string) {
    const base = path.resolve(this.home, "worktrees");
    const repoBase = path.join(base, this.name);
    const folder = path.resolve(repoBase, branch);
    if (!inside(folder, repoBase) || !inside(canonical(repoBase), canonical(base)) || !inside(canonical(folder), canonical(repoBase))) {
      throw new Error("Worktree path escapes its repository directory (possibly through a symlink).");
    }
    if (fs.lstatSync(folder, { throwIfNoEntry: false })) throw new Error(`Destination already exists but is not a registered worktree for this branch: ${JSON.stringify(folder)}. Nothing was overwritten.`);
    return folder;
  }
  private existing(branch: string): Worktree | undefined {
    const matches = this.worktrees().filter(tree => tree.branch === branch);
    if (matches.length > 1) throw new Error("Branch is registered in multiple worktrees; resolve the ambiguity first.");
    const tree = matches[0];
    if (tree) {
      if (tree.prunable || !fs.existsSync(tree.path)) throw new Error(`Registered worktree is missing or prunable: ${JSON.stringify(tree.path)}. Inspect git worktree list and repair it explicitly.`);
      const common = (cwd: string) => fs.realpathSync(line(git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"])!));
      if (common(tree.path) !== common(this.root)) throw new Error("Registered worktree path belongs to another repository; refusing to reuse it.");
    }
    return tree;
  }
  planExisting(branch: string): Plan {
    this.validateBranch(branch);
    const refs = this.refs();
    const ref = refs.find(ref => ref.kind === "local" && ref.name === branch) ?? refs.find(ref => ref.kind === "origin" && ref.name === branch);
    if (!ref) throw new Error("The selected branch no longer exists; rerun the script.");
    const existing = this.existing(branch);
    return { branch, folder: existing ? fs.realpathSync(existing.path) : this.destination(branch), oid: ref.oid, sourceRef: ref.ref,
      kind: existing ? "reuse" : ref.kind === "local" ? "local" : "tracking" };
  }
  planNew(branch: string, base: Ref): Plan {
    this.validateBranch(branch);
    if (this.refs().some(ref => ref.name === branch)) throw new Error("That branch already exists locally or on origin. Choose it from the existing-branch list instead.");
    // Pin to the exact commit shown in the confirmation, not a moving branch name.
    const oid = line(git(this.root, ["rev-parse", "--verify", "--end-of-options", `${base.oid}^{commit}`])!);
    return { branch, folder: this.destination(branch), oid, sourceRef: base.ref, kind: "new" };
  }
  apply(plan: Plan): { folder: string; reused: boolean; dirty: boolean } {
    if (plan.kind === "reuse") {
      const fresh = this.planExisting(plan.branch);
      if (fresh.kind !== "reuse" || fresh.folder !== plan.folder) throw new Error("Worktree registration changed; rerun the script.");
      return { folder: fresh.folder, reused: true, dirty: this.dirty(fresh.folder) };
    }
    // Revalidate after the confirmation: another terminal may have created the
    // branch/path or checked the branch out while the interactive picker was open.
    const fresh = plan.kind === "new" ? this.planNew(plan.branch, { ref: plan.sourceRef, oid: plan.oid, name: plan.sourceRef, kind: "head" }) : this.planExisting(plan.branch);
    if (fresh.kind !== plan.kind || fresh.folder !== plan.folder || fresh.oid !== plan.oid) throw new Error("The branch or destination changed since confirmation; rerun the script.");
    fs.mkdirSync(path.dirname(plan.folder), { recursive: true });
    this.destination(plan.branch); // Recheck symlink ancestors after mkdir.
    const args = plan.kind === "new" ? ["--no-track", "-b", plan.branch, plan.folder, plan.oid]
      : plan.kind === "tracking" ? ["--track", "-b", plan.branch, plan.folder, plan.sourceRef]
      : [plan.folder, plan.branch];
    try { git(this.root, ["worktree", "add", ...args]); }
    catch (error) { throw new Error(`${String(error)}\nGit may have retained a branch or partial worktree. Inspect git worktree list and the destination before retrying; nothing was rolled back.`); }
    return { folder: fs.realpathSync(plan.folder), reused: false, dirty: this.dirty(plan.folder) };
  }
}
