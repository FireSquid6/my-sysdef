import os from "os";
import path from "path";
import fs from "fs";
import { loadModules, loadProviders, loadVariables } from "./loaders";
import { Lockfile } from "./lockfile";
import { dryFilesystem, normalFilesystem } from "./connections";
import { syncPackages, runEvents, updateLockfile, syncFiles, getPackageList, type PackageInfo, errorOut, defaultShell, dryShell } from "./sysdef";
import { Command } from "@commander-js/extra-typings";
import { readConfig } from "./configuration";

// defaults to $HOME/sysdef. You could change this if you'd like!
function getRootDir() {
  return process.env.SYSDEF_ROOT_DIR ?? path.join(os.homedir(), "sysdef");
}

// group a flat package list into a provider -> packages map
function toProviderMap(list: PackageInfo[]): Map<string, PackageInfo[]> {
  const map: Map<string, PackageInfo[]> = new Map();
  for (const p of list) {
    const current = map.get(p.provider);
    if (current) {
      current.push(p);
    } else {
      map.set(p.provider, [p]);
    }
  }
  return map;
}

// the set of packages sysdef currently manages (recorded in the lockfile), per
// provider. sysdef only removes packages in this set.
function managedSet(providers: { name: string }[], lockfile: Lockfile): Map<string, Set<string>> {
  const managed: Map<string, Set<string>> = new Map();
  for (const p of providers) {
    managed.set(p.name, new Set(lockfile.getPackages(p.name)));
  }
  return managed;
}


const cli = new Command()
  .name("sysdef")
  .description("The hackable computer configuration system")
  .action(async () => {
    cli.help();
  });



// path to the temporary SUDO_ASKPASS helper, kept so we can clean it up on exit
let askpassPath: string | null = null;

// read a line from stdin without echoing it to the terminal
function readPassword(promptText: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(promptText);

    // disable terminal echo while the password is typed (canonical mode stays
    // on, so backspace etc. still work; the terminal just doesn't print keys)
    Bun.spawnSync(["stty", "-echo"], { stdin: "inherit", stdout: "inherit", stderr: "inherit" });

    const decoder = new TextDecoder();
    let buf = "";
    const onData = (chunk: Buffer) => {
      buf += decoder.decode(chunk);
      const nl = buf.indexOf("\n");
      if (nl === -1) {
        return;
      }
      process.stdin.off("data", onData);
      process.stdin.pause();
      Bun.spawnSync(["stty", "echo"], { stdin: "inherit", stdout: "inherit", stderr: "inherit", env: process.env });
      process.stdout.write("\n");
      resolve(buf.slice(0, nl).replace(/\r$/, ""));
    };

    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

// remove the askpass helper, wipe the password from our environment, and drop
// any cached sudo timestamp
function cleanupCredentials() {
  if (askpassPath !== null) {
    try { fs.unlinkSync(askpassPath); } catch { /* best effort */ }
    askpassPath = null;
  }
  delete process.env.SYSDEF_SUDO_PASSWORD;
  delete process.env.SUDO_ASKPASS;
  Bun.spawnSync(["sudo", "-k"]);
}

async function getCredentials() {
  // already root: no sudo (and no password prompt) needed at all
  if (process.getuid !== undefined && process.getuid() === 0) {
    return;
  }

  console.log("Sysdef needs your credentials for commands that require root. These will only be used when necessary.");

  const password = await readPassword("[sudo] password: ");

  // write a helper that echoes the password from the environment. sudo -A runs
  // this to authenticate, so we prompt once and every later root command reuses
  // the same in-memory password instead of re-prompting.
  askpassPath = path.join(os.tmpdir(), `sysdef-askpass-${process.pid}-${Date.now()}.sh`);
  fs.writeFileSync(askpassPath, `#!/bin/sh\nprintf '%s\\n' "$SYSDEF_SUDO_PASSWORD"\n`, { mode: 0o700 });

  process.env.SUDO_ASKPASS = askpassPath;
  process.env.SYSDEF_SUDO_PASSWORD = password;

  // validate now so a wrong password fails fast rather than mid-install.
  // pass the live env so the just-set SUDO_ASKPASS/SYSDEF_SUDO_PASSWORD reach sudo
  const check = Bun.spawnSync(["sudo", "-A", "-v"], { env: process.env });
  if (check.exitCode !== 0) {
    cleanupCredentials();
    errorOut("Failed to obtain root credentials");
  }

  process.on("exit", cleanupCredentials);
}

const syncCommand = cli.command("sync")
  .description("Sync all packages, modules, and files")
  .option("-d, --dry-run", "do a dry-run and don't actually run any commands")
  .option("-s, --safe", "don't remove any packages, just install them")
  .option("-f, --files-only", "Only install files, don't bother with packages")
  .option("-h, --help", "See help for this command")
  .action(async (options) => {
    if (options.help) {
      syncCommand.help();
      return;
    }

    const rootDir = getRootDir();
    const dryRun = options.dryRun ?? false;
    const noRemove = options.safe ?? false;
    const filesOnly = options.filesOnly ?? false;
    const config = readConfig(rootDir);

    const modules = await loadModules(rootDir, dryRun, config.modules);
    const providers = await loadProviders(rootDir, dryRun, config.providers);
    const store = await loadVariables(rootDir, config.variables);

    for (const p of providers) {
      try {
        if (p.checkInstallation) { await p.checkInstallation(); }
      } catch (e) {
        errorOut(`${p.name} failed when checking its own installation: ${(e as Error).message}`);
      }
    }

    const lockfilePath = path.join(rootDir, "sysdef-lock.json");
    const lockfile = new Lockfile();
    lockfile.readFromFile(lockfilePath);

    const filesystem = options.dryRun ? dryFilesystem : normalFilesystem;

    console.log("\nSYNCING FILES:");
    await syncFiles(modules, store, filesystem, rootDir);

    if (filesOnly) {
      return;
    }

    if (!dryRun) {
      await getCredentials();
    }

    const list = getPackageList(modules, lockfile);
    const map = toProviderMap(list);

    // capture the previously-managed set BEFORE we rewrite the lockfile
    const managed = managedSet(providers, lockfile);
    await syncPackages(map, providers, noRemove, managed);

    console.log("\nRUNNING EVENTS:");
    await runEvents(modules, dryRun ? dryShell : defaultShell);

    if (!dryRun) {
      await updateLockfile(map, providers, lockfile);
      lockfile.serializeToFile(lockfilePath);
    }
  });

cli.command("update-lockfile")
  .description("Update the lockfile to the current system state")
  .action(async () => {
    const rootDir = getRootDir();
    const config = readConfig(rootDir);
    const modules = await loadModules(rootDir, false, config.modules);
    const providers = await loadProviders(rootDir, false, config.providers);
    const lockfile = new Lockfile();
    const lockfilePath = path.join(rootDir, "sysdef-lock.json");

    lockfile.readFromFile(lockfilePath);

    const map = toProviderMap(getPackageList(modules, lockfile));
    await updateLockfile(map, providers, lockfile);
    lockfile.serializeToFile(lockfilePath);
  });

cli.command("update")
  .description("Update managed packages to their newest versions")
  .argument("[provider]", "only update packages for this provider")
  .argument("[packages...]", "only update these packages (default: all)")
  .action(async (provider, packages) => {
    const rootDir = getRootDir();
    const config = readConfig(rootDir);
    const modules = await loadModules(rootDir, false, config.modules);
    let providers = await loadProviders(rootDir, false, config.providers);

    if (provider !== undefined && providers.find(p => p.name === provider) === undefined) {
      errorOut(`Provider ${provider} was not found.`);
    }
    if (provider) {
      providers = providers.filter(p => p.name === provider);
    }

    for (const p of providers) {
      try {
        if (p.checkInstallation) { await p.checkInstallation(); }
      } catch (e) {
        errorOut(`${p.name} failed when checking its own installation: ${(e as Error).message}`);
      }
    }

    await getCredentials();

    for (const p of providers) {
      console.log(`\nUPDATING PACKAGES FOR: ${p.name}`);
      await p.update(packages ?? []);
    }

    // refresh the lockfile so managed packages reflect their new versions
    const lockfilePath = path.join(rootDir, "sysdef-lock.json");
    const lockfile = new Lockfile();
    lockfile.readFromFile(lockfilePath);
    const map = toProviderMap(getPackageList(modules, lockfile));
    await updateLockfile(map, providers, lockfile);
    lockfile.serializeToFile(lockfilePath);
  });

cli.command("providers")
  .description("Subcommand to list all of the installed providers")
  .action(async () => {
    const rootDir = getRootDir();
    const config = readConfig(rootDir);
    const providers = await loadProviders(rootDir, false, config.providers);

    for (const p of providers) {
      try {
        if (p.checkInstallation) { await p.checkInstallation(); }
        console.log(`${p.name} is installed correctly`);
      } catch (e) {
        console.log(`${p.name} failed when checking its own installation: ${(e as Error).message}`);
      }
    }
  });

cli.command("list-installed")
  .description("list the installed packages from an optional provider")
  .argument("[provider]")
  .action(async (provider) => {
    const rootDir = getRootDir();
    const config = readConfig(rootDir);
    let providers = await loadProviders(rootDir, false, config.providers);

    if (provider !== undefined && providers.find(p => p.name === provider) === undefined) {
      errorOut(`Provider ${provider} was not found.`);
    }

    if (provider) {
      providers = providers.filter(p => p.name === provider);
    }
    for (const p of providers) {
      console.log(`Currently installed packages for ${p.name}:`);
      const packages = await p.getInstalled();
      for (const pkg of packages) {
        console.log(`  ${pkg.name}@${pkg.version}`);
      }
    }
  });

cli.command("hello")
  .action(() => {
    console.log("Hello, world!");
  });



export { cli }
