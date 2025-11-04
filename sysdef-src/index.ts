import os from "os";
import path from "path";
import { loadModules, loadProviders, loadVariables } from "./loaders";
import { Lockfile } from "./lockfile";
import { dryFilesystem, normalFilesystem } from "./connections";
import { syncPackages, runEvents, updateLockfile, syncFiles, getPackageList, type PackageInfo, errorOut } from "./sysdef";
import { Command } from "@commander-js/extra-typings";

// defaults to $HOME/sysdef. You could change this if you'd like! 
function getRootDir() {
  return process.env.SYSDEF_ROOT_DIR ?? path.join(os.homedir(), "sysdef");
}


const cli = new Command()
  .name("sysdef")
  .description("The hackable computer configuration system")
  .action(async () => {
    cli.help();
  });


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

    const modules = await loadModules(rootDir, dryRun);
    const providers = await loadProviders(rootDir, dryRun);
    const store = await loadVariables(rootDir);

    for (const p of providers) {
      try {
        if (p.checkInstallation) { p.checkInstallation(); }
      } catch (e) {
        errorOut(`${p.name} failed when checking its own installation: ${(e as Error).message}`); 
      }
    }

    const lockfilePath = path.join(rootDir, "sysdef-lock.json");
    const lockfile = new Lockfile();
    lockfile.readFromFile(lockfilePath);

    const filesystem = options.dryRun ? dryFilesystem : normalFilesystem;

    console.log("\nSYNCING FILES:");
    await syncFiles(modules, store, filesystem);

    if (filesOnly) {
      return;
    }

    const list = getPackageList(modules, lockfile);
    const map: Map<string, PackageInfo[]> = new Map();

    for (const p of list) {
      if (!map.has(p.provider)) {
        map.set(p.provider, [p]);
      } else {
        const current = map.get(p.provider)!;
        current.push(p);
        map.set(p.provider, current);
      }
    }

    await syncPackages(map, providers, noRemove);

    console.log("\nRUNNING EVENTS:");
    await runEvents(modules);

    await updateLockfile(providers, lockfile);
    lockfile.serializeToFile(lockfilePath);
  });

cli.command("providers")
  .description("Subcommand to list all of the installed providers")
  .action(async () => {
    const rootDir = getRootDir();
    const providers = await loadProviders(rootDir, false);

    for (const p of providers) {
      try {
        if (p.checkInstallation) { p.checkInstallation(); }
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
    let providers = await loadProviders(rootDir, false);

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
