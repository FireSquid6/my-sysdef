import path from "path";
import type { Filesystem } from "./connections";
import type { Lockfile } from "./lockfile";
import { PackageSet } from "./package-set";

export function errorOut(error: string): never {
  console.log(`Fatal error: ${error}`);
  process.exit(1);

}

// used to store and fill in variables
export class VariableStore {
  private map: Map<string, string> = new Map();

  // gets a variable and throws an error if it doesn't exist
  get(k: string): string {
    const v = this.map.get(k);
    if (!v) {
      throw new Error(`Error getting variable: "${k}". It wasn't set anywhere.`);
    }
    return v;
  }
  set(k: string, v: string): void {
    this.map.set(k, v);
  }
  has(k: string): boolean {
    return this.map.has(k);
  }
  getSafe(k: string): string | undefined {
    return this.map.get(k);
  }
  fillIn(s: string) {
    let substr = "";
    let insideBracket = false;
    let newString = "";

    for (let i = 0; i < s.length; i++) {
      if (s[i] === "{") {
        if (insideBracket) {
          newString += "{" + substr;
        }
        substr = "";
        insideBracket = true;
      } else if (s[i] === "}") {
        const v = this.map.get(substr);
        if (insideBracket && v !== undefined) {
          newString += v;
        } else if (insideBracket) {
          newString += "{" + substr + "}";
        } else {
          newString += "}";
        }
        insideBracket = false;
        substr = "";
      } else if (insideBracket) {
        substr += s[i];
      } else {
        newString += s[i];
      }
    }

    if (insideBracket) {
      newString += "{" + substr;
    }

    return newString;
  }

  insertAll(r: Record<string, string>) {
    for (const [k, v] of Object.entries(r)) {
      this.map.set(k, v);
    }
  }

  // creates a new variable store including all of the ones already present
  // plus some ones from a new record
  branchOff(r: Record<string, string>): VariableStore {
    const store = new VariableStore();
    for (const k of this.map.keys()) {
      store.set(k, this.map.get(k)!);
    }

    store.insertAll(r);
    return store;
  }
}

export const ANY_VERSION_STRING = "_*_";

export interface PackageInfo {
  name: string;
  version: string;
  provider: string;
}

export interface ShellResult {
  code: number;
  text: string;
}

export type Shell = (s: string, noThrow?: boolean) => Promise<ShellResult>

export const defaultShell: Shell = async (s, noThrow) => {
  if (noThrow === undefined) {
    noThrow = false;
  }

  const p = Bun.spawn({
    cmd: s.split(" "),
    stdout: "pipe",
    stderr: "inherit",
    stdin: "ignore",
  });


  let output = "";
  const decoder = new TextDecoder("utf-8");
  for await (const chunk of p.stdout) {
    const decoded = decoder.decode(chunk);
    output += decoded
  }

  const code = await p.exited;

  if (code !== 0 && !noThrow) {
    throw new Error(`Process called with ${s} returned exit code ${code}`);
  }

  return {
    code,
    text: output,
  }
}

export const dryShell: Shell = async (s) => {
  console.log(`Would run: $ ${s}`);

  return {
    code: 0,
    text: "",
  }
}

export interface Provider {
  readonly name: string;
  // we have to do it with a specific version and name
  install: (packages: PackageInfo[]) => Promise<void>;
  uninstall: (packages: string[]) => Promise<void>;
  getInstalled: () => Promise<PackageInfo[]>;
  update: (packages: string[]) => Promise<void>;
  checkInstallation?: () => Promise<void>;
}


// when just a string, the file treats it as a filepath in the `dotfiles` directory. Otherwise,
// the function that generates a string is treated as something that will return what should be 
// the contents of the file. You can use the variable store in this case. 
//
// It's a difference between a symlink and a generated file.
export type File = string | ((v: VariableStore) => string);


export interface Module {
  readonly name: string;
  readonly variables: Record<string, string>;

  readonly packages: Record<string, string[]>;
  readonly directories: Record<string, string>;
  readonly files: Record<string, File>;

  readonly onEverySync?: (s: Shell) => Promise<void>;
}

export type ProviderGenerator = (run: Shell) => Provider;
export type ModuleGenerator = (run: Shell) => Module;
export type VariablesGenerator = () => Record<string, string>;


export function getPackageList(modules: Module[], lockfile: Lockfile): PackageInfo[] {
  const allPackages: PackageInfo[] = [];

  // how we ensure we don't do two contradicting versions
  // note that the first string is <provider>:<package>;
  const seenVersions: Map<string, { module: string, version: string }> = new Map();

  for (const mod of modules) {
    for (const [provider, packages] of Object.entries(mod.packages)) {

      const packageInfos: PackageInfo[] = packages.map(p => {
        const split = p.split(":");

        if (split.length === 1) {
          const name = split[0]!;
          const version = lockfile.getVersion(provider, name) ?? ANY_VERSION_STRING;
          return {
            name,
            version,
            provider,
          }
        } else {
          const name = split[0]!;
          split.shift();
          const version = split.join(":");

          return {
            name,
            version,
            provider,

          }
        }
      });

      for (const p of packageInfos) {
        const k = `${p.provider}:${p.name}`;
        if (seenVersions.has(k)) {
          const seen = seenVersions.get(k)!;
          if (versionMatches(seen.version, p.version)) {
            errorOut(`Requested two different versions for package ${p.name}: ${seen.version} in ${seen.module} and ${p.version} in ${mod.name}`);
          }
        } else {
          seenVersions.set(k, {
            version: p.version,
            module: mod.name,
          });
        }

        allPackages.push(p);
      }
    }
  }

  return allPackages;
}

function versionMatches(v1: string, v2: string) {
  if (v1 === ANY_VERSION_STRING || v2 === ANY_VERSION_STRING) {
    return true;
  }

  return v1 === v2;

}

export async function syncPackages(allPackages: Map<string, PackageInfo[]>, providers: Provider[], noRemove: boolean) {
  for (const provider of providers) {
    const packages = allPackages.get(provider.name) ?? [];
    const toInstall: PackageInfo[] = [];
    const noChange: PackageInfo[] = [];
    const toUninstall: PackageInfo[] = [];

    const alreadyInstalledInfos = await provider.getInstalled();
    const installedSet = new PackageSet();
    const requestedSet = new PackageSet();

    installedSet.addList(alreadyInstalledInfos);
    requestedSet.addList(packages);

    for (const p of packages) {
      if (installedSet.has(p)) {
        noChange.push(p);
      } else if (p.version === ANY_VERSION_STRING && installedSet.hasAnyVersion(p)) {
        noChange.push(p);
      } else {
        toInstall.push(p);
      }
    }

    for (const p of alreadyInstalledInfos) {
      if (!requestedSet.hasAnyVersion(p)) {
        toUninstall.push(p);
      }
    }

    console.log(`  MANAGING PACKGES FOR: ${provider.name}`);
    for (const p of alreadyInstalledInfos) {
      console.log(`    OK: ${p.name}:${p.version}`);
    }
    for (const p of toInstall) {
      console.log(`    INSTALLING: ${p.name}:${p.version}`);
    }
    if (!noRemove) {
      for (const p of toUninstall) {
        console.log(`    REMOVING: ${p.name}:${p.version}`);
      }
    }

    await provider.install(toInstall);
    if (!noRemove) {
      await provider.uninstall(toUninstall.map(p => p.name));
    }
  }
}

export async function updateLockfile(providers: Provider[], lockfile: Lockfile) {
  for (const provider of providers) {
    const packages = await provider.getInstalled();
    for (const p of packages) {
      lockfile.setVersion(p.provider, p.name, p.version);
    }
  }
}


export async  function syncFiles(modules: Module[], baseStore: VariableStore, fs: Filesystem) {
  for (const mod of modules) {
    const store = baseStore.branchOff(mod.variables);

    for (const [fp, file] of Object.entries(mod.files)) {
      const destinationFilepath = store.fillIn(fp)
      if (typeof file === "string") {
        const s = path.resolve(path.join("./dotfiles", file));
        const sourceFilepath = store.fillIn(s);
        await fs.ensureSymlink(destinationFilepath, sourceFilepath);
        console.log(`Linked file: ${sourceFilepath} -> ${destinationFilepath}`);
      } else {
        const sourceContents = file(store);
        await fs.writeFile(destinationFilepath, sourceContents);
        console.log(`Generated: ${destinationFilepath}`);
      }
    }

    for (const [directoryPath, directory] of Object.entries(mod.directories)) {
      const destinationPath = store.fillIn(directoryPath);

      const s = path.resolve(path.join("./dotfiles", directory));
      const sourcePath = store.fillIn(s);
      await fs.ensureSymlink(destinationPath, sourcePath);
      console.log(`Linked directory: ${sourcePath} -> ${destinationPath}`);
    }
  }
}

export async function runEvents(modules: Module[]) {
  console.log("Events not created yet");
}

