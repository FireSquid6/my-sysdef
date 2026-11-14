#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { WorktreeRepository, shellQuote, type Plan, type Ref } from "./worktree-model";

export class Cancelled extends Error {}
export interface Choice<T> { label: string; value: T }
export interface WorktreeUI {
  info(message: string): void;
  input(prompt: string): Promise<string>;
  confirm(prompt: string): Promise<boolean>;
  pick<T>(prompt: string, choices: Choice<T>[]): Promise<T>;
}
const shortRef = (ref: Ref) => ref.kind === "origin" ? `origin/${ref.name}` : ref.kind === "head" ? "Current HEAD" : ref.name;

export async function chooseWorktree(repo: WorktreeRepository, ui: WorktreeUI) {
  ui.info(`Repository: ${JSON.stringify(repo.root)}\nPrimary checkout: ${JSON.stringify(repo.primary)}`);
  if (repo.dirty()) ui.info("Warning: this checkout has uncommitted changes. They will remain untouched and will NOT be transferred to a new worktree.");
  ui.info("Fetching origin…");
  const fetched = repo.fetchOrigin();
  if (fetched.problem) {
    ui.info(fetched.problem);
    if (!await ui.confirm("Continue with available local/cached refs?")) throw new Cancelled();
  }
  const branches = repo.branches();
  const trees = repo.worktrees();
  const branch = await ui.pick("Branch", [
    { label: "Create a new branch…", value: null as Ref | null },
    ...branches.map(ref => ({ value: ref as Ref | null, label: `${shortRef(ref)}  [${ref.kind === "origin" ? "origin only → tracking local branch" : "local"}]${trees.some(tree => tree.branch === ref.name) ? "  · existing worktree" : ""}` })),
  ]);
  let plan: Plan;
  if (branch) plan = repo.planExisting(branch.name);
  else {
    let name: string;
    while (true) {
      name = (await ui.input("New branch name: ")).trim();
      try {
        repo.validateBranch(name);
        if (repo.refs().some(ref => ref.name === name)) throw new Error("That branch exists already. Cancel and select it from the branch list, or enter another name.");
        break;
      } catch (error) { ui.info(String(error)); }
    }
    const recommended = repo.recommendedBase(fetched.fetched);
    const bases = repo.bases().sort((a, b) => Number(b.ref === recommended) - Number(a.ref === recommended));
    if (!bases.length) throw new Error("No committed base is available. Make an initial commit or fetch a branch first.");
    ui.info(recommended ? `Proposed base: ${shortRef(bases.find(ref => ref.ref === recommended)!)}${fetched.fetched ? "" : " (local/cached; not freshly fetched)"}`
      : "The default branch is uncertain. Select the starting point explicitly.");
    const base = await ui.pick("Starting point", bases.map(ref => ({ value: ref, label: `${shortRef(ref)}  [${ref.kind}]  ${ref.oid.slice(0, 12)}${ref.ref === recommended ? "  · proposed default" : ""}` })));
    plan = repo.planNew(name, base);
  }
  if (plan.kind !== "reuse") {
    ui.info(`\nCreate worktree\n  Repository: ${JSON.stringify(repo.root)}\n  Branch:     ${plan.branch}\n  Base:       ${plan.sourceRef}\n  Commit:     ${plan.oid}\n  Path:       ${JSON.stringify(plan.folder)}\n  Tracking:   ${plan.kind === "tracking" ? `origin/${plan.branch}` : plan.kind === "new" ? "none" : "existing branch configuration unchanged"}`);
    if (!await ui.confirm("Create this worktree?")) throw new Cancelled();
  }
  const result = repo.apply(plan);
  ui.info(`\n${result.reused ? "Reusing existing" : "Created"} worktree${result.dirty ? " (dirty; left untouched)" : " (clean)"}:\n${result.folder}\n\ncd -- ${shellQuote(result.folder)}`);
  return result;
}

function input(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    let answered = false;
    rl.on("SIGINT", () => rl.close());
    rl.on("close", () => { if (!answered) reject(new Cancelled()); });
    rl.question(prompt, answer => { answered = true; rl.close(); resolve(answer); });
  });
}
export const PICKER_OPTIONS = ["--read0", "--print0", "--no-multi", "--no-sort", "--delimiter=\t", "--with-nth=2..", "--layout=reverse", "--height=80%", "--border"];
const terminalUI: WorktreeUI = {
  info: message => console.log(message),
  input,
  async confirm(prompt) {
    while (true) {
      const answer = (await input(`${prompt} [y/N] `)).trim();
      if (!answer || /^(n|no)$/i.test(answer)) return false;
      if (/^(y|yes)$/i.test(answer)) return true;
      console.log("Please answer yes or no.");
    }
  },
  async pick<T>(prompt: string, choices: Choice<T>[]) {
    if (!choices.length) throw new Error(`No choices available for ${prompt}`);
    const result = spawnSync("fzf", [...PICKER_OPTIONS, `--prompt=${prompt}> `, "--header=Type to search · Enter to choose · Esc/Ctrl-C to cancel"], {
      input: choices.map((choice, index) => `${index}\t${choice.label}\0`).join(""), encoding: "utf8", stdio: ["pipe", "pipe", "inherit"],
      env: { ...process.env, FZF_DEFAULT_OPTS: "", FZF_DEFAULT_OPTS_FILE: "", FZF_DEFAULT_COMMAND: "" },
    });
    if (result.error) throw result.error;
    if (result.status === 1 || result.status === 130 || result.signal === "SIGINT") throw new Cancelled();
    if (result.status !== 0) throw new Error(`fzf failed (${result.status ?? result.signal})`);
    const index = Number(result.stdout.split("\t")[0]);
    if (!Number.isInteger(index) || !choices[index]) throw new Error("fzf returned an invalid selection");
    return choices[index].value;
  },
};

export async function main() {
  if (process.argv.length > 2) throw new Error("worktree.ts is interactive: run it without arguments or flags.");
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("worktree.ts requires an interactive terminal (stdin and stdout must be TTYs).");
  for (const tool of ["git", "fzf"]) if (!Bun.which(tool)) throw new Error(`Required tool missing: ${tool}. Install it before running worktree.ts.`);
  await chooseWorktree(new WorktreeRepository(process.cwd()), terminalUI);
}
if (import.meta.main) {
  try { await main(); }
  catch (error) {
    if (error instanceof Cancelled) { console.log("Cancelled. No worktree was created by this selection."); process.exitCode = 130; }
    else { console.error(`worktree.ts: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; }
  }
}
