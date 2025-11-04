import { ANY_VERSION_STRING, type PackageInfo, type ProviderGenerator, type Shell } from "../sysdef-src/sysdef";
import os from "os";
import fs from "fs";
import path from "path";
import { v } from "../sysdef-src/validation";

// bun povider - installs packages globally

const BUN_USER = process.env.SUDO_USER || process.env.USER || "root";

const packageJsonSchema = v.obj({
  dependencies: v.record(v.string(), v.string()),
});


const provider: ProviderGenerator = (run: Shell) => {
  return {
    name: "bun",
    async checkInstallation() {
      const result = await run(`sudo -u ${BUN_USER} which bun`, true);
      if (result.code !== 0) {
        throw new Error("bun is not installed or not in PATH");
      }
    },
    // this should be able to handle the case where a package is requested to be intsalled of a different version! 
    async install(packages: PackageInfo[]) {
      await Promise.all(packages.map(p => run(`sudo -u ${BUN_USER} bun add -g ${p.name}@${p.version === ANY_VERSION_STRING
        ? "latest"
        : p.version
      } -E`)));
    },

    async uninstall(packages: string[]) {
      await Promise.all(packages.map(p => run(`sudo -u ${BUN_USER} bun remove -g ${p}`)))
    },
    async getInstalled() {
      const result = await run(`sudo -u ${BUN_USER} bash -c 'echo $HOME'`, true);
      if (result.code !== 0) {
        throw new Error("Failed to get home directory for BUN_USER");
      }
      const homedir = result.output.trim();
      const packagePath = path.join(homedir, ".bun/install/global/package.json");

      if (!fs.existsSync(packagePath)) {
        throw new Error(`Error getting all installed for bun: couldn't find the package json for bun globals in ${packagePath}.`);

      }

      const contents = fs.readFileSync(packagePath).toString();
      const pkg = v.parseSafe(JSON.parse(contents), packageJsonSchema);

      if (!pkg) {
        throw new Error(`Package json file in ${packagePath} was not a valid package.json`)
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
      await Promise.all(packages.map(p => run(`sudo -u ${BUN_USER} bun update -g ${p}`)))
    },
  }
}

export default provider;
