import { ANY_VERSION_STRING, defaultShell, errorOut, type PackageInfo, type ProviderGenerator, type Shell } from "../sysdef-src/sysdef";
import { partitionArray } from "../sysdef-src/prompt";

// AUR provider - clones, builds, and installs packages from the Arch User
// Repository. makepkg must run as a non-root user (it refuses to run as root),
// so sysdef itself should be run as your normal user; only the final `pacman -U`
// is elevated.
const MAX_AT_ONCE = 5;

// we use the default shell when getting the list of all installed packages since
// we want that to happen even in a dry run
const realShell = defaultShell

// Fetch, build, and install a single package from the AUR.
async function buildAndInstallFromAUR(run: Shell, packageName: string): Promise<void> {
  const buildDir = `/tmp/aur-builds/${packageName}`;
  const aurUrl = `https://aur.archlinux.org/${packageName}.git`;

  // Remove existing build directory if it exists
  await realShell(`rm -rf ${buildDir}`, {});

  // Clone the AUR repository
  console.log(`Cloning ${packageName} from AUR...`);
  const cloneResult = await realShell(`git clone ${aurUrl} ${buildDir}`, {
    displayOutput: true,
    throwOnError: true,
  });

  if (cloneResult.code !== 0) {
    errorOut(`Failed to clone ${packageName} from the AUR (exit code ${cloneResult.code})`);
  }

  // Build the package with makepkg -s (installs build dependencies).
  // makepkg refuses to run as root, so this runs as the invoking user.
  // Use an explicit `bash -c` (array form) so cd/&& are handled by a real shell
  // -- defaultShell splits string commands on spaces and has no shell.
  console.log(`Building ${packageName}...`);
  const buildResult = await realShell(["bash", "-c", `cd ${buildDir} && makepkg -s --noconfirm`], {
    displayOutput: true,
    throwOnError: true,
  });

  if (buildResult.code !== 0) {
    errorOut(`Failed to build ${packageName} from the AUR (exit code ${buildResult.code})`);
  }

  // Find the built package files (glob needs a real shell too). Exclude the
  // separate `*-debug-*` packages makepkg may emit.
  const findPkgResult = await realShell(["bash", "-c", `find ${buildDir} -maxdepth 1 \\( -name '*.pkg.tar.zst' -o -name '*.pkg.tar.xz' \\) ! -name '*-debug-*'`], {});
  const pkgFiles = findPkgResult.stdout.trim().split('\n').filter(f => f.trim());

  if (pkgFiles.length === 0) {
    errorOut(`Could not find a built package for ${packageName} after makepkg`);
  }

  // Install the built package(s) (elevated)
  console.log(`Installing ${packageName}...`);
  const installResult = await run(`pacman -U --noconfirm ${pkgFiles.join(" ")}`, {
    displayOutput: true,
    asRoot: true,
    throwOnError: true,
  });

  if (installResult.code !== 0) {
    errorOut(`Failed to install ${packageName} from the AUR (exit code ${installResult.code})`);
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
      // AUR package versions come from the PKGBUILD; arbitrary version pins are
      // not supported.
      const pinned = packages.find(p => p.version !== ANY_VERSION_STRING);
      if (pinned) {
        errorOut(`aur cannot install a specific version: got ${pinned.name}:${pinned.version}. The AUR builds whatever the PKGBUILD specifies -- remove the version pin.`);
      }

      for (const p of packages) {
        await buildAndInstallFromAUR(run, p.name);
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
          errorOut(`Failed to uninstall aur packages: ${string} (exit code ${result.code})`);
        }
      }
    },

    async getInstalled() {
      // Get foreign/AUR packages. throwOnError:true suppresses throwing on a
      // non-zero exit: `pacman -Qm` exits 1 when there are no foreign packages.
      const result = await realShell(`pacman -Qm`, { throwOnError: true });
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
      // Rebuild from the AUR to pick up new upstream versions. With no packages
      // given, rebuild every installed foreign (AUR) package.
      const toUpdate = packages.length === 0
        ? (await this.getInstalled()).map(p => p.name)
        : packages;

      for (const name of toUpdate) {
        await buildAndInstallFromAUR(run, name);
      }
    },
  };
};

export default provider;
