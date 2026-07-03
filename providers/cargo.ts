import { ANY_VERSION_STRING, defaultShell, errorOut, type PackageInfo, type ProviderGenerator, type Shell } from "../sysdef-src/sysdef";

// cargo provider - installs Rust packages globally

// we use the default shell when getting the list of all installed packages since
// we want that to happen even in a dry run
const realShell = defaultShell;

const provider: ProviderGenerator = (run: Shell) => {
  return {
    name: "cargo",
    async checkInstallation() {
      const result = await run(`which cargo`, { throwOnError: true });
      if (result.code !== 0) {
        throw new Error("cargo is not installed or not in PATH");
      }
    },
    async install(packages: PackageInfo[]) {
      await Promise.all(packages.map(async p => {
        const version = p.version === ANY_VERSION_STRING
          ? ""
          : ` --version ${p.version}`;
        const result = await run(`cargo install ${p.name}${version}`, { throwOnError: true });
        if (result.code !== 0) {
          errorOut(`Failed to install cargo package: ${p.name}${version} (exit code ${result.code})`);
        }
      }));
    },

    async uninstall(packages: string[]) {
      await Promise.all(packages.map(async p => {
        const result = await run(`cargo uninstall ${p}`, { throwOnError: true });
        if (result.code !== 0) {
          errorOut(`Failed to uninstall cargo package: ${p} (exit code ${result.code})`);
        }
      }));
    },

    async getInstalled() {
      const result = await realShell(`cargo install --list`, {});
      const lines = result.stdout.trim().split('\n').filter(line => line.trim());
      const packages = [];
      
      for (const line of lines) {
        const match = line.match(/^(\S+)\s+v(.+):/);
        if (match && match[1] && match[2]) {
          packages.push({
            name: match[1],
            provider: "cargo",
            version: match[2],
          });
        } else if (match) {
          throw new Error(`Failed to parse cargo package line: ${line}`);
        }
      }
      
      return packages;
    },

    async update(packages: string[]) {
      const toUpdate = packages.length === 0
        ? (await this.getInstalled()).map(p => p.name)
        : packages;
      await Promise.all(toUpdate.map(async name => {
        const result = await run(`cargo install ${name}`, { throwOnError: true });
        if (result.code !== 0) {
          errorOut(`Failed to update cargo package: ${name} (exit code ${result.code})`);
        }
      }));
    },
  };
};

export default provider;
