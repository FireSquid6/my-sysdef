import { ANY_VERSION_STRING, defaultShell, errorOut, type PackageInfo, type ProviderGenerator, type Shell } from "../sysdef-src/sysdef";
import { partitionArray } from "../sysdef-src/prompt";

// pacman provider - installs packages from official Arch repos globally
const MAX_AT_ONCE = 5;

// we use the default shell when getting the list of all installed packages since
// we want that to happen even in a dry run
const realShell = defaultShell

const provider: ProviderGenerator = (run: Shell) => {
  return {
    name: "arch-official",
    async checkInstallation() {
      const result = await run(`which pacman`, {
        throwOnError: true
      });
      if (result.code !== 0) {
        throw new Error("pacman is not installed or not in PATH");
      }
    },
    async install(packages: PackageInfo[]) {
      // Official Arch repos only carry the current version of a package, so
      // pinning an arbitrary version is not supported.
      const pinned = packages.find(p => p.version !== ANY_VERSION_STRING);
      if (pinned) {
        errorOut(`arch-official cannot install a specific version from official repos: got ${pinned.name}:${pinned.version}. Remove the version pin.`);
      }

      const partitions = partitionArray(packages, MAX_AT_ONCE);

      for (const part of partitions) {
        const string = part.map(p => p.name).join(" ");
        console.log(`Installing ${string}`);
        const result = await run(`pacman -S --noconfirm ${string}`, {
          displayOutput: true,
          asRoot: true,
          throwOnError: true,
        });
        if (result.code !== 0) {
          errorOut(`Failed to install arch-official packages: ${string} (exit code ${result.code})`);
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
          throwOnError: true,
        });

        if (result.code !== 0) {
          errorOut(`Failed to uninstall arch-official packages: ${string} (exit code ${result.code})`);
        }
      }
    },

    async getInstalled() {
      // Get all explicitly installed packages.
      // throwOnError:true here suppresses throwing on a non-zero exit -- pacman
      // query subcommands exit 1 when their result set is empty (e.g. -Qm with
      // no foreign packages), which is not an error for us.
      const explicitResult = await realShell(`pacman -Qe`, { throwOnError: true });
      const explicitLines = explicitResult.stdout.trim().split('\n').filter(line => line.trim());

      // Get foreign/unofficial packages (from AUR, etc.)
      const foreignResult = await realShell(`pacman -Qm`, { throwOnError: true });
      const foreignLines = foreignResult.stdout.trim().split('\n').filter(line => line.trim());

      // Create a set of foreign package names for quick lookup
      const foreignPackages = new Set<string>();
      for (const line of foreignLines) {
        const match = line.match(/^(\S+)\s+(.+)$/);
        if (match && match[1]) {
          foreignPackages.add(match[1]);
        }
      }

      // Filter to only include official packages (exclude foreign ones)
      return explicitLines
        .map(line => {
          const match = line.match(/^(\S+)\s+(.+)$/);
          if (!match || !match[1] || !match[2]) {
            throw new Error(`Failed to parse pacman package line: ${line}`);
          }

          return {
            name: match[1],
            provider: "arch-official",
            version: match[2],
          };
        })
        .filter(pkg => !foreignPackages.has(pkg.name));
    },

    async update(packages: string[]) {
      const partitions = partitionArray(packages, MAX_AT_ONCE);

      for (const part of partitions) {
        const string = part.join(" ");
        console.log(`Updating ${string}`);
        const result = await run(`pacman -Syu --noconfirm ${string}`, {
          displayOutput: true,
          asRoot: true,
          throwOnError: true,
        });

        if (result.code !== 0) {
          errorOut(`Failed to update arch-official packages: ${string} (exit code ${result.code})`);
        }
      }
    },
  };
};

export default provider;
