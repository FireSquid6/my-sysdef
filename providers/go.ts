import { ANY_VERSION_STRING, defaultShell, errorOut, type PackageInfo, type ProviderGenerator, type Shell } from "../sysdef-src/sysdef";
import fs from "fs";
import path from "path";

// go provider - installs command binaries with `go install path@version`
// (isolated namespace: binaries live in GOBIN). Note: go has no native
// list/uninstall, so getInstalled scans GOBIN and reads each binary's embedded
// module info with `go version -m`, and uninstall removes the binary file. The
// binary name is assumed to be the last element of the module path (best effort).

// we use the default shell when getting the list of all installed packages since
// we want that to happen even in a dry run
const realShell = defaultShell;

async function goBinDir(): Promise<string> {
  const gobin = (await realShell(`go env GOBIN`, { throwOnError: true })).stdout.trim();
  if (gobin) return gobin;
  const gopath = (await realShell(`go env GOPATH`, { throwOnError: true })).stdout.trim();
  return path.join(gopath, "bin");
}

const provider: ProviderGenerator = (run: Shell) => {
  return {
    name: "go",
    async checkInstallation() {
      const result = await run(`which go`, { throwOnError: true });
      if (result.code !== 0) {
        errorOut("go is not installed or not in PATH");
      }
    },
    async install(packages: PackageInfo[]) {
      for (const p of packages) {
        const version = p.version === ANY_VERSION_STRING ? "latest" : p.version;
        const result = await run(`go install ${p.name}@${version}`, { throwOnError: true });
        if (result.code !== 0) {
          errorOut(`Failed to install go package: ${p.name}@${version} (exit code ${result.code})`);
        }
      }
    },

    async uninstall(packages: string[]) {
      const bin = await goBinDir();
      for (const p of packages) {
        // best effort: binary name is the last path segment of the module path
        const binary = path.join(bin, path.basename(p));
        const result = await run(`rm -f ${binary}`, { throwOnError: true });
        if (result.code !== 0) {
          errorOut(`Failed to uninstall go package: ${p} (exit code ${result.code})`);
        }
      }
    },

    async getInstalled() {
      const bin = await goBinDir();
      if (!fs.existsSync(bin)) {
        return [];
      }

      const installed: PackageInfo[] = [];
      for (const file of fs.readdirSync(bin)) {
        const full = path.join(bin, file);
        const result = await realShell(`go version -m ${full}`, { throwOnError: true });
        if (result.code !== 0) continue; // not a go binary

        const lines = result.stdout.split("\n").map(l => l.trim());
        const pathLine = lines.find(l => l.startsWith("path\t"));
        const modLine = lines.find(l => l.startsWith("mod\t"));
        if (!pathLine || !modLine) continue;

        const name = pathLine.split("\t")[1];
        const version = modLine.split("\t")[2];
        if (name && version) {
          installed.push({ name, provider: "go", version });
        }
      }
      return installed;
    },

    async update(packages: string[]) {
      for (const p of packages) {
        const result = await run(`go install ${p}@latest`, { throwOnError: true });
        if (result.code !== 0) {
          errorOut(`Failed to update go package: ${p} (exit code ${result.code})`);
        }
      }
    },
  };
};

export default provider;
