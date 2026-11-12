#!/usr/bin/env bun
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
if (!fs.existsSync(path.join(root, "@girs/astal-4.0.d.ts"))) throw Error("Run bash ags/types.sh before checking AGS sources.");
const vendor = fs.realpathSync(path.join(root, "node_modules/ags"));
const config = ts.readConfigFile(path.join(root, "tsconfig.json"), ts.sys.readFile);
if (config.error) throw Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const program = ts.createProgram(parsed.fileNames, parsed.options);
const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
// AGS ships TypeScript source, not .d.ts. skipLibCheck cannot suppress its own
// optional-library imports and generated-GI overload errors. Report those
// separately; never suppress project diagnostics or unknown external errors.
const upstream = diagnostics.filter(d => d.file && path.resolve(d.file.fileName).startsWith(vendor + path.sep));
const ours = diagnostics.filter(d => !upstream.includes(d));
const host = { getCanonicalFileName: (name: string) => name, getCurrentDirectory: () => process.cwd(), getNewLine: () => "\n" };
if (upstream.length) {
  console.warn(`WARNING: ${upstream.length} installed AGS/Gnim source diagnostics remain outside this repository. Full tsc is NOT clean.`);
  if (process.argv.includes("--upstream")) console.warn(ts.formatDiagnostics(upstream, host));
  else console.warn("Use --upstream to print them, or run tsc -p ags/tsconfig.json for the unfiltered check.");
}
if (ours.length) console.error(ts.formatDiagnostics(ours, host));
else console.log("AGS project sources: 0 TypeScript diagnostics (using generated native GI types).");
process.exitCode = ours.length ? 1 : 0;
