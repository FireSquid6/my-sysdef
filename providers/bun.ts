import { ANY_VERSION_STRING, errorOut, type PackageInfo, type ProviderGenerator, type Shell } from "../sysdef-src/sysdef";
import fs from "fs";
import { v } from "../sysdef-src/validation";


// getting errors? You need to update BUN_USER to be the user you have bun installed with (bun does a per user installation)
// you typically use a different installation of bun than the one that comes with sysdef
const BUN_USER = "firesquid"
const bunBinary = `/home/${BUN_USER}/.bun/bin/bun`;
const bunPackageJsonPath = `/home/${BUN_USER}/.bun/install/global/package.json`

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
      await Promise.all(packages.map(p => run(`${bunBinary} install -g ${p.name}@${p.version === ANY_VERSION_STRING
        ? "latest"
        : p.version
      } -E`, {})));
    },

    async uninstall(packages: string[]) {
      await Promise.all(packages.map(p => run(`${bunBinary} remove -g ${p}"`, {})))
    },
    async getInstalled() {
      if (!fs.existsSync(bunPackageJsonPath)) {
        throw new Error(`Error getting all installed for bun: couldn't find the package json for bun globals in ${bunPackageJsonPath}.`, );

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
      await Promise.all(packages.map(p => run(`${bunBinary} update -g ${p}`, {})))
    },
  }
}

export default provider;
