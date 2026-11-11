# Terminal-style Herdr

The personal `tty` layout uses JetBrains Mono for UI and terminals,
square pane frames, flat numbered tabs, compact padding and Tokyo Night.
The `tty-*` mods are personal clones; shipped mods/layouts are unchanged.
The source project picker retains its four-tab startup behavior.

Switch back to the shipped layout with:

```sh
herdr-app do layout.switch --name main
```

Global monospace font settings live in `settings.json`. The sharp pane
frames and compact layout live in `layouts/tty.json`; individual UI
elements live in the `mods/tty-*` clones. Native app-owned settings,
palette, and system dialogs are not replaceable through the layout API.
Clones are not automatically refreshed with upstream mod changes.

## Keyboard panels

- Alt+F / Alt+C / Alt+R: show and focus Files / Changes / Repo.
- Alt+Enter: return to the last terminal in this tab (or the last available
  terminal in another tab if this tab has none).
- Files: j/k or arrows move; h collapses or selects the parent; l expands
  or descends; Enter toggles a directory or previews a file; h/Escape returns
  from the preview; g/G select the first/last row.
- Numeric prefixes work in both panels and in diff scrolling: `10j`, `4k`.
- `/` in Files fuzzy-filters the currently listed names, ignoring case.
  Enter finishes typing the query; j/k select results and Enter previews.
  Escape returns to the unfiltered tree. Only entries already listed in the
  tree (including expanded folders' children) are searched; no recursive scan.
- Changes: j/k select files; Enter previews; l enters diff scrolling, where
  j/k and g/G scroll; h/Escape returns to the file list. i focuses the commit
  message; Escape returns to navigation. Enter in the message commits.
- Changes Ctrl+Tab cycles through files → preview → commit message →
  Commit → Push → Pull → Diff → Close (when an upstream diff is open).
  Buttons have an accent focus border; Enter/Space activates them, and arrows
  or h/j/k/l move between controls. Shift+Tab is not a navigation binding. Escape closes an upstream diff or returns
  to file navigation. Alt+Enter still returns to the terminal.

### Remote sync

The bottom of Changes shows the current branch, tracked upstream, and local
`↑ahead ↓behind` counts (updated after fetch/pull/push, otherwise from cached
remote-tracking refs). There are no branch-changing controls.

- **Push** runs normal `git push`, never force-push.
- **Pull** runs `git pull --ff-only`, refusing diverged history rather than
  automatically merging or rebasing.
- **Diff** fetches, then previews the tracked upstream versus the local working
  tree, including committed and uncommitted changes to tracked files. Untracked
  files remain in the normal Changes list. Close the preview or pick a file to
  return to local changes. Previews are limited to 1,500 lines.

Actions run on the workspace's machine. They are disabled while Git is busy or
when no upstream is configured; configure one outside this panel first. Git
failures appear above the commit input. Network operations time out after two
minutes. Merely opening the panel does not contact the remote.

Checks: `node --test tests/panel-navigation.test.mjs tests/changes-sync.test.mjs`.

Opening a text file from Files uses an existing Neovim pane anywhere in the
current workspace, preferring the current tab, and switches to that pane.
No Neovim, an unreachable server, or a refused edit falls back to the built-in
preview. Binary files are never sent to Neovim. Modified buffers are not
force-discarded. Restoring an old preview does not trigger an external open.
Socket discovery uses Python 3 and Linux `/proc` on the file's machine;
otherwise the preview remains available. Neovim needs its normal listening
server (enabled by default); no configuration changes are required.

## GitHub Repo panel

Alt+R opens and focuses Repo alongside Files and Changes. The sections are
Overview (repository identity, description, default branch, GitHub URL), PRs
(open pull requests with draft/review state), Issues (open issues and labels),
and Workflow runs (status/conclusion). This first version is read-only.

- Ctrl+Tab or l: next section; h: previous section (or back from details).
- j/k: move through items or scroll detail body lines; numeric prefixes work
  (`10j`, `4k`). g/G: first/last; `5g` jumps to item/line 5.
- Enter: show PR/issue body or workflow summary; h/Escape returns to the list.
- `/`: filter the current list; Enter applies and returns to navigation;
  Escape clears the filter and leaves search.
- r: refresh GitHub data; o: open the selected item or repository in the local
  browser (Linux `xdg-open`, best effort). Alt+Enter returns to the terminal.

The panel uses `gh` authenticated on the workspace's machine (`gh auth login`),
with local browser handoff even for remote repositories. Only github.com is
supported. Data is cached by workspace location; r explicitly refreshes it.
The lists show up to 50 open PRs, 50 open issues, and 30 workflow runs; the panel
states these limits and surfaces authentication, network, or missing-tool errors.
Detail bodies are line-oriented text so all content is keyboard-scrollable.
No GitHub mutations, branch changes, or automatic periodic polling are performed.

Repo checks: `node --test tests/repo.test.mjs tests/repo-integration.test.mjs`.

## Project picker

Ctrl+O / Alt+O starts at `~/source/` on the current space's machine (this
computer if there is no active space). Ctrl+Tab cycles through this computer
and configured remote machines, resetting the path to `~/source/` each time.
The heading identifies the selected machine. Tab still browses into a selected
directory, and matching is unchanged. Opening creates agent/editor/term1/term2
in that order on the selected machine, focusing agent. Agent starts `pi`, editor
starts `nvim`, and term1/term2 are plain Fish shells with no startup command.
Pi, Neovim, and Fish must be installed on that machine.

## Quick terminal

Alt+S toggles a terminal popup, starting on this computer in `~`. Ctrl+Tab
switches to the next configured machine, also in its home directory. One Fish
shell per machine is retained when the popup is hidden or switched; reopening
starts with this computer again. Alt+Enter closes it and returns to the main
terminal. Fish must be installed on each chosen machine. A failed switch leaves
the current popup open.

Ctrl+Tab in terminal programs is forwarded through the core. The project
picker uses it to cycle machines, Changes uses it to cycle controls, and Repo
uses it to cycle sections. Shift+Tab is not used for panel navigation.
