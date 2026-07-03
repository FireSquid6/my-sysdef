import { ANY_VERSION_STRING, defaultShell, errorOut, type PackageInfo, type ProviderGenerator, type Shell } from "../sysdef-src/sysdef";

// pipx provider - installs isolated Python CLI applications (isolated namespace)

// we use the default shell when getting the list of all installed packages since
// we want that to happen even in a dry run
const realShell = defaultShell;

const provider: ProviderGenerator = (run: Shell) => {
  return {
    name: "pipx",
    async checkInstallation() {
      const result = await run(`which pipx`, { throwOnError: true });
      if (result.code !== 0) {
        errorOut("pipx is not installed or not in PATH");
      }
    },
    async install(packages: PackageInfo[]) {
      // pipx installs one app (its own venv) per invocation. --force lets us
      // reinstall at a different version (plain `install` no-ops if present).
      for (const p of packages) {
        const spec = p.version === ANY_VERSION_STRING ? p.name : `${p.name}==${p.version}`;
        const result = await run(`pipx install --force ${spec}`, { throwOnError: true });
        if (result.code !== 0) {
          errorOut(`Failed to install pipx package: ${spec} (exit code ${result.code})`);
        }
      }
    },

    async uninstall(packages: string[]) {
      for (const p of packages) {
        const result = await run(`pipx uninstall ${p}`, { throwOnError: true });
        if (result.code !== 0) {
          errorOut(`Failed to uninstall pipx package: ${p} (exit code ${result.code})`);
        }
      }
    },

    async getInstalled() {
      const result = await realShell(`pipx list --json`, { throwOnError: true });
      let parsed: {
        venvs?: Record<string, { metadata?: { main_package?: { package?: string; package_version?: string } } }>;
      };
      try {
        parsed = JSON.parse(result.stdout);
      } catch {
        return [];
      }
      const venvs = parsed.venvs ?? {};
      return Object.values(venvs).flatMap(venv => {
        const mp = venv.metadata?.main_package;
        return mp && typeof mp.package === "string" && typeof mp.package_version === "string"
          ? [{ name: mp.package, provider: "pipx", version: mp.package_version }]
          : [];
      });
    },

    async update(packages: string[]) {
      for (const p of packages) {
        const result = await run(`pipx upgrade ${p}`, { throwOnError: true });
        if (result.code !== 0) {
          errorOut(`Failed to update pipx package: ${p} (exit code ${result.code})`);
        }
      }
    },
  };
};

export default provider;
