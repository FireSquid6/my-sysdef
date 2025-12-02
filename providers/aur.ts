import { ANY_VERSION_STRING, defaultShell, type PackageInfo, type ProviderGenerator, type Shell } from "../sysdef-src/sysdef";
import { partitionArray, stringifyPackageParition } from "../sysdef-src/prompt";

// AUR provider - installs packages from the Arch User Repository
const MAX_AT_ONCE = 5;

// we use the default shell when getting the list of all installed packages since
// we want that to happen even in a dry run
const realShell = defaultShell

// Fetch, build, and install a package from the AUR
async function buildAndInstallFromAUR(run: Shell, packageName: string, version: string): Promise<void> {
  const buildDir = `/tmp/aur-builds/${packageName}`;
  const aurUrl = `https://aur.archlinux.org/${packageName}.git`;

  // Remove existing build directory if it exists
  await realShell(`rm -rf ${buildDir}`, {});

  // Clone the AUR repository
  console.log(`Cloning ${packageName} from AUR...`);
  const cloneResult = await realShell(`git clone ${aurUrl} ${buildDir}`, {
    displayOutput: true,
  });

  if (cloneResult.code !== 0) {
    throw new Error(`Failed to clone ${packageName} from AUR`);
  }

  // Checkout specific version if not installing latest
  if (version !== ANY_VERSION_STRING) {
    console.log(`Checking out version ${version}...`);
    const checkoutResult = await realShell(`cd ${buildDir} && git checkout ${version}`, {
      displayOutput: true,
    });

    if (checkoutResult.code !== 0) {
      throw new Error(`Failed to checkout version ${version} for ${packageName}`);
    }
  }

  // Build the package with makepkg -s (installs build dependencies)
  console.log(`Building ${packageName}...`);
  const buildResult = await realShell(`cd ${buildDir} && makepkg -s --noconfirm`, {
    displayOutput: true,
  });

  if (buildResult.code !== 0) {
    throw new Error(`Failed to build ${packageName}`);
  }

  // Find the built package file
  const findPkgResult = await realShell(`find ${buildDir} -maxdepth 1 -name '*.pkg.tar.zst' -o -name '*.pkg.tar.xz'`, {});
  const pkgFile = findPkgResult.stdout.trim().split('\n')[0];

  if (!pkgFile) {
    throw new Error(`Could not find built package for ${packageName}`);
  }

  // Install the package
  console.log(`Installing ${packageName}...`);
  const installResult = await run(`pacman -U --noconfirm ${pkgFile}`, {
    displayOutput: true,
    asRoot: true,
  });

  if (installResult.code !== 0) {
    throw new Error(`Failed to install ${packageName}`);
  }

  // Clean up build directory
  await realShell(`rm -rf ${buildDir}`, {});
  console.log(`Successfully installed ${packageName} from AUR`);
}

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
      // Install AUR packages one at a time (can't batch install from source)
      for (const pkg of packages) {
        try {
          await buildAndInstallFromAUR(run, pkg.name, pkg.version);
        } catch (error) {
          console.log(`Error installing ${pkg.name}: ${error instanceof Error ? error.message : error}`);
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
      // Update AUR packages one at a time by rebuilding from latest source
      for (const packageName of packages) {
        try {
          await buildAndInstallFromAUR(run, packageName, ANY_VERSION_STRING);
        } catch (error) {
          console.log(`Error updating ${packageName}: ${error instanceof Error ? error.message : error}`);
        }
      }
    },
  };
};

export default provider;
