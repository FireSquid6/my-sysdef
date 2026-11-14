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

## browser-use 0.13.8

`browser-use/default.nix` builds an isolated Python 3.12 environment from
`pyproject.toml` and `uv.lock` using uv2nix. The complete required dependency graph,
including browser-harness 0.1.9 and packages absent from nixpkgs, comes from
hash-locked PyPI artifacts. Nixpkgs Python package versions are not substituted
or relaxed. The lock supports Linux Python 3.12/3.13; this derivation deliberately
selects 3.12. Binary wheels are preferred. The build-system wheel overlay provides
wheel installation and auto-patchelf hooks (including manylinux libraries).
No additional package-specific wheel overrides were needed on x86_64-linux.

The package takes an **explicit `inputs` argument** with `uv2nix`, `pyproject-nix`,
and `pyproject-build-systems`. The parent flake must pin/provide these inputs;
this package does not fetch another flake during normal evaluation. For standalone
reproduction, use the root flake, which supplies these inputs from the pinned
`firesquid6/hermes-agent` fork:

```sh
nix build --no-link .#browser-use
nix build --no-link .#checks.x86_64-linux.browser-use
```

Updating the `hermes` input also updates this shared Python build tooling; run
the browser-use smoke check when updating it.

The wrapper sets defaults for upstream's `CHROME_PATH` and `BH_CHROME_PATH` to
Nix Chromium. These settings are honored by browser-harness's browser probe; they
are not a promise that the CLI launches a browser automatically. This release's
CLI attaches to a running browser, either discovered locally or supplied using
`BU_CDP_URL` / `BU_CDP_WS`. Start Nix Chromium explicitly, for example:

```sh
chromium --remote-debugging-port=9222 --user-data-dir="$HOME/.local/share/browser-use-chromium"
BU_CDP_URL=http://127.0.0.1:9222 browser-use <<'PY'
ensure_real_tab()
print(page_info())
PY
```

Do not run `browser-use install` (upstream's Playwright network installer) or
`--update` (upstream's imperative updater). Neither is invoked by this package,
activation, or its smoke test. The package has no uv/uvx installer dependency.
Keep Chromium's sandbox enabled for ordinary use; only the isolated Nix smoke
test passes `--no-sandbox`.

`tests.smoke` imports `Agent`, `Browser`, the harness/CDP/fetch packages, exercises
Pillow's native code, validates installed required dependency version constraints
(with a test-only packaging parser), checks CLI help and versions, launches Nix Chromium headless
with an ephemeral profile/port, and evaluates JavaScript through the actual CLI
and harness daemon. The daemon/browser are stopped after testing. This passes in
the Nix network sandbox, using only loopback CDP and no external service.

Known limits: verified only on x86_64-linux / Python 3.12, not other architectures
or Python 3.13. No paid cloud browser or LLM integration was tested. Upstream
`browser-use --version` reports the delegated harness version **0.1.9**, while
Python distribution metadata correctly reports browser-use **0.13.8**; the test
asserts both. Native wheel installation succeeded with automatic patching; this
is not exhaustive functional testing of every dependency. Parent flake/lock and
system installation are intentionally outside this change.

For updates, change the exact browser-use requirement and run
`uv lock --python 3.12` from `browser-use/` with a compatible uv, review artifact
hashes and dependency changes, rebuild, and rerun `tests.smoke`. Never introduce
fake hashes or replace the lock with an activation-time resolver.

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
- browser-use package build passed:
  `/nix/store/hcl03a5m238msmr0rkb3sdwql3q1fc8p-browser-use-0.13.8`.
- browser-use isolated environment:
  `/nix/store/3szrwcblxig02i7azfg7i95l2n5h34hm-browser-use-0.13.8-env`.
- browser-use `tests.smoke` passed with `sandbox = true`, including local CDP
  evaluation returning `42`:
  `/nix/store/9q8s4jycz5w9vr62vbglcipynzl0rsns-browser-use-smoke`.
