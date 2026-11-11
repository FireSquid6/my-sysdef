# Centralized Herdr keyboard help

## Context
Inline shortcut hints clutter the custom tty interface. Replace these with one help popup, opened with Ctrl+Alt+H, with General and pane-specific tabs navigated using `[` and `]`.

## Approach
- Extend the existing personal `tty-help` mod as a centered, Tokyo Night themed overlay. Include General and tabs for every custom interface with its own controls, including auxiliary dialogs, menus, quick terminal, and games. Interfaces without local keys remain covered by General rather than receiving empty tabs.
- Open on the originating interface's tab (Terminal for a terminal); use General when no specific context applies. Open above existing overlays, preserving their state and restoring their focus on dismissal.
- Keep searchable, scrollable content. Reserve `[` / `]` for previous/next tab with wraparound, including while the search input is focused; preserve the query across switches. Clickable tabs and Escape dismissal remain available.
- Keep command labels, action buttons, status information, and safety confirmations; remove shortcut-only footers and inline shortcut annotations. In Tetris's binding editor, keep editable key values because they are configuration controls, not redundant hints.
- Preserve existing functional shortcuts and help aliases; route all custom help openings through the same context-aware path. Add Ctrl+Alt+H for help and reserve it from Tetris binding capture.

## Files to modify
- `herdr/mods/tty-help/main.js`, `mod.json`, and a new local catalogue module: tabbed help, sizing, and local shortcut descriptions.
- `herdr/keys.json`: Ctrl+Alt+H, existing help aliases, and help-local bracket navigation routing.
- `herdr/mods/tty-tabs/main.js` and its quick-terminal helper: always-present contextual help dispatch and quick-terminal context.
- Context reporting and/or hint cleanup in `herdr/mods/{tty-files,tty-changes,tty-repo,source-picker,tty-picker,tty-menu,tty-new-menu,tty-prompt,tty-confirm,tty-machine-add,tty-worktree,tty-arcade,tty-minesweeper,tty-solitaire,tty-tetris,quick-terminal}/main.js`.
- `herdr/mods/tty-workspace-status/main.js`: replace shortcut text with a plain action label.
- `herdr/mods/tty-tetris/controls.js`: reserve help chord and expose current configured controls to help without duplication.
- A small shared helper under personal mods for context reporting/opening, reusing supported local-module imports.
- `herdr/TTY.md`: document centralized help. Leave shipped originals and generated files untouched.

## Reuse
- `tty-help`: `keys()`, theme-aware rows, filtering input, scrolling, `closeOverlay(props().overlay)`.
- Existing pane focus and keyboard handlers in `tty-files`, `tty-changes`, and `tty-repo`; `keyboard.panel` is only a focus request, not authoritative current context.
- `herdr.d.ts`: `keys()` returns section/key/action rows; `panes()` identifies model mod panes; `openOverlay` accepts contextual props and preserves underlying interfaces. No API directly identifies every focused layout mod/top overlay, so explicit context reporting is needed.
- `tty-tabs` command receiver is available throughout the custom layout and already routes panel focus.
- `tty-tetris/controls.js` merges defaults with `shared("tetris.settings")`; help must display these effective bindings, not a static default list.

### Catalogue coverage
- General: effective global/layout bindings; Terminal: terminal bindings and quick-terminal forwarding behavior.
- Files: search, counted navigation, expand/collapse, preview/back.
- Changes: focus cycling, list/diff navigation, commit input, action buttons.
- Repo: section cycling, filtering, detail/back, refresh/browser, counted navigation.
- Source picker and tab picker: filtering, selection, submit, machine cycling, directory browsing/tab closing.
- Context menu and new-item menu: selection/activation and numbered agent launching.
- Prompt, confirmation, machine-add, worktree: submit/cancel and interface-specific selection/confirmation behavior.
- Arcade, Minesweeper, Solitaire, Tetris: selection/gameplay/restart controls; Tetris includes its settings/capture submodes.
- Quick terminal and Help: their own routing/navigation controls.

## Steps
- [x] Inventory shortcut hints and local keyboard handlers across personal mods.
- [x] Resolve scope: all interfaces; initial tab: current interface; retain search with reserved bracket navigation.
- [ ] Build the local-control catalogue from handlers and live configured game controls; merge effective `keys()` bindings by context so overridden actions are not presented as simultaneously active. Retain section/conditional labels where needed.
- [ ] Add explicit interface-context reporting at real focus/activation boundaries (including mouse focus and input focus), with terminal/model-pane fallback. Preserve a return context for nested overlays; avoid help overwriting its origin. Do not infer context solely from the last panel-opening request.
- [ ] Route Ctrl+Alt+H and existing custom help aliases to the contextual opener; ensure repeated invocation toggles help without stacking duplicates.
- [ ] Implement tabs, search, bracket dispatch ahead of text entry, scrolling, and Escape/focus restoration. Verify supported dispatch/focus APIs before choosing the final helper wiring.
- [ ] Remove shortcut footers, menu shortcut columns, and key suffixes from buttons; retain button labels, safety messaging, and binding-editor values. Replace the status-bar palette hint with a plain Commands action.
- [ ] Update documentation and verify live behavior.

## Verification
- Run `herdr-app check` for every changed mod and inspect `herdr-app status`.
- Open help from terminal and each pane, cycle tabs with brackets, filter, scroll, and close with Escape.
- Check every listed shortcut against configuration or its local handler; verify precedence and conditional behavior.
- Inspect screenshots for uncluttered panes, readable theme, tab overflow, and popup sizing. Make the tab strip scroll or wrap so all interface tabs remain reachable.
- Test opening after both keyboard and mouse focus changes, from a text field, nested menu/dialog, game, normal terminal, and quick terminal. Closing help must not lose input, terminate a game, or dismiss the underlying overlay.
- Verify brackets never enter the search query, Escape closes only help, and repeated help invocation does not stack overlays.
- Change a Tetris binding and confirm help reflects the new value; confirm Ctrl+Alt+H cannot be captured by its editor.
- Audit personal UI source for remaining shortcut-only text, documenting necessary binding-editor exceptions. Run `git diff --check`; no generated/shipped files should change.
