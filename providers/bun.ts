import { ANY_VERSION_STRING, errorOut, type PackageInfo, type ProviderGenerator, type Shell } from "../sysdef-src/sysdef";
import fs from "fs";
import os from "os";
import path from "path";
import { v } from "../sysdef-src/validation";


// bun installs per-user under ~/.bun (overridable with $BUN_INSTALL). Note this
// is your own bun install, typically different from the bun bundled with sysdef.
const bunDir = process.env.BUN_INSTALL || path.join(os.homedir(), ".bun");
const bunBinary = path.join(bunDir, "bin", "bun");
const bunPackageJsonPath = path.join(bunDir, "install", "global", "package.json");

const packageJsonSchema = v.obj({
  dependencies: v.record(v.string(), v.string()),
});


const provider: ProviderGenerator = (run: Shell) => {
  return {
    name: "bun",
    async checkInstallation() {
      if (!fs.existsSync(bunBinary)) {
        errorOut(`Bun binary not found in ${bunBinary}--you may need to edit the provider configuration, see bun.ts`)
      }
    },
    // this should be able to handle the case where a package is requested to be intsalled of a different version!
    async install(packages: PackageInfo[]) {
      if (packages.length === 0) return;
      // Install in a single command: concurrent global installs race on the
      // shared global package.json and clobber each other.
      const specs = packages
        .map(p => `${p.name}@${p.version === ANY_VERSION_STRING ? "latest" : p.version}`)
        .join(" ");
      const result = await run(`${bunBinary} install -g ${specs} -E`, { throwOnError: true });
      if (result.code !== 0) {
        errorOut(`Failed to install bun packages: ${specs} (exit code ${result.code})`);
      }
    },

    async uninstall(packages: string[]) {
      if (packages.length === 0) return;
      const specs = packages.join(" ");
      const result = await run(`${bunBinary} remove -g ${specs}`, { throwOnError: true });
      if (result.code !== 0) {
        errorOut(`Failed to uninstall bun packages: ${specs} (exit code ${result.code})`);
      }
    },
    async getInstalled() {
      // A fresh system has no global package.json until the first global
      // install creates it -- that means nothing is installed yet.
      if (!fs.existsSync(bunPackageJsonPath)) {
        return [];
      }

      const contents = fs.readFileSync(bunPackageJsonPath).toString();
      const pkg = v.parseSafe(JSON.parse(contents), packageJsonSchema);

      if (!pkg) {
        throw new Error(`Package json file in ${bunPackageJsonPath} was not a valid package.json`)
      }


      return Object.entries(pkg.dependencies).map(([p, version]) => {
        return {
          name: p,
          provider: "bun",
          version,
        }
      });
    },
    async update(packages: string[]) {
      await Promise.all(packages.map(async p => {
        const result = await run(`${bunBinary} update -g ${p}`, { throwOnError: true });
        if (result.code !== 0) {
          errorOut(`Failed to update bun package: ${p} (exit code ${result.code})`);
        }
      }))
    },
  }
}

export default provider;
