import { ANY_VERSION_STRING, defaultShell, errorOut, type PackageInfo, type ProviderGenerator, type Shell } from "../sysdef-src/sysdef";

// npm provider - installs global npm packages (isolated namespace)

// we use the default shell when getting the list of all installed packages since
// we want that to happen even in a dry run
const realShell = defaultShell;

const provider: ProviderGenerator = (run: Shell) => {
  return {
    name: "npm",
    async checkInstallation() {
      const result = await run(`which npm`, { throwOnError: true });
      if (result.code !== 0) {
        errorOut("npm is not installed or not in PATH");
      }
    },
    async install(packages: PackageInfo[]) {
      if (packages.length === 0) return;
      // one command: concurrent global installs can corrupt the shared prefix
      const specs = packages
        .map(p => `${p.name}@${p.version === ANY_VERSION_STRING ? "latest" : p.version}`)
        .join(" ");
      const result = await run(`npm install -g ${specs}`, { throwOnError: true });
      if (result.code !== 0) {
        errorOut(`Failed to install npm packages: ${specs} (exit code ${result.code})`);
      }
    },

    async uninstall(packages: string[]) {
      if (packages.length === 0) return;
      const specs = packages.join(" ");
      const result = await run(`npm uninstall -g ${specs}`, { throwOnError: true });
      if (result.code !== 0) {
        errorOut(`Failed to uninstall npm packages: ${specs} (exit code ${result.code})`);
      }
    },

    async getInstalled() {
      // npm ls -g can exit non-zero on unrelated warnings; tolerate and parse JSON.
      const result = await realShell(`npm ls -g --json --depth=0`, { throwOnError: true });
      let parsed: { dependencies?: Record<string, { version?: string }> };
      try {
        parsed = JSON.parse(result.stdout);
      } catch {
        return [];
      }
      const deps = parsed.dependencies ?? {};
      return Object.entries(deps).flatMap(([name, info]) =>
        typeof info.version === "string"
          ? [{ name, provider: "npm", version: info.version }]
          : []
      );
    },

    async update(packages: string[]) {
      await Promise.all(packages.map(async p => {
        const result = await run(`npm install -g ${p}@latest`, { throwOnError: true });
        if (result.code !== 0) {
          errorOut(`Failed to update npm package: ${p} (exit code ${result.code})`);
        }
      }));
    },
  };
};

export default provider;
