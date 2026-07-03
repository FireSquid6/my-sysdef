import { defaultShell, errorOut, type PackageInfo, type ProviderGenerator, type Shell } from "../sysdef-src/sysdef";
import { partitionArray, stringifyPackageParition } from "../sysdef-src/prompt";

// apt provider - installs packages from official Ubuntu/Debian repos globally
const MAX_AT_ONCE = 10;

// we use the default shell when getting the list of all installed packages since
// we want that to happen even in a dry run
const realShell = defaultShell

const provider: ProviderGenerator = (run: Shell) => {
  return {
    name: "apt",
    async checkInstallation() {
      const result = await run(`which apt`, { throwOnError: true });
      if (result.code !== 0) {
        throw new Error("apt is not installed or not in PATH");
      }
    },
    async install(packages: PackageInfo[]) {
      const partitions = partitionArray(packages, MAX_AT_ONCE);

      for (const part of partitions) {
        const string = stringifyPackageParition(part);
        console.log(`Installing ${string}`);
        const result = await run(`apt install -y ${string}`, { throwOnError: true, asRoot: true });
        if (result.code !== 0) {
          console.log(result.stdout);
          errorOut(`Failed to install apt packages: ${string} (exit code ${result.code})`);
        }
      }
    },

    async uninstall(packages: string[]) {
      const partitions = partitionArray(packages, MAX_AT_ONCE);

      for (const part of partitions) {
        const string = part.join(" ");
        console.log(`Uninstalling ${string}`);
        const result = await run(`apt remove -y ${string}`, { throwOnError: true, asRoot: true });
        if (result.code !== 0) {
          console.log(result.stdout);
          errorOut(`Failed to uninstall apt packages: ${string} (exit code ${result.code})`);
        }
      }
    },

    async getInstalled() {
      const result = await realShell(`apt list --installed`, { throwOnError: true });
      const lines = result.stdout.trim().split('\n').filter(line => line.trim() && !line.startsWith('Listing...'));
      
      return lines.map(line => {
        const match = line.match(/^(\S+)\/\S+\s+(\S+)\s+/);
        if (!match || !match[1] || !match[2]) {
          throw new Error(`Failed to parse apt package line: ${line}`);
        }

        
        return {
          name: match[1],
          provider: "apt",
          version: match[2],
        };
      });
    },

    async update(packages: string[]) {
      if (packages.length === 0) {
        // defaultShell does not run through a shell, so `&&` can't be used --
        // run the two commands separately.
        const updated = await run(`apt update`, { throwOnError: true, asRoot: true });
        if (updated.code !== 0) {
          errorOut(`Failed to update apt package lists (exit code ${updated.code})`);
        }
        const upgraded = await run(`apt upgrade -y`, { throwOnError: true, asRoot: true });
        if (upgraded.code !== 0) {
          errorOut(`Failed to upgrade apt packages (exit code ${upgraded.code})`);
        }
      } else {
        await Promise.all(packages.map(async p => {
          const result = await run(`apt install -y ${p}`, { throwOnError: true, asRoot: true });
          if (result.code !== 0) {
            errorOut(`Failed to update apt package: ${p} (exit code ${result.code})`);
          }
        }));
      }
    },
  };
};

export default provider;
