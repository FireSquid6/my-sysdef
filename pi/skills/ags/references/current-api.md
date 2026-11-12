# AGS v3.1.2: source-verified implementation notes

## Scope and provenance

- Accessed **2026-11-11** (environment `date -I`), using only upstream AGS documentation/source and GitHub metadata.
- GitHub's reachable latest release is **v3.1.2**, published **2026-04-08**; both that tag and reachable `main` resolve to **`bbee2f18939f1ec7ff720e717cf305e73635628f`**. “Current” below means this revision, not a prediction about future releases. [Release metadata][release] [Tag metadata][tag] [Main metadata][main]
- Parent-provided local context: installation of `aylurs-gtk-shell` **3.1.2-1** is pending; Astal GTK3/GTK4/IO are installed. The parent extracted the package and verified its binary reports **`ags version 3.1.0`**, despite the **3.1.2-1 package version**. Preserve this discrepancy: neither the binary's embedded version nor an older `-git` cache alone identifies the installed runtime source.
- Research verification means reading the pinned implementation/templates, not executing a GTK session. The parent additionally **successfully bundled the first clock/window TSX example below** with the extracted package's CLI, overriding both `ags` and `gnim` aliases to its extracted runtime sources. No GUI was launched and no generated-GI type-check was performed. CLI details below come from source, corroborated by extracted-package help inspection (including no watch flag).

## Version boundaries: do not blend examples

| Generation | Recognizable API | Current replacement / caveat |
| --- | --- | --- |
| v1 | `App.config`, global `Widget`/`Utils`/`Service`/`Variable`, `config.js`, `ags --run-js` | Ground-up rewrite required; no compatibility assumption. |
| v2 | `astal/gtk4`, `astal/gtk3`, `Variable`, `bind`, `astalify`, `setup`, `className` | v3 uses `ags/...`, Gnim accessors, direct GTK JSX, `$`, `class`. |
| v3.1.2 | `ags/gtk4/app`, `createState`, `createBinding`, `createComputed`, `For`, `With` | GTK3 remains supported separately; v3 does **not** mean GTK3. |

These boundaries are documented in the [migration guide][migration]; current imports are confirmed by [package exports][package] and [GTK4 exports][gtk4]. The migration guide itself contains historical intermediate snippets: its v1 section still shows `astal/gtk4/app` and a string request handler. **Do not copy those as v3 APIs.** [Migration][migration] [Current app implementation][app]

## What runs what

- **AGS CLI** is Go/Cobra plus the Go esbuild API: scaffolds, generates declarations, bundles TS/TSX, launches GJS, and sends IPC requests. It is not the JavaScript runtime. [CLI root][root] [Bundler][esbuild] [Run][run]
- **GJS** is the runtime; **GTK4/GDK4** provide UI/input; **Astal** supplies the shell window and optional system-integration libraries; **Gnim** supplies JSX/reactivity. `ags` reexports Gnim. [Quick start][quick] [Root JS module][index] [GTK4 exports][gtk4]
- The package declares GJS `>=1.79.0`, peer dependency `gnim: ^1.9.1`; the checked-in lockfile resolves Gnim **1.9.1**. A distribution may resolve that range differently; do not infer its Gnim version from AGS's version alone. [Package][package] [Lockfile][lock]
- **Bun is not required as runtime**, nor required by this upstream build path. If used for editing/dependency tooling it is a development choice: upstream installation uses npm/Meson/Ninja/Go, and `run` executes `gjs -m`, not Bun/Node. Do not use Bun or Node APIs in runtime code merely because they type-check locally. [Install][install] [Run][run] [Meson][meson]
- GTK4 execution preloads `libgtk4-layer-shell.so`; the app module unsets `LD_PRELOAD` so it does not leak to subprocesses. Preserve this startup requirement when bypassing the AGS launcher. [Run][run] [App][app]

## Imports, TSX and bootstrap

Use `.tsx` for JSX, with `jsx: "react-jsx"`, `jsxImportSource: "ags/gtk4"`, `moduleResolution: "Bundler"`, `module: "ES2022"`, `target: "ES2020"`. `ags init` writes these settings. Direct versioned GI imports or `ags/gtk4` exports select GTK4/GDK4/Astal 4.0. [Template config][tsconfig] [GTK4 exports][gtk4]

```tsx
import app from "ags/gtk4/app"
import { Astal } from "ags/gtk4"
import { createPoll } from "ags/time"

app.start({
  main() {
    const clock = createPoll("", 1000, () => new Date().toLocaleTimeString())
    const { TOP, LEFT, RIGHT } = Astal.WindowAnchor
    return (
      <window visible name="bar" application={app}
        anchor={TOP | LEFT | RIGHT}
        exclusivity={Astal.Exclusivity.EXCLUSIVE}>
        <label label={clock} />
      </window>
    )
  },
})
```

This combines the upstream [quick-start][quick] and [GTK4 bar template][bar-template]; `main` creates widgets for their side effects, not a React render loop. GTK4 windows must explicitly be `visible`. Place resource creation inside `main`/components: a later invocation can be a client request rather than the primary UI process. `app.start` is a singleton `Gtk.Application` bootstrap, with the root scope disposed on application shutdown. [First widgets][widgets] [App implementation][app]

- Built-in lowercase tags are intrinsic widgets; capitalized `<Gtk.Calendar />` works without `astalify`. GTK4 `<window>` is **Astal.Window**, not plain Gtk.Window. [Migration][migration] [Intrinsics][intrinsics]
- GTK4 uses `orientation={Gtk.Orientation.VERTICAL}`, `class="name"`, `$={(self) => ...}`; use `onClicked`, `onNotifyText`, etc. for signals, not DOM events. [Intrinsics][intrinsics] [Migration][migration]
- For named IPC toggling, give windows unique `name`s and register through `application={app}` or `app.add_window`. Upstream explicitly warns to set `name` **before** `application` because props apply sequentially. [App/CLI docs][app-doc]

## Reactivity and ownership

```tsx
import { createState, createComputed, createBinding } from "ags"

const [count, setCount] = createState(0)
const label = createComputed(() => `Count: ${count()}`)
// In a component: <button label={label} onClicked={() => setCount(n => n + 1)} />
// For a real GObject: const value = createBinding(object, "propertyName")
```

- `createState` returns an Accessor and setter; setter accepts a value or updater. Pass the Accessor itself as a reactive JSX prop. Calling `count()` reads its value; reading inside `createComputed` tracks it. `count(n => String(n))` is the mapping shorthand. [First widgets][widgets]
- `createBinding(object, "propertyName")` tracks GObject properties, not arbitrary plain-object fields. Correct the documentation's accidental `createBinding(count, "count")` self-reference to `createBinding(counter, "count")` when adapting its CounterStore example. [First widgets source][widgets]
- `createPoll` is imported from **`ags/time`**, not the root `ags` module. Its verified overloads are `(initialString, milliseconds, command)`, `(initial, milliseconds, command, (stdout, prev) => next)`, and `(initial, milliseconds, (prev) => nextOrPromise)`. [Time source][time]
- Polling begins with the first subscriber, schedules an initial computation, and stops its interval when the last unsubscribes; simply constructing/reading the accessor does not establish ongoing polling. Prefer real GI signals/bindings where available. [Time source][time] [Utilities][utilities]
- Commands are **not implicitly shell commands**: no `$HOME`, pipes, `&&` expansion. Use explicit argument arrays, or `['bash', '-c', script]` when shell semantics are intentional. Catch asynchronous process failures; avoid blocking `exec` in the UI. [Utilities][utilities]
- Use `onCleanup` for manually owned signal IDs, monitors, timers or processes; e.g. register `onCleanup(() => object.disconnect(id))` after `connect`. Do not port v1/v2 `.hook`, `.poll`, `.drop` widget/accessor methods. [Migration][migration]
- The app establishes a Gnim root in `main` and disposes it on shutdown. Lifecycle cleanup is not a claim that every external resource is automatically managed: raw `monitorFile` returns a `Gio.FileMonitor` needing `cancel()`, and raw timers have explicit cancellation. [App][app] [File source][file] [Utilities][utilities]

### Dynamic children: `With` and `For`

```tsx
import { For, With } from "ags"
// `items` and `selected` below are Accessors from your component/store.
// <box><For each={items}>{item => <label label={item.name} />}</For></box>
// <box><With value={selected}>{v => v && <label label={v.name} />}</With></box>
```

`For` reconciles an accessor array, adding/removing item widgets; its callback's second argument is an `Accessor<number>` index. `With` unwraps/replaces a value, useful for nullable objects and nested properties. Dynamic children should not be passed as an old `Binding` child; use these components. Upstream warns generic GTK containers may append replacements rather than preserve sibling order: isolate each dynamic region in a container and do not assume web keyed-DOM ordering. Prefer `visible` over recreating a widget when only visibility changes. [First widgets][widgets] [Migration][migration]

## GTK4 input and layer windows

```tsx
import { Gtk, Gdk } from "ags/gtk4"
// Within a widget's children:
// <Gtk.GestureClick propagationPhase={Gtk.PropagationPhase.CAPTURE}
//   button={Gdk.BUTTON_PRIMARY} onPressed={() => console.log("pressed")} />
```

This controller-as-child pattern is documented for GTK4; it replaces assumptions about GTK3 `eventbox`/old widget keybinding hooks. Select **Gdk 4.0** (via `ags/gtk4` or `gi://Gdk?version=4.0`), not GTK3 GDK event APIs. Other controller callback signatures should be checked against installed GI types rather than guessed from browser events. [First widgets][widgets] [GTK4 exports][gtk4] [Migration][migration]

For shell placement, verified enums include `Astal.WindowAnchor.TOP | LEFT | RIGHT`, `Astal.Exclusivity.EXCLUSIVE`, and `Astal.Keymode.ON_DEMAND`; the latter is shown as `keymode={Astal.Keymode.ON_DEMAND}`. Use `monitor={index}` or `gdkmonitor={monitorObject}`. Do not substitute made-up string enum values or a browser's window geometry API. The verified minimal enum examples are in [intrinsics][intrinsics] and the [bar template][bar-template]; this note does not invent a full enum catalog.

### Multiple monitors and hotplug

- The generated template takes a startup snapshot via `app.get_monitors().map(Bar)`; it is **not** the complete hotplug implementation, and its repeated `name="bar"` is unsuitable for uniquely addressed monitor windows. [App template][app-template] [Bar template][bar-template]
- The fuller official example binds `createBinding(app, "monitors")`, renders `<For>` with `<This this={app}>`, passes each `Gdk.Monitor`, and names windows `bar-${gdkmonitor.connector}`. The app explicitly emits `notify::monitors` on the display model's `items-changed`. [Example app][example-app] [Example bar][example-bar] [App][app]
- **Root windows are not automatically destroyed.** The official bar's `onCleanup` explicitly calls `win.destroy()` when the parent monitor `For` removes the item. Preserve that cleanup when implementing hotplug; do not only hide an orphaned window. [Example bar][example-bar]

## CSS/SCSS and reload behavior

- Import `style.css`/`style.scss` as a string and use `app.start({ css: style, main() { ... } })`. This is GTK CSS, not a browser CSS engine. Prefer classes/stylesheets; widget-local `css` does not cascade to its children. [Theming][theming]
- `.scss` is compiled at bundle time by executing **`sass`**, which must be available if SCSS is used; `.css` uses an esbuild text loader. GJS does not interpret SCSS at runtime. [Bundler][esbuild]
- `app.apply_css(cssOrPath, true)` resets previous providers before adding CSS; `reset_css()` removes prior providers. Runtime application accepts CSS text, existing CSS file paths, or `resource://` paths, **not SCSS source**. [App][app]
- **No built-in watch/hot-restart flag is registered for `ags run` in v3.1.2**; source contains `TODO: watch and restart`. `WatchFiles` in bundler plugins is not an exposed live-reload feature. [Run][run] [Bundler][esbuild]
- To implement CSS reload yourself, monitor the file using `monitorFile` from `ags/file`, call `app.apply_css(cssPath, true)` after a valid change, and cancel the monitor through `onCleanup`. Compile SCSS separately before applying. This is a composition of verified APIs, not a built-in AGS watcher. [File source][file] [App][app] [Migration][migration]

## IPC: current signatures, not migration-era examples

```ts
app.start({
  instanceName: "my-shell",
  requestHandler(argv: string[], respond: (response: string) => void) {
    const [command] = argv
    respond(command === "ping" ? "pong" : "unknown command")
  },
  main() { /* create windows */ },
})
// ags request -i my-shell ping
```

Current handler input is an **argument array**. `StartConfig` types the response callback as `any`, while the underlying request signal and documentation use a **string**: respond with strings for compatibility and answer once. The docs say the CLI waits for the response. `app.connect("request", ...)` is the signal spelling; `"reqeust"` in the prose example is a typo. Default instance is `ags`, D-Bus application ID is `io.Astal.<instanceName>`, and instance name is configured in code. [App][app] [App/CLI docs][app-doc] [Request command][request]

## CLI reference (v3.1.2 command registrations)

| Command | Verified flags and behavior |
| --- | --- |
| `ags --version`, `ags --help` | Cobra version/help; subcommands are registered in root. [Root][root] |
| `ags init -d ./shell --gtk 4` | `-d/--directory`; `-g/--gtk` default 4; `-f/--force` overwrites; existing directory refused without force. Generates template, links packages, generates types. [Init][init] |
| `ags run ./app.tsx --gtk 4` | `-d/--directory` default config dir; `-g/--gtk` default auto; `--define`; `--log-file`; hidden `--alias`. Positional args after entry are forwarded to GJS/app. No `--watch`. [Run][run] |
| `ags bundle ./app.tsx ./my-shell --gtk 4` | Exactly two positional args; `-r/--root`; **`-d/--define`** (not directory); `--alias`; `-g/--gtk` default auto. [Bundle][bundle] |
| `ags types 'Astal*' -d ./shell` | `-d/--directory`; `-u/--update`; `-v/--verbose`; repeatable `-i/--ignore`. Warning below about implementation. [Types][types] |
| `ags inspect -i my-shell` | Opens existing instance's GTK inspector; `-i/--instance` default `ags`. [Inspect][inspect] |
| `ags request -i my-shell ping` | Arbitrary argument array; `-i/--instance` default `ags`. [Request][request] |
| `ags toggle -i my-shell bar`, `ags quit -i my-shell` | Toggle requires one window name; quit takes no positional args. [Toggle][toggle] [Quit][quit] |

Auto GTK detection scans **only the entry file** for versioned Gtk or `ags/gtk3/app` / `ags/gtk4/app` imports; pass `--gtk 4` when inference cannot see imports through an intermediary. Without a positional entry, `run` searches `$XDG_CONFIG_HOME/ags` (usual `~/.config/ags`) for `app.js`, `.ts`, `.jsx`, `.tsx` in that order. [Run][run] [Bundle][bundle] [Root][root]

## GI types, version traps and distribution

- `ags types` invokes `npx -y @ts-for-gir/cli generate`, writes `@girs`, searches system GIR directories and `EXTRA_GIR_DIRS`, and uses `--ignoreVersionConflicts`. Declarations do not install GI runtime libraries/typelibs. [Types][types] [Install][install]
- `ags types -u -d <project>` updates tsconfig and replaces linked `node_modules/ags` and `gnim`; it is not just a harmless declaration refresh. In v3.1.2, `--ignore` is registered but the `ignoreModules` values are **not passed to the generator** in `genTypes`: do not rely on the source's `--ignore` example to filter versions. [Types][types]
- Match `jsxImportSource`, app import, Gtk/Gdk GI versions, Astal 4.0, and generated declarations. The CLI preserves an existing `jsxImportSource` even when `--gtk` differs; regenerate/fix stale project settings after upgrades rather than papering over type errors. [Tsconfig implementation][tsconfig-code] [GTK4 exports][gtk4]
- Astal system integrations are separately installed GI libraries, not v1 built-in Services. Missing `gi://AstalBattery`, etc. requires the appropriate library, not copying v1 `Service.import` patterns. [Migration][migration] [Install][install]
- `bundle` creates an executable **shell wrapper around bundled JavaScript**, not a static native binary: it decodes JS to a runtime temp file and invokes configured GJS with GTK4 layer-shell preload. GI imports remain external. The target needs the matching GJS/GTK/Astal/layer-shell and any other imported native libraries; build-time absolute paths in the wrapper affect portability. [Bundle][bundle] [Bundler][esbuild]
- Production application packaging may need a custom `Gtk.Application`/`Adw.Application` rather than singleton `app` and its `io.Astal` namespace. The official app guide recommends this for distribution; a bundle alone does not provide desktop metadata or native dependencies. [App/CLI docs][app-doc]

## Remaining uncertainties

No local GUI execution, package-install completion, or generated-GI type-check was performed here. Bundling of the first TSX example was verified separately as noted in provenance; the other snippets remain source-reviewed examples. The parent's extracted-package CLI help corroborates the listed principal flags, but its `--version` mismatch (3.1.0 versus package 3.1.2-1) remains unresolved. Native layer-shell/compositor compatibility and additional enum/controller APIs need verification against the installed Astal/GTK versions. Gnim behavior is described only where AGS's pinned documentation/examples or implementation support it; no unpinned Gnim implementation is treated as the installed version.

## Primary-source links (all AGS source pinned to v3.1.2)

[release]: https://api.github.com/repos/Aylur/ags/releases/latest
[tag]: https://api.github.com/repos/Aylur/ags/git/ref/tags/v3.1.2
[main]: https://api.github.com/repos/Aylur/ags/commits/main
[migration]: https://github.com/Aylur/ags/blob/bbee2f18939f1ec7ff720e717cf305e73635628f/docs/guide/migration-guide.md
[quick]: https://aylur.github.io/ags/guide/quick-start.html
[package]: https://github.com/Aylur/ags/blob/bbee2f18939f1ec7ff720e717cf305e73635628f/package.json
[lock]: https://github.com/Aylur/ags/blob/bbee2f18939f1ec7ff720e717cf305e73635628f/package-lock.json
[index]: https://github.com/Aylur/ags/blob/bbee2f18939f1ec7ff720e717cf305e73635628f/lib/index.ts
[gtk4]: https://github.com/Aylur/ags/blob/bbee2f18939f1ec7ff720e717cf305e73635628f/lib/gtk4/index.ts
[app]: https://github.com/Aylur/ags/blob/bbee2f18939f1ec7ff720e717cf305e73635628f/lib/gtk4/app.ts
[app-doc]: https://aylur.github.io/ags/guide/app-cli.html
[widgets]: https://github.com/Aylur/ags/blob/bbee2f18939f1ec7ff720e717cf305e73635628f/docs/guide/first-widgets.md
[intrinsics]: https://aylur.github.io/ags/guide/intrinsics.html
[install]: https://aylur.github.io/ags/guide/install.html
[theming]: https://aylur.github.io/ags/guide/theming.html
[utilities]: https://aylur.github.io/ags/guide/utilities.html
[meson]: https://github.com/Aylur/ags/blob/bbee2f18939f1ec7ff720e717cf305e73635628f/meson.build
[tsconfig]: https://github.com/Aylur/ags/blob/bbee2f18939f1ec7ff720e717cf305e73635628f/cli/data/tsconfig.json
[tsconfig-code]: https://github.com/Aylur/ags/blob/bbee2f18939f1ec7ff720e717cf305e73635628f/cli/lib/tsconfig.go
[bar-template]: https://github.com/Aylur/ags/blob/bbee2f18939f1ec7ff720e717cf305e73635628f/cli/data/gtk4/Bar.tsx
[app-template]: https://github.com/Aylur/ags/blob/bbee2f18939f1ec7ff720e717cf305e73635628f/cli/data/gtk4/app.ts
[example-app]: https://github.com/Aylur/ags/blob/bbee2f18939f1ec7ff720e717cf305e73635628f/examples/gtk4/simple-bar/app.tsx
[example-bar]: https://github.com/Aylur/ags/blob/bbee2f18939f1ec7ff720e717cf305e73635628f/examples/gtk4/simple-bar/Bar.tsx
[time]: https://github.com/Aylur/ags/blob/bbee2f18939f1ec7ff720e717cf305e73635628f/lib/time.ts
[file]: https://github.com/Aylur/ags/blob/bbee2f18939f1ec7ff720e717cf305e73635628f/lib/file.ts
[root]: https://github.com/Aylur/ags/blob/bbee2f18939f1ec7ff720e717cf305e73635628f/cli/cmd/root.go
[run]: https://github.com/Aylur/ags/blob/bbee2f18939f1ec7ff720e717cf305e73635628f/cli/cmd/run.go
[init]: https://github.com/Aylur/ags/blob/bbee2f18939f1ec7ff720e717cf305e73635628f/cli/cmd/init.go
[bundle]: https://github.com/Aylur/ags/blob/bbee2f18939f1ec7ff720e717cf305e73635628f/cli/cmd/bundle.go
[types]: https://github.com/Aylur/ags/blob/bbee2f18939f1ec7ff720e717cf305e73635628f/cli/cmd/types.go
[inspect]: https://github.com/Aylur/ags/blob/bbee2f18939f1ec7ff720e717cf305e73635628f/cli/cmd/inspect.go
[request]: https://github.com/Aylur/ags/blob/bbee2f18939f1ec7ff720e717cf305e73635628f/cli/cmd/request.go
[toggle]: https://github.com/Aylur/ags/blob/bbee2f18939f1ec7ff720e717cf305e73635628f/cli/cmd/toggle.go
[quit]: https://github.com/Aylur/ags/blob/bbee2f18939f1ec7ff720e717cf305e73635628f/cli/cmd/quit.go
[esbuild]: https://github.com/Aylur/ags/blob/bbee2f18939f1ec7ff720e717cf305e73635628f/cli/lib/esbuild.go
