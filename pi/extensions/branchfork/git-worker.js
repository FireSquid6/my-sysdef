// Self-contained so the exact same checks run locally and through Herdr on another host.
// No shell interpolation: Git always receives argv, never a constructed shell command.
export function gitWorker(request) {
  const fs = require("node:fs");
  const path = require("node:path");
  const os = require("node:os");
  const { spawnSync } = require("node:child_process");
  const completed = [];
  function stop(message, recommendation) {
    throw new Error(`${message}\nRecommended fix: ${recommendation}`);
  }
  function git(cwd, args, optional = false) {
    const result = spawnSync("git", args, {
      cwd, encoding: "utf8", timeout: 120000, maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" },
    });
    if (result.error || result.status !== 0) {
      if (optional && !result.error && result.status === 1) return null;
      stop(`Git ${args[0]} failed in ${cwd}: ${result.error?.message || result.stderr.trim()}`,
        "Inspect the reported Git error and origin access on this host, resolve it explicitly, then rerun /branchfork.");
    }
    return result.stdout.trimEnd();
  }
  function clean(cwd) {
    if (git(cwd, ["status", "--porcelain=v1", "--untracked-files=all", "--ignore-submodules=none"])) {
      stop(`Checkout is dirty: ${cwd}. No changes were transferred.`,
        "Review git status there; deliberately commit and push changes, or move/stash them yourself, then rerun /branchfork.");
    }
  }
  function branchName(cwd) {
    const result = git(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"], true);
    if (!result) stop(`Detached HEAD in ${cwd}.`, "Check out the intended branch and synchronize it with origin, then rerun /branchfork.");
    return result;
  }
  function ref(cwd, name) {
    return git(cwd, ["rev-parse", "--verify", "--quiet", name], true);
  }
  function synced(cwd, branch) {
    const local = ref(cwd, `refs/heads/${branch}`);
    const remote = ref(cwd, `refs/remotes/origin/${branch}`);
    if (!remote || local !== remote) {
      stop(`Branch ${branch} in ${cwd} is not exactly synced with origin/${branch}${!remote ? " (remote branch missing)" : ""}.`,
        "Inspect git log/status; explicitly push unpublished commits or reconcile incoming/divergent commits as appropriate, then rerun /branchfork.");
    }
    return local;
  }
  function fetch(cwd) {
    git(cwd, ["fetch", "--prune", "origin", "+refs/heads/*:refs/remotes/origin/*"]);
  }
  function worktrees(cwd) {
    const raw = git(cwd, ["worktree", "list", "--porcelain", "-z"]);
    const result = [];
    let entry;
    for (const field of raw.split("\0")) {
      if (field.startsWith("worktree ")) {
        entry = { path: field.slice(9), branch: "" };
        result.push(entry);
      } else if (field.startsWith("branch ") && entry) entry.branch = field.slice(7).replace(/^refs\/heads\//, "");
    }
    return result;
  }
  function canonical(candidate) {
    // Resolve existing ancestors as well as the leaf to detect symlink escapes/collisions.
    if (fs.existsSync(candidate)) return fs.realpathSync(candidate);
    const parent = path.dirname(candidate);
    return parent === candidate ? candidate : path.join(canonical(parent), path.basename(candidate));
  }
  function exists(candidate) {
    return !!fs.lstatSync(candidate, { throwIfNoEntry: false });
  }
  try {
    if (request.action === "inspect") {
      const root = git(request.cwd, ["rev-parse", "--show-toplevel"]);
      if (!root) stop("Not in a Git working tree.", "Run /branchfork inside the intended repository.");
      if (git(root, ["check-ref-format", "--branch", request.branch]) !== request.branch) {
        stop("Branch shorthand is not allowed.", "Supply an explicit Git branch name.");
      }
      const currentBranch = branchName(root);
      clean(root);
      const origin = git(root, ["remote", "get-url", "origin"]);
      // Local-path origins cannot be cloned with the same meaning on another host.
      fetch(root);
      const head = synced(root, currentBranch);
      const primary = worktrees(root)[0]?.path;
      if (!primary) stop("Cannot find the primary worktree.", "Inspect git worktree list and repair its metadata.");
      return { ok: true, source: { root: canonical(root), primary: canonical(primary), repo: path.basename(primary), origin, currentBranch, head } };
    }
    if (request.action !== "prepare") stop("Unknown Git operation.", "Reload the branchfork extension.");
    const { source, branch } = request;
    const home = request.home || os.homedir();
    let repository = request.local ? source.primary : path.join(home, "source", source.repo);
    if (!request.local && !exists(repository)) {
      // Reuse known checkouts/worktrees rather than recursively scanning a host's filesystem.
      const candidates = [...(request.candidates || []), source.primary, path.join(home, "worktrees", source.repo, branch)];
      const matches = new Set();
      for (const candidate of candidates) {
        if (typeof candidate !== "string" || !path.isAbsolute(candidate) || !fs.existsSync(candidate)) continue;
        const probe = spawnSync("git", ["-C", candidate, "remote", "get-url", "origin"], { encoding: "utf8", timeout: 10000 });
        if (probe.status !== 0 || probe.stdout.trimEnd() !== source.origin) continue;
        const primary = worktrees(candidate)[0]?.path;
        if (primary) matches.add(canonical(primary));
      }
      if (matches.size > 1) stop("Multiple destination copies of this origin are known to Herdr.", "Consolidate or explicitly resolve the duplicate repository/workspace paths before retrying.");
      if (matches.size === 1) repository = [...matches][0];
    }
    if (!request.local && !/^(?:[a-z][a-z0-9+.-]*:\/\/|[^/\s:]+@?[^/\s:]*:)/i.test(source.origin)) {
      stop("Origin is a host-local path, not a portable clone URL.", "Configure a reachable origin URL on the source repository before forking to another host.");
    }
    if (!exists(repository)) {
      fs.mkdirSync(path.dirname(repository), { recursive: true });
      git(path.dirname(repository), ["clone", "--branch", "main", "--", source.origin, repository]);
      completed.push(`Cloned repository: ${repository}`);
    }
    const root = git(repository, ["rev-parse", "--show-toplevel"]);
    if (canonical(root) !== canonical(repository) || git(root, ["remote", "get-url", "origin"]) !== source.origin) {
      stop(`Destination ${repository} is not the expected repository/origin.`, "Choose/fix the destination repository explicitly; do not overwrite this directory.");
    }
    clean(repository);
    fetch(repository);
    if (ref(repository, `refs/remotes/origin/${source.currentBranch}`) !== source.head) {
      stop("Source branch moved on origin since preflight, or is unavailable on the destination.", "Verify the branch on both hosts and rerun /branchfork from a clean, synced source.");
    }
    if (git(repository, ["check-ref-format", "--branch", branch]) !== branch) stop("Invalid explicit branch name.", "Use a literal Git branch name.");
    const entries = worktrees(repository);
    const existing = entries.filter(entry => entry.branch === branch);
    if (existing.length > 1) stop("Branch is checked out in multiple worktrees.", "Resolve the ambiguous Git worktree registrations, then rerun.");
    const localRef = ref(repository, `refs/heads/${branch}`);
    const remoteRef = ref(repository, `refs/remotes/origin/${branch}`);
    // A branch freshly created by branchfork has intentionally not been pushed.
    // Allow safe retries only while that recorded local-only branch remains at its
    // original commit. All other existing branches still require exact origin sync.
    const common = git(repository, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
    const marker = path.join(common, "branchfork-created", `${require("node:crypto").createHash("sha256").update(branch).digest("hex")}.json`);
    let created;
    if (fs.existsSync(marker)) created = JSON.parse(fs.readFileSync(marker, "utf8"));
    if (localRef && !(remoteRef === null && created?.branch === branch && created?.head === localRef)) synced(repository, branch);
    if (existing.length) {
      const target = canonical(existing[0].path);
      clean(target);
      return { ok: true, folder: target, repository, completed, reused: true };
    }
    const base = path.join(home, "worktrees");
    const repoBase = path.join(base, source.repo);
    const target = path.resolve(repoBase, branch);
    if (!target.startsWith(path.resolve(repoBase) + path.sep)
      || !canonical(repoBase).startsWith(canonical(base) + path.sep)
      || !canonical(target).startsWith(canonical(repoBase) + path.sep)) {
      stop("Worktree path escapes its root.", "Remove conflicting symlink ancestors or choose a safe branch name.");
    }
    if (exists(target)) stop(`Worktree path already exists but is not registered for this branch: ${target}`, "Inspect the directory and git worktree list; resolve the collision without overwriting it.");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const args = localRef ? ["worktree", "add", target, branch]
      : remoteRef ? ["worktree", "add", "--track", "-b", branch, target, `origin/${branch}`]
      : ["worktree", "add", "--no-track", "-b", branch, target, source.head];
    if (!localRef && !remoteRef) {
      fs.mkdirSync(path.dirname(marker), { recursive: true, mode: 0o700 });
      fs.writeFileSync(marker, JSON.stringify({ branch, head: source.head }), { mode: 0o600 });
    }
    git(repository, args);
    completed.push(`Created worktree: ${target}`);
    clean(target);
    return { ok: true, folder: canonical(target), repository, completed, reused: false };
  } catch (error) {
    return { ok: false, error: String(error.message || error), completed };
  }
}
