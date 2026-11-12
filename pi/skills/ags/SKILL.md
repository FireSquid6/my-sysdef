---
name: ags
description: Build, debug, and maintain desktop bars, launchers, popups, and widgets using Aylur's GTK Shell (AGS), Astal, Gnim, and TypeScript/TSX. Use for AGS shell development, GTK4 layer-shell interfaces, compositor integrations, reactive widgets, styling, IPC, and AGS version migrations.
---

# AGS desktop development

Use **TypeScript/TSX, AGS 3, GTK4, Astal, and Gnim** for new work unless the project explicitly targets an older stack. Prefer their existing widgets, reactive APIs, compositor services, and application IPC over hand-built equivalents.

**Read `references/current-api.md` before writing AGS code.** It contains primary-source citations, current API recipes, and version caveats. Follow the linked official documentation/source for APIs not covered there. Do not substitute remembered AGS v1/v2 snippets or React/browser APIs.

## 1. Establish the actual environment

Inspect the project and its instructions first. Find its entry point, GTK major, package/lock files, generated GI types, startup commands, instance names, and existing styles.

Check available tools without starting a shell instance:

```sh
command -v ags
ags --version
ags --help
ags run --help
ags init --help
ags types --help
ags bundle --help
```

On Arch, also inspect the installed package and introspection libraries:

```sh
pacman -Q aylurs-gtk-shell gjs gtk4 gtk4-layer-shell
ls /usr/lib/girepository-1.0/Astal* /usr/lib/girepository-1.0/Gtk4LayerShell*
```

Package names vary (including AUR `-git` variants); an absent package name alone does not establish that its library is missing. Verify the actual executable and required GI namespaces. Record the package version and CLI-reported version separately if they disagree.

- AGS is scaffolding/build/control tooling. Applications execute under **GJS**, not Bun or Node.
- Bun can manage dependencies and run build/test scripts. It does not make Node/Bun APIs available inside a GJS widget. Use GLib/Gio and the AGS process/file helpers there, or call a separate controller through a defined interface.
- Match GTK4 imports, Astal 4.0, JSX runtime, generated types, and gtk4-layer-shell. Never load GTK3 and GTK4 into the same process.
- If a required tool/library is unavailable and cannot be installed, **stop immediately and report the blocker**. Do not silently downgrade the stack, invent API behavior, or claim runtime validation from static checks.

## 2. Scaffold safely and preserve existing work

For a new project, choose a task-specific directory that does not yet exist and use the installed CLI's template:

```sh
ags init --directory /path/to/new-project --gtk 4
```

Inspect the output before editing. Do not use `--force` on an existing directory without explicit approval. Do not overwrite `~/.config/ags`, another shell, or compositor startup entries merely to experiment.

Generate or refresh GI types using the installed version's help, for example:

```sh
ags types --directory /path/to/project --update
```

For an existing project, inspect what `--update` will replace before running it: it updates tsconfig and replaces the linked `ags`/`gnim` packages. Inspect the resulting TypeScript configuration and package links. Keep generated declarations/cache/symlinks out of Git unless the project's convention says otherwise. A successful type-generation command does not prove GTK can import every runtime library.

## 3. Build with native APIs and correct lifetimes

Use the reference's exact current imports and examples for:

- `app.start`, an explicit unique `instanceName`, and registering windows with the application.
- GTK4/Astal windows, monitor binding, anchors, exclusivity, and keyboard focus.
- Gnim state, property bindings, derived accessors, conditional/list rendering, and cleanup.
- GTK4 event controllers and key handling; GTK3 event-box examples do not translate directly.
- Async process/file work and application request handlers.

Treat TSX as GTK widget construction, **not HTML**. There is no DOM, browser CSS layout, or React hook lifecycle. Respect accessor semantics: derive values reactively rather than interpolating a reactive object or taking a one-time snapshot accidentally.

Create subscriptions, timers, subprocess watchers, monitors, and widgets under an appropriate owner. Clean up custom GObject connections, Gio monitors, and other external resources when their owning widget/root is disposed. Avoid repeated construction that leaks windows or listeners. For multiple outputs, observe monitor additions/removals and destroy windows/resources for removed outputs.

For popups, choose focus behavior intentionally: exclusive keyboard focus can block normal desktop input. Escape and the launcher shortcut must provide a reliable exit/toggle path. Preserve focus and keep test instances isolated from the user's running shell.

## 4. Style, control, and integrate

Use GTK CSS/SCSS and existing themes. Check GTK CSS parsing errors in the logs; browser selectors/properties and GTK3-only styling may not work. Do not promise a live reload/watch feature without checking the installed CLI. For application-controlled CSS reload, use the documented file watcher and `app.apply_css` reset behavior rather than accumulating providers.

Use AGS's native named-instance controls and IPC before inventing a custom service:

```sh
ags list
ags toggle window-name --instance unique-instance
ags request --instance unique-instance action argument
ags inspect --instance unique-instance
ags quit --instance unique-instance
```

Check each subcommand's help when the installed version differs. In AGS 3, `requestHandler` receives an argument array and a response callback; every handled request must respond, including errors. Keep shell commands and untrusted input separate; prefer argument arrays over string interpolation.

Store sources and reproducible configuration in the repository, but keep credentials, host preferences, sockets, logs, generated bundles, and session state local. In sysdef, link only the specific skill/config needed and inspect destination conflicts first. Adding this skill does not authorize replacing the current Python monitor menu or Waybar, editing startup, or launching desktop UI.

## 5. Verify honestly

1. Run project tests and TypeScript checking against the generated GI/JSX types.
2. Bundle a disposable output with the actual AGS CLI:
   ```sh
   ags bundle /path/to/project/app.tsx /tmp/my-shell-check --gtk 4
   ```
3. When authorized, run a uniquely named test application in the target Wayland session. Check logs, GTK inspector, window placement, focus/close controls, reactivity, and cleanup. Close **only that test instance** afterward.
4. Verify multi-monitor attach/detach and scaling on real outputs when available; explicitly state when this is only test-covered.
5. Report static/bundle/runtime verification separately. Bundling does not resolve every GI import or prove layer-shell/IPC behavior.

Prefer a small vertical slice (one window, one control, one reactive value) before adding compositor data, persistence, or more monitors. Keep domain/controller logic separately testable; a skill installation should not change the user's live desktop.
