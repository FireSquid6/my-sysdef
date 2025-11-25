import { ANY_VERSION_STRING, defaultShell, type PackageInfo, type ProviderGenerator, type Shell } from "../sysdef-src/sysdef";

// yay provider - installs packages from AUR and official repos globally
const MAX_AT_ONCE = 5;

function partitionArray<T>(packages: T[], partitionSize: number): T[][] {
  const partitions: T[][] = [];
  let currentPartition: T[] = [];

  for (const p of packages) {
    if (currentPartition.length >= partitionSize) {
      partitions.push(currentPartition);
      currentPartition = [];
    }
    currentPartition.push(p);
  }

  partitions.push(currentPartition);

  return partitions;
}

function stringifyPartition(packages: PackageInfo[]): string {
  return packages.map(p => {
    const version = p.version === ANY_VERSION_STRING ? "" : `=${p.version}`;
    return `${p.name}${version}`;
  })
    .join(" ");
}

// we use the default shell when getting the list of all installed packages since
// we want that to happen even in a dry run
const realShell = defaultShell

const provider: ProviderGenerator = (run: Shell) => {
  return {
    name: "yay",
    async checkInstallation() {
      const result = await run(`which yay`, true);
      if (result.code !== 0) {
        throw new Error("yay is not installed or not in PATH");
      }
    },
    async install(packages: PackageInfo[]) {
      const partitions = partitionArray(packages, MAX_AT_ONCE);

      for (const part of partitions) {
        const string = stringifyPartition(part);
        console.log(`Installing ${string}`);
        const result = await run(`yay -S --noconfirm ${string}`, true);
        if (result.code !== 0) {
          console.log(`Erorr installing packages: ${part}. See the logs below`);
          console.log(result.text);
        }
      }
    },

    async uninstall(packages: string[]) {
      const partitions = partitionArray(packages, MAX_AT_ONCE);

      for (const part of partitions) {
        const string = part.join(" ");
        console.log(`Uninstalling ${string}`);
        await run(`yay -Rs --noconfirm ${string}`);
      }
    },

    async getInstalled() {
      const result = await realShell(`yay -Qe`);
      const lines = result.text.trim().split('\n').filter(line => line.trim());
      
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
      if (packages.length === 0) {
        await run(`yay -Syu --noconfirm`);
      } else {
        await Promise.all(packages.map(p => run(`yay -S --noconfirm ${p}`)));
      }
    },
  };
};

export default provider;
