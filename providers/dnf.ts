import { ANY_VERSION_STRING, defaultShell, errorOut, type PackageInfo, type ProviderGenerator, type Shell } from "../sysdef-src/sysdef";

// dnf provider - installs packages from Fedora/RHEL repos globally.
// Like apt/pacman it reports the whole OS from getInstalled(); the managed-set
// model keeps removal safe (sysdef only removes what it installed).

// we use the default shell when getting the list of all installed packages since
// we want that to happen even in a dry run
const realShell = defaultShell;

const provider: ProviderGenerator = (run: Shell) => {
  return {
    name: "dnf",
    async checkInstallation() {
      const result = await run(`which dnf`, { throwOnError: true });
      if (result.code !== 0) {
        errorOut("dnf is not installed or not in PATH");
      }
    },
    async install(packages: PackageInfo[]) {
      if (packages.length === 0) return;
      // dnf version syntax is `name-version` (version may include the release)
      const specs = packages
        .map(p => (p.version === ANY_VERSION_STRING ? p.name : `${p.name}-${p.version}`))
        .join(" ");
      const result = await run(`dnf install -y ${specs}`, { throwOnError: true, asRoot: true });
      if (result.code !== 0) {
        errorOut(`Failed to install dnf packages: ${specs} (exit code ${result.code})`);
      }
    },

    async uninstall(packages: string[]) {
      if (packages.length === 0) return;
      const specs = packages.join(" ");
      const result = await run(`dnf remove -y ${specs}`, { throwOnError: true, asRoot: true });
      if (result.code !== 0) {
        errorOut(`Failed to uninstall dnf packages: ${specs} (exit code ${result.code})`);
      }
    },

    async getInstalled() {
      // array form: defaultShell splits string commands on spaces, which would
      // break the --qf format (it contains a space), so pass argv directly.
      const result = await realShell(["rpm", "-qa", "--qf", "%{NAME} %{VERSION}-%{RELEASE}\n"], { throwOnError: true });
      const lines = result.stdout.trim().split("\n").filter(line => line.trim());

      return lines.map(line => {
        const match = line.match(/^(\S+)\s+(\S+)$/);
        if (!match || !match[1] || !match[2]) {
          throw new Error(`Failed to parse rpm package line: ${line}`);
        }
        return {
          name: match[1],
          provider: "dnf",
          version: match[2],
        };
      });
    },

    async update(packages: string[]) {
      if (packages.length === 0) {
        const result = await run(`dnf upgrade -y`, { throwOnError: true, asRoot: true });
        if (result.code !== 0) {
          errorOut(`Failed to upgrade dnf packages (exit code ${result.code})`);
        }
        return;
      }
      for (const p of packages) {
        const result = await run(`dnf upgrade -y ${p}`, { throwOnError: true, asRoot: true });
        if (result.code !== 0) {
          errorOut(`Failed to update dnf package: ${p} (exit code ${result.code})`);
        }
      }
    },
  };
};

export default provider;
