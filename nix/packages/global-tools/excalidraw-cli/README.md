# @tommywalkie/excalidraw-cli 0.5.0

This is **not** nixpkgs' unrelated `excalidraw-cli`. Import the
`tommy-excalidraw-cli` attribute from the enclosing directory; its executable is
still named `excalidraw-cli`.

The hash-pinned npm release includes compiled `lib/` and its Virgil/Cascadia
fonts. `package.json` is the published manifest with development dependencies
and lifecycle scripts removed, plus an explicit `tslib=2.8.1`: the published
JavaScript imports tslib directly, but upstream omits it from dependencies.
`package-lock.json` locks the complete production graph, including canvas 2.11.2.

Source inspection confirms this version uses **node-canvas/Cairo**, not
Puppeteer or a browser. Consequently it does not need Chromium or browser
download settings. General npm lifecycle scripts are disabled; the only enabled
rebuild is canvas, forced to compile from source against Nix Node 22 headers and
Cairo/Pango/JPEG/GIF/SVG libraries. No downloaded native prebuild is used. A
fallback fontconfig configuration is supplied by the executable wrapper; the
renderer also registers the fonts bundled with upstream.

Reproduce against the supplied nixpkgs snapshot:

```sh
nix-build --no-out-link --expr '
  let pkgs = import /nix/store/yxkqzvl5bf7knrh55lbl5xjxksq6ydmp-source {};
  in (import ./nix/packages/global-tools { inherit pkgs; }).tommy-excalidraw-cli
'
# For the offline rendering check, append .tests.render to the attribute above.
```

The test checks public `--help` and `--version`, then renders the included
Excalidraw sample to PNG. It decodes the PNG and verifies dimensions, a red
filled shape, and black content, rather than relying on the CLI exit code
(upstream can swallow rendering errors). Only Linux x86_64 has been verified.
This is upstream's experimental 2020 renderer, not the current Excalidraw web
renderer: support for modern scene fields/features and visual parity is not
claimed. Its old dependency graph includes deprecated packages; locking it does
not modernize that code or establish a security audit.

For updates, retrieve the release manifest, remove development dependencies and
scripts, preserve the explicit tslib fix if still needed, then run
`npm install --package-lock-only --ignore-scripts --no-audit --no-fund` in this
directory. Compute hashes using `nix store prefetch-file --json URL` and
nixpkgs' `prefetch-npm-deps package-lock.json`, and rerun the render test.
