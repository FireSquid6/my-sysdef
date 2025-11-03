import { ANY_VERSION_STRING, type PackageInfo, type ProviderGenerator, type Shell } from "../sysdef-src/sysdef";

// cargo provider - installs Rust packages globally

const provider: ProviderGenerator = (run: Shell) => {
  return {
    name: "cargo",
    async checkInstallation() {
      const result = await run(`which cargo`, true);
      if (result.code !== 0) {
        throw new Error("cargo is not installed or not in PATH");
      }
    },
    async install(packages: PackageInfo[]) {
      await Promise.all(packages.map(p => {
        const version = p.version === ANY_VERSION_STRING 
          ? "" 
          : ` --version ${p.version}`;
        return run(`cargo install ${p.name}${version}`);
      }));
    },

    async uninstall(packages: string[]) {
      await Promise.all(packages.map(p => run(`cargo uninstall ${p}`)));
    },

    async getInstalled() {
      const result = await run(`cargo install --list`);
      const lines = result.text.trim().split('\n').filter(line => line.trim());
      const packages = [];
      
      for (const line of lines) {
        const match = line.match(/^(\S+)\s+v(.+):/);
        if (match && match[1] && match[2]) {
          packages.push({
            name: match[1],
            provider: "cargo",
            version: match[2],
          });
        } else if (match) {
          throw new Error(`Failed to parse cargo package line: ${line}`);
        }
      }
      
      return packages;
    },

    async update(packages: string[]) {
      if (packages.length === 0) {
        const installed = await this.getInstalled();
        await Promise.all(installed.map(p => run(`cargo install ${p.name}`)));
      } else {
        await Promise.all(packages.map(p => run(`cargo install ${p}`)));
      }
    },
  };
};

export default provider;
