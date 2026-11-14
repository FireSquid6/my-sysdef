#!/usr/bin/env bun
/** Read-only Arch/AUR vs Nix profile audit. See --help for scope and caveats. */
import { accessSync, constants, existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { homedir } from "node:os";

export function storePackageName(path: string): string | undefined {
  const name = basename(path).replace(/^[a-z0-9]{32}-/, "");
  // Nix output names conventionally start their version with a digit.
  return name.match(/^(.+?)-(?=\d)/)?.[1];
}

export function archBaseName(name: string): string {
  return name.replace(/-(?:git|bin|svn|hg)$/, "");
}

export function parseOwnedCommands(output: string): Map<string, Set<string>> {
  const commands = new Map<string, Set<string>>();
  for (const line of output.split("\n")) {
    const match = line.match(/^(\S+) \/(?:usr\/)?s?bin\/([^/]+)$/);
    if (!match) continue;
    const owners = commands.get(match[2]!) ?? new Set<string>();
    owners.add(match[1]!);
    commands.set(match[2]!, owners);
  }
  return commands;
}

type Match = {
  arch: string;
  version: string;
  source: string;
  commands: string[];
  nixStorePaths: string[];
  evidence: string[];
};

function run(command: string[]): string {
  const result = Bun.spawnSync(command, { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(`${command.join(" ")} failed:\n${result.stderr.toString()}`);
  return result.stdout.toString().trim();
}

export function main(args = process.argv.slice(2)) {
  if (args.includes("--help")) {
    console.log(`Usage: bun scripts/find-package-duplicates.ts [--json] [--profile PATH ...] [--include-dependencies]

Read-only audit; never uninstalls anything. Defaults to ~/.nix-profile and
/nix/var/nix/profiles/default when present. --profile replaces those defaults.

By default, reports only Arch packages (including foreign/AUR candidates)
owning commands also exposed by a selected Nix profile. Library/dependency-only
name matches are ignored. Libraries exposing matching utilities may still appear;
this is a command-overlap filter, not a perfect package-type classifier.

Use --include-dependencies to also include heuristic package-name matches in
Nix's full runtime closure (including libraries).

Foreign means absent from configured pacman sync databases, NOT proven AUR.
Name matches strip Arch -git/-bin/-svn/-hg suffixes and infer Nix names from
store output names. They are heuristic; renamed/versioned packages may be missed.
Closure-only matches can be shared libraries or internal dependencies, not
user-installed applications. Same command names can also be unrelated tools.
This does not scan other users, arbitrary nix-shell/dev-shell environments,
containers, Flatpak, or profiles you have not selected. Never use this output
as an automatic removal list: native services may still need native packages.`);
    return;
  }
  let json = false;
  let includeDependencies = false;
  const profiles: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--json") json = true;
    else if (args[i] === "--include-dependencies") includeDependencies = true;
    else if (args[i] === "--profile" && args[i + 1] && !args[i + 1]!.startsWith("--")) profiles.push(resolve(args[++i]!));
    else throw new Error(`Unknown or incomplete argument: ${args[i]}. Use --help.`);
  }
  for (const tool of ["pacman", "nix-store"]) {
    if (!Bun.which(tool)) throw new Error(`Required tool missing: ${tool}. Run on the Arch/Nix host with its tools in PATH.`);
  }
  if (!profiles.length) profiles.push(...[join(homedir(), ".nix-profile"), "/nix/var/nix/profiles/default"].filter(existsSync));
  if (!profiles.length) throw new Error("No Nix profiles found. Specify --profile PATH.");
  for (const profile of profiles) if (!existsSync(profile)) throw new Error(`Profile does not exist: ${profile}`);

  const installed = new Map(run(["pacman", "-Q"]).split("\n").map(line => {
    const [name, ...version] = line.split(" ");
    return [name!, version.join(" ")];
  }));
  // Compare with sync databases instead of pacman -Qm (which exits 1 for no matches).
  const native = new Set(run(["pacman", "-Slq"]).split("\n"));
  const owners = parseOwnedCommands(run(["pacman", "-Ql"]));
  const closure = new Map<string, Set<string>>();
  for (const path of includeDependencies ? run(["nix-store", "--query", "--requisites", ...profiles]).split("\n") : []) {
    const name = storePackageName(path);
    if (!name) continue;
    const paths = closure.get(name) ?? new Set<string>();
    paths.add(path);
    closure.set(name, paths);
  }
  const matches = new Map<string, Match>();
  function get(name: string): Match {
    let match = matches.get(name);
    if (!match) {
      match = { arch: name, version: installed.get(name)!, source: native.has(name) ? "repo" : "foreign (AUR/local candidate)", commands: [], nixStorePaths: [], evidence: [] };
      matches.set(name, match);
    }
    return match;
  }
  for (const name of installed.keys()) {
    const paths = closure.get(archBaseName(name));
    if (!paths) continue;
    const match = get(name);
    match.nixStorePaths.push(...paths);
    match.evidence.push("closure name match (heuristic)");
  }
  for (const profile of profiles) {
    const bin = join(profile, "bin");
    if (!existsSync(bin)) continue;
    for (const command of readdirSync(bin)) {
      const path = join(bin, command);
      // Skip broken links and non-executable data files.
      try {
        if (!statSync(path).isFile()) continue;
        accessSync(path, constants.X_OK);
      } catch { continue; }
      for (const owner of owners.get(command) ?? []) {
        const match = get(owner);
        match.commands.push(command);
        match.evidence.push("exposed command overlap");
        const target = realpathSync(path).match(/^\/nix\/store\/[^/]+/)?.[0];
        if (target) match.nixStorePaths.push(target);
      }
    }
  }
  const results = [...matches.values()].map(match => ({ ...match,
    commands: [...new Set(match.commands)].sort(),
    nixStorePaths: [...new Set(match.nixStorePaths)].sort(),
    evidence: [...new Set(match.evidence)],
  })).sort((a, b) => Number(b.commands.length > 0) - Number(a.commands.length > 0) || a.arch.localeCompare(b.arch));
  if (json) console.log(JSON.stringify({ profiles, includeDependencies, warning: "Evidence of overlap, not a safe-to-remove list. Name matching is heuristic; coverage is limited to selected profiles.", matches: results }, null, 2));
  else {
    console.log(`Profiles: ${profiles.join(", ")}\n`);
    for (const match of results) {
      console.log(`${match.arch} ${match.version} [${match.source}]`);
      console.log(`  ${match.commands.length ? `Commands: ${match.commands.join(", ")}` : "Closure name only — may just be a runtime dependency"}`);
      for (const path of match.nixStorePaths) console.log(`  ${path}`);
    }
    console.log(`\n${results.length} candidates. Read-only evidence, NOT a safe-to-remove list. See --help for matching limitations.`);
  }
}

if (import.meta.main) {
  try { main(); } catch (error) { console.error(String(error)); process.exitCode = 1; }
}
