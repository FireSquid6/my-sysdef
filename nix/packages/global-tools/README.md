# Global tools outside nixpkgs

Import with `import ./nix/packages/global-tools { inherit pkgs; }`. This directory
is deliberately independent of the flake and does not install anything during
activation.

## md-to-pdf 5.2.5

`md-to-pdf/default.nix` packages the hash-pinned npm release tarball, including
upstream's compiled `dist/` sources. Its committed npm lock file pins the complete
production dependency graph. The manifest is the release's `package.json` with
`devDependencies` and `scripts` removed: the published JavaScript needs no rebuild,
and lifecycle hooks must not download a browser. Both CLI aliases are wrapped to
use `pkgs.chromium`, not Puppeteer's downloaded Chrome. Normal Chromium sandboxing
is retained; only the sandboxed Nix smoke test passes `--no-sandbox`.

To reproduce against the supplied nixpkgs snapshot:

```sh
nix-build --no-out-link --expr '
  let pkgs = import /nix/store/yxkqzvl5bf7knrh55lbl5xjxksq6ydmp-source {};
  in (import ./nix/packages/global-tools { inherit pkgs; }).md-to-pdf
'
nix-build --no-out-link --expr '
  let pkgs = import /nix/store/yxkqzvl5bf7knrh55lbl5xjxksq6ydmp-source {};
  in (import ./nix/packages/global-tools { inherit pkgs; }).md-to-pdf.tests.render
'
```

For updates, fetch the new release manifest, remove its development dependencies
and lifecycle scripts, and regenerate `package-lock.json` with
`npm install --package-lock-only --ignore-scripts`. Compute `npmDepsHash` using
nixpkgs' `prefetch-npm-deps package-lock.json`; compute the source hash using
`nix store prefetch-file --json URL`. Run the rendering test, not just `--help`.

## browser-use 0.13.8 — blocked, NOT packaged

No `browser-use` attribute is exported. This is an incomplete migration, not a
runtime `uv tool install` wrapper or a Python package with dependencies omitted.
The installed uv tool must remain until a complete replacement is verified.

Inspected upstream's actual tagged metadata:
<https://github.com/browser-use/browser-use/blob/0.13.8/pyproject.toml>
and <https://github.com/browser-use/browser-use/blob/0.13.8/browser_use/cli.py>.
The CLI extra is empty; normal dependencies are **not** optional. In particular,
the CLI delegates to `browser-harness==0.1.9`, which itself requires
`cdp-use==1.4.5`, `fetch-use==0.4.0`, `pillow==12.3.0`, and `websockets==15.0.1`.

Concrete packaging gaps in the supplied nixpkgs snapshot:

- Neither top-level tool exists in nixpkgs.
- `python3Packages` lacks `browser-use`, `browser-harness`, `fetch-use`, `cdp-use`,
  `bubus`, `browser-use-sdk`, and `uuid7`.
- Numerous upstream dependencies are exact pins incompatible with this snapshot.
  Examples (required vs available): aiohttp 3.14.3 vs 3.14.5; Pillow 12.3.0 vs
  13.0.0; OpenAI 2.16.0 vs 3.14.1; Anthropic 0.76.0 vs 2.3.0; Pydantic 2.12.5
  vs 2.13.4. Blindly relaxing these requirements, especially major SDK versions,
  would not constitute a verified package.
- Upstream's `browser-use install` invokes `uvx playwright install chromium`.
  That is not an acceptable activation step. The harness uses CDP and discovers
  a running browser via DevToolsActivePort or explicit `BU_CDP_WS`/`BU_CDP_URL`;
  merely adding Chromium to PATH does not verify browser operation.

Completing this requires packaging and locking the missing Python closure
(possibly with a separately pinned uv2nix workspace), resolving the exact pins,
and testing both CLI import/startup and a local Nix Chromium CDP session without
install-time downloads. None of those browser-use build/runtime claims have been
verified here. This is an implementation-scope blocker, not a claim that upstream
cannot be packaged with Nix.

## Verification performed

Against `/nix/store/yxkqzvl5bf7knrh55lbl5xjxksq6ydmp-source`:

- Package build passed:
  `/nix/store/v5s8qya9vygilyi0bqkz0dqb2pwyz3j4-md-to-pdf-5.2.5`.
- `md-to-pdf --version` returned `5.2.5`; `md2pdf --help` passed.
- `tests.render` passed with Nix `sandbox = true` (no network), including PDF
  generation and text extraction:
  `/nix/store/lgppwaaqrscp1flxl33sgvylgskr2z87-md-to-pdf-render-test`.
  The test supplies DejaVu fonts explicitly because the build sandbox has no
  host fonts. An initial test without fonts produced a PDF with no extractable
  text; adding the test font configuration made the content assertion pass.
- Wrapper inspection confirmed the executable is nixpkgs Chromium
  `157.0.8103.50`, with `PUPPETEER_SKIP_DOWNLOAD=true`.
- Source hash and npm dependency hash were verified by the successful Nix build;
  no placeholder hashes remain.
- browser-use was investigated only; **no browser-use build or runtime test
  passed or was claimed**.
