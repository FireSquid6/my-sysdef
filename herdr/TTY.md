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

## Centralized keyboard help

Ctrl+Alt+H opens centralized, context-selected help above the current interface.
The existing Ctrl+? / Ctrl+Shift+/ aliases use the same route in TTY. Press the
help shortcut again or Escape to dismiss only help; the underlying pane, input,
menu or game remains alive. Games retain their normal focus-loss pause behavior.
Outside TTY, Ctrl+Alt+H opens the same help mod directly.

General and Terminal are joined by tabs for each custom pane, picker, menu,
dialog and game. `[` and `]` cycle tabs with wraparound, including while the
search field has focus; brackets are reserved and cannot be searched literally.
Click tabs or horizontally scroll the tab strip to reach every interface. Search
filters the selected tab without clearing its query on tab changes; the result
area scrolls independently. Global/layout/mod bindings are merged by specificity,
and displayed with their applicable section. Inline shortcut-only labels have
been removed; action labels, safety warnings and editable Tetris binding values
remain. The status-bar palette action is simply **Commands**.

Context uses explicit overlay lifetimes, live pane focus handles and input
focus/blur notifications, not the last panel-open request. Layout-panel focus is
sampled every 80 ms because this API has no focus-change subscription for handles.
Unknown/native interfaces fall back to General or Terminal. Help uses the current
Tokyo Night theme colors and a window-relative centered dialog.

Tetris publishes its effective controls from the same binding table used by the
game, so changes appear in help without a duplicate defaults table. Before its
first launch, the Tetris tab asks you to open the game once to load these rows.
Ctrl+Alt+H is reserved from binding capture.

Implementation note: Herdr rejects imports (including symlinks) outside a mod's
own directory. `mods/tty-help/context.js` is therefore mirrored as local
`help-context.js` modules in participating personal mods. Keep these identical;
`node --test tests/help.test.mjs` checks synchronization and context dispatch.
No shipped or app-generated files are involved.

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

## Arcade

Ctrl+Alt+T opens the arcade menu in any layout (replacing the direct Tetris
shortcut). Ctrl+Shift+T remains **new tab**. Choose Tetris, Minesweeper,
Solitaire, 2048, or Breakout with a click, 1–5, or j/k / arrow keys followed by
Enter. Escape closes the menu. Each game has an Arcade button to return to the
chooser, and saves its progress when closed.

The entire arcade has a fixed, independent retro palette rather than inheriting
the TTY theme: a block-pixel marquee and game sprites, beveled Tetris blocks,
raised mine tiles and pixel flags/mines, and pixel-suit playing cards with
patterned backs, numbered 2048 tiles, and colorful Breakout bricks. Theme changes
to the workspace do not recolor these games. All five choices fit the original
480×340 launcher; games are modal overlays, never permanent sidebar panels.

### Tetris

Choose Tetris from the arcade menu. Escape always closes it
and pauses/saves the game. Reopening restores the board paused; press p (or your
configured pause key) to resume. Closing through the shortcut, hot reload, and
normal app quit use the same pause/save hook. The timer is cancelled on close;
held keys never carry across reopening. Best score and controls also persist.

Default controls (arrow-key alternatives are available):

- h/l: move left/right; j: soft drop; k: clockwise rotation; z: counterclockwise.
- Space: hard drop; c: hold/swap; p: pause/resume.
- r: new game, followed by y to confirm or n to cancel (remains paused).
- s or F2: Settings. F2 is an unchangeable recovery shortcut.

In Settings, j/k or Ctrl+Tab selects a row; Enter captures a new key/chord.
Backspace restores the selected default; d restores all defaults; q/F2 returns
to the paused game. Conflicting/reserved bindings are rejected. The starting
level row uses h/l (levels 1–15) and applies to the next new game. Settings save
automatically to namespaced Herdr shared state (`tetris.settings` and
`tetris.startLevel`), rather than assuming custom app-settings keys are supported.
The launch shortcut itself can be changed in `keys.json`.

This is an original Guideline-style single-player Marathon implementation,
using https://tetris.wiki/Tetris_Guideline as a reference: 10×20 visible cells
plus 20 hidden rows, SRS kicks, seven-bag randomization, five-piece preview,
hold, ghost, 500 ms lock delay with at most 15 move resets, Worlds-style gravity,
20× soft drop, level progression every 10 lines, T-spins/minis, back-to-back,
combos, and perfect-clear scoring. Movement repeats after 167 ms at 33 ms
intervals. Standard piece colors use bright arcade tones and beveled pixel tiles. Logos,
music, multiplayer/garbage, Sprint, and Ultra are not included; this is not a
claim of complete official Guideline compliance.

Checks: `node --test tests/tetris-*.test.mjs` and
`herdr-app check /home/firesquid/sysdef/herdr/mods/tty-tetris`.

### Minesweeper

The default board is 9×9 with ten mines. New-game setup lets you choose a
square board from 5×5 to 16×16 and a bomb count from one to all but one cell.
Presets include Beginner (9×9 / 10), Intermediate (12×12 / 24), and Expert
(16×16 / 40). The first revealed square is always safe; empty squares flood-fill
their neighbors. Reveal every safe square to win.

- h/j/k/l or arrows: move the cursor; Enter/Space: reveal; f: toggle a flag.
- Left click reveals a square; right click toggles its flag.
- r / New game: open setup; j/k selects size or bombs, h/l adjusts.
- Setup also has mouse controls and presets. Enter/y starts; n cancels without
  changing your current board. Shrinking the board clamps the bomb count.
- Escape: save and close. Back to arcade saves and returns to the chooser.

Progress, board size, and bomb count are stored locally as `minesweeper.game`.
Existing 9×9 saves remain compatible. A loss shows pixel mines and marks
incorrect flags with a pixel X.

### Solitaire

Draw-one Klondike: build each foundation from Ace to King in one suit. Tableau
stacks descend in alternating colors; only a King can fill an empty column.
Select a face-up card (or stack) and then its destination. Newly exposed cards
turn face up automatically.

- Click the stock to draw; an empty stock recycles the waste.
- h/l or Left/Right: choose a pile; j/k or Down/Up: choose a tableau card.
- Enter/Space: select a card or move the selected card/stack to the current pile.
- d: draw from stock; r: request a new deal, then y/n to confirm/cancel.
- Once stock and waste are empty and every tableau card is face-up, click
  **Autocomplete [A]** or press a to finish the legal foundation moves instantly.
  Autocomplete does not reveal hidden cards or play through the stock for you.
- Escape: save and close. Arcade saves and returns to the chooser.

Progress is stored locally as `solitaire.game`. Complete all four foundations
to win.

### 2048

Slide a 4×4 board to combine matching numbers. Each tile can merge only once per
move, and a new 2 or 4 appears only when the board changes. Reach 2048 to win,
then keep chasing a higher score. Continue acknowledges the milestone without
interrupting play.

- h/j/k/l or arrows: slide left/down/up/right.
- u / Undo: undo the last move, including its spawned tile and score.
- c / Continue: keep playing after reaching 2048.
- r / New game: request a fresh board; y/n confirms/cancels.
- On-screen direction buttons also support mouse play.
- Escape: save and close. Arcade saves and returns to the chooser.

Progress and best score are stored locally as `2048.game` and `2048.best`.

### Breakout

Bounce the ball off your paddle to clear colorful brick walls. You have three
lives; clearing a wall advances to the next level.

- h/l or Left/Right: move the paddle; release the key to stop.
- Space: launch the ball; p: pause/resume.
- r / New game: request a fresh game; y/n confirms/cancels.
- Escape: pause, save and close. Arcade saves and returns to the chooser.

Losing focus pauses the game. Reopening restores saved progress paused so the
ball never starts moving unexpectedly. Progress and best score are stored as
`breakout.game` and `breakout.best`.

Arcade checks: `node --test tests/arcade.test.mjs tests/tetris-*.test.mjs tests/minesweeper*.test.mjs tests/solitaire*.test.mjs tests/2048*.test.mjs tests/breakout*.test.mjs`
from this directory; `herdr-app check` can validate each `mods/tty-*` game.

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
