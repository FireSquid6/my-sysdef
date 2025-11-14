import { type Module, type ProviderGenerator, type Provider, dryShell, defaultShell, type ModuleGenerator, VariableStore, type VariablesGenerator, errorOut } from "./sysdef";
import path from "path";
import fs from "fs";

const validExtensions = new Set([".ts", ".tsx", ".js", ".jsx"]);

export async function loadModules(rootDir: string, dryRun: boolean, modulesList: string[]): Promise<Module[]> {
  const modules: Module[] = [];
  const modulesDirectory = path.join(rootDir, "modules");
  console.log(`\nLOADING MODULES FROM ${modulesDirectory}`);
  const toLoad = new Set(modulesList);

  if (!fs.existsSync(modulesDirectory)) {
    errorOut(`No modules directory in ${rootDir}`);
  }

  const shell = dryRun ? dryShell : defaultShell;

  for (const fp of fs.readdirSync(modulesDirectory)) {
    const filepath = path.join(modulesDirectory, fp);
    const extension = path.extname(filepath);
    const basename = path.basename(filepath).split(".")[0]!;
    if (!validExtensions.has(extension)) {
      console.log(`Skipping ${fp}, not a valid extension`);
      continue;
    }
    if (!toLoad.has(basename)) {
      console.log(`Skipping ${basename}, not loaded in config`);
      continue;
    }

    try {
      const mod = await import(filepath); 

      const generator: ModuleGenerator = mod.default as ModuleGenerator;
      const m = generator(shell);

      modules.push(m);
    } catch (e) {
      console.log(`Error loading ${fp}:`);
      console.log(e);
      process.exit(1);
    }
  }

  return modules;

}

export async function loadProviders(rootDir: string, dryRun: boolean, providersList: string[]): Promise<Provider[]> {
  const providers: Provider[] = [];
  const providersDirectory = path.join(rootDir, "providers");
  console.log(`\nLOADING PROVIDERS FROM ${providersDirectory}`);
  const toLoad = new Set(providersList);

  const shell = dryRun ? dryShell : defaultShell;

  if (!fs.existsSync(providersDirectory)) {
    errorOut(`No providers directory in ${rootDir}`);
  }

  for (const fp of fs.readdirSync(providersDirectory)) {
    const filepath = path.join(providersDirectory, fp);
    const extension = path.extname(filepath);
    const basename = path.basename(filepath).split(".")[0]!;
    if (!validExtensions.has(extension)) {
      console.log(`Skipping ${fp}, not a valid extension`);
      continue;
    }
    if (!toLoad.has(basename)) {
      console.log(`Skipping ${basename}, not loaded in config`);
      continue;
    }

    try {
      const mod = await import(filepath); 

      const generator: ProviderGenerator = mod.default as ProviderGenerator;
      const provider = generator(shell);

      console.log(`Loaded ${fp}`);
      providers.push(provider);
    } catch (e) {
      console.log(`Error loading ${fp}:`);
      console.log(e);
      process.exit(1);
    }
  }

  return providers;
}

export async function loadVariables(rootDir: string): Promise<VariableStore> {
  const variablesFile = path.join(rootDir, "variables");
  const store = new VariableStore();
  for (const ext of validExtensions) {
    const filepath = `${variablesFile}${ext}`;
    if (!fs.existsSync(filepath)) {
      continue;
    }

    console.log(`Loading ${filepath}`);
    try {
      const mod = await import(filepath); 
      const variablesGenerator = mod.default as VariablesGenerator;
      const variables = variablesGenerator();

      store.insertAll(variables);
    } catch (e) {
      console.log(`Error loading ${filepath}:`);
      console.log(e);
      process.exit(1);
    }
  }

  return store;

}
