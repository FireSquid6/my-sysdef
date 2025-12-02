import { defaultShell, type PackageInfo, type ProviderGenerator, type Shell } from "../sysdef-src/sysdef";
import { partitionArray, stringifyPackageParition } from "../sysdef-src/prompt";

// AUR provider - installs packages from the Arch User Repository
const MAX_AT_ONCE = 5;

// we use the default shell when getting the list of all installed packages since
// we want that to happen even in a dry run
const realShell = defaultShell

const provider: ProviderGenerator = (run: Shell) => {
  return {
    name: "aur",
    async checkInstallation() {
      const result = await run(`which pacman`, {
        throwOnError: true
      });
      if (result.code !== 0) {
        throw new Error("pacman is not installed or not in PATH");
      }
    },
    async install(packages: PackageInfo[]) {
      // TODO: Implement AUR package installation
      const partitions = partitionArray(packages, MAX_AT_ONCE);

      for (const part of partitions) {
        const string = stringifyPackageParition(part);
        console.log(`Installing ${string}`);
        const result = await run(`pacman -S --noconfirm ${string}`, {
          displayOutput: true,
          asRoot: true,
        });
        if (result.code !== 0) {
          console.log(`Error installing packages: ${part}. See the logs above`);
        }
      }
    },

    async uninstall(packages: string[]) {
      const partitions = partitionArray(packages, MAX_AT_ONCE);

      for (const part of partitions) {
        const string = part.join(" ");
        console.log(`Uninstalling ${string}`);
        const result = await run(`pacman -Rs --noconfirm ${string}`, {
          displayOutput: true,
          asRoot: true,
        });

        if (result.code !== 0) {
          console.log(`Error uninstalling packages: ${part}. See the logs above`);
        }
      }
    },

    async getInstalled() {
      // Get foreign/AUR packages
      const result = await realShell(`pacman -Qm`, {});
      const lines = result.stdout.trim().split('\n').filter(line => line.trim());

      return lines.map(line => {
        const match = line.match(/^(\S+)\s+(.+)$/);
        if (!match || !match[1] || !match[2]) {
          throw new Error(`Failed to parse pacman package line: ${line}`);
        }

        return {
          name: match[1],
          provider: "aur",
          version: match[2],
        };
      });
    },

    async update(packages: string[]) {
      // TODO: Implement AUR package update
      const partitions = partitionArray(packages, MAX_AT_ONCE);

      for (const part of partitions) {
        const string = part.join(" ");
        console.log(`Updating ${string}`);
        const result = await run(`pacman -Syu --noconfirm ${string}`, {
          displayOutput: true,
          asRoot: true,
        });

        if (result.code !== 0) {
          console.log(`Error updating packages: ${part}. See the logs above`);
        }
      }
    },
  };
};

export default provider;
