import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

// Pi supplies extension imports at runtime. Typecheck against the same installed API
// instead of adding another full Pi installation to sysdef's runtime dependencies.
const root = path.resolve(import.meta.dir, "..");
const install = path.join(os.homedir(), ".pi/agent/install");
const current = path.join(install, "current-version");
const packageDir = process.env.PI_TEST_PACKAGE_DIR || (fs.existsSync(current)
  ? path.join(install, "releases", fs.readFileSync(current, "utf8").trim(), "node_modules/@earendil-works/pi-coding-agent")
  : "");
const declarations = path.join(packageDir, "dist/index.d.ts");
if (!fs.existsSync(declarations)) {
  console.error("Install Pi or set PI_TEST_PACKAGE_DIR to its package directory before typechecking branchfork.");
  process.exit(1);
}
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "branchfork-types-"));
try {
  const config = path.join(dir, "tsconfig.json");
  fs.writeFileSync(config, JSON.stringify({
    extends: path.join(root, "tsconfig.json"),
    compilerOptions: { paths: { "@earendil-works/pi-coding-agent": [declarations] } },
    include: [path.join(root, "pi/extensions/branchfork/**/*.ts")], exclude: [],
  }));
  const result = spawnSync(path.join(root, "node_modules/.bin/tsc"), ["-p", config], { stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
