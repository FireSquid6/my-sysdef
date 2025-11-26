import { defaultShell, type PackageInfo, type ProviderGenerator, type Shell } from "../sysdef-src/sysdef";
import { partitionArray, stringifyPackageParition } from "../sysdef-src/prompt";

// yay provider - installs packages from AUR and official repos globally
const MAX_AT_ONCE = 5;

// we use the default shell when getting the list of all installed packages since
// we want that to happen even in a dry run
const realShell = defaultShell

const provider: ProviderGenerator = (run: Shell) => {
  return {
    name: "yay",
    async checkInstallation() {
      const result = await run(`which yay`, {
        throwOnError: true
      });
      if (result.code !== 0) {
        throw new Error("yay is not installed or not in PATH");
      }
    },
    async install(packages: PackageInfo[]) {
      const partitions = partitionArray(packages, MAX_AT_ONCE);

      for (const part of partitions) {
        const string = stringifyPackageParition(part);
        console.log(`Installing ${string}`);
        const result = await run(`yay -S --noconfirm ${string}`, {
          displayOutput: true,
        });
        if (result.code !== 0) {
          console.log(`Erorr installing packages: ${part}. See the logs above`);
        }
      }
    },

    async uninstall(packages: string[]) {
      const partitions = partitionArray(packages, MAX_AT_ONCE);

      for (const part of partitions) {
        const string = part.join(" ");
        console.log(`Uninstalling ${string}`);
        const result = await run(`yay -Rs --noconfirm ${string}`, {
          displayOutput: true,
        });

        if (result.code !== 0) {
          console.log(`Erorr uninstalling packages: ${part}. See the logs above`);
        }
      }
    },

    async getInstalled() {
      const result = await realShell(`yay -Qe`, {});
      const lines = result.stdout.trim().split('\n').filter(line => line.trim());
      
      return lines.map(line => {
        const match = line.match(/^(\S+)\s+(.+)$/);
        if (!match || !match[1] || !match[2]) {
          throw new Error(`Failed to parse yay package line: ${line}`);
        }

        
        return {
          name: match[1],
          provider: "yay",
          version: match[2],
        };
      });
    },

    async update(packages: string[]) {
      const partitions = partitionArray(packages, MAX_AT_ONCE);

      for (const part of partitions) {
        const string = part.join(" ");
        console.log(`Uninstalling ${string}`);
        const result = await run(`yay -Syu --noconfirm ${string}`, {});

        if (result.code !== 0) {
          console.log(`Erorr updating packages: ${part}. See the logs below`);
          console.log(result.stdout);
        }
      }
    },
  };
};

export default provider;
