import { ANY_VERSION_STRING, type PackageInfo, type ProviderGenerator, type Shell } from "../sysdef-src/sysdef";

// yay provider - installs packages from AUR and official repos globally

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
      await Promise.all(packages.map(p => {
        const version = p.version === ANY_VERSION_STRING ? "" : `=${p.version}`;
        return run(`yay -S --noconfirm ${p.name}${version}`);
      }));
    },

    async uninstall(packages: string[]) {
      await Promise.all(packages.map(p => run(`yay -Rs --noconfirm ${p}`)));
    },

    async getInstalled() {
      const result = await run(`yay -Qe`);
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
