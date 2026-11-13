# Interactive local worktrees

Run from anywhere inside the repository you want to work on:

```sh
worktree.ts
```

The executable is `scripts/worktree.ts`, with a Bun shebang. With the sysdef
scripts directory on PATH, no wrapper or `bun` prefix is needed. It requires
**Bun, Git, fzf, and an interactive terminal**. It takes no arguments or flags.

## Flow

1. Resolve the current directory's Git repository. Inside a submodule, including
   nested submodules, walk up to the **outermost parent repository**. Display the
   selected repository and its primary checkout. Outside Git, stop.
2. Warn about dirty source files, but leave them untouched. Uncommitted changes
   are **not** copied into a newly created worktree.
3. Fetch and prune origin's remote-tracking branches. This is the only network
   operation; no remote machine, Pi, or Herdr commands are used. If origin is
   missing or fetching fails, explain and ask whether to continue with available
   local/cached refs. The default answer is No.
4. Search/select an existing local or origin branch, or choose **Create a new
   branch…** and enter its name. Where local and origin names coincide, select
   the local branch as-is; it is never reset to the origin version.
5. For a new branch, select its starting point. After a successful fetch, propose
   `origin/main`. Otherwise use cached `origin/HEAD`, then an unambiguous local
   `main` or `master` as a fallback proposal. If uncertain, say so and ask the user
   to choose. Current HEAD and all available local/origin branches are selectable.
6. Reuse a registered worktree for the chosen branch, even outside the usual
   directory or with dirty files. Print its status; don't alter it. Otherwise,
   display the repository, branch, base commit, destination, and tracking behavior
   and ask for confirmation (default No).
7. Create the worktree and print its absolute path and a safely quoted `cd`
   command. The calling shell's working directory is unchanged.

Type to search in either picker, use arrow keys to select, and Enter to accept.
Esc/Ctrl-C cancels a picker; Ctrl-C/Ctrl-D cancels a text prompt. Cancellation
creates no worktree, although an earlier fetch may already have updated origin
refs. Reusing an existing worktree doesn't require another confirmation.

## Paths and branch behavior

New worktrees live at:

```text
~/worktrees/<primary-repository-directory-name>/<branch>
```

For example, `feature/login` in sysdef becomes
`~/worktrees/sysdef/feature/login`. Invocation from another linked worktree still
uses the primary checkout's directory name.

- Existing local branches retain their commits and tracking settings, even if
  unpublished or different from origin.
- Origin-only branches become local branches tracking the corresponding origin
  branch.
- Newly named branches have **no upstream**, regardless of their base. Creating
  a branch from `origin/main` does not make it track main.
- New branches start at the exact commit shown in the confirmation. Existing
  branches and destination paths are rechecked after confirmation.
- Invalid branch names, branch shorthand, path escapes, symlink escapes, and
  unregistered existing destination directories are rejected. Nothing is forced
  or overwritten. Missing/prunable worktree registrations require explicit repair.

The script never stashes, commits, pushes, pulls, resets, cleans, transfers files,
launches a shell, or opens Pi/Herdr. Git's normal configured hooks still apply.
If Git fails during creation, it may retain a branch or partial worktree; inspect
`git worktree list` and the reported path before retrying. The script does not
roll back or delete resources automatically.

## Checks

```sh
bun test test/worktree.test.ts
./node_modules/.bin/tsc --noEmit --strict --noUncheckedIndexedAccess \
  --target ESNext --module Preserve --moduleResolution Bundler \
  --allowImportingTsExtensions --skipLibCheck --types bun \
  scripts/worktree.ts scripts/worktree-model.ts test/worktree.test.ts
```

Tests use disposable Git repositories, including nested submodules, and exercise
the installed fzf search options. They don't fetch or create worktrees in sysdef.
