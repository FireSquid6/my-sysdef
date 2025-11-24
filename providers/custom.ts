// provider for making custom packages
import { type ProviderGenerator, type Shell } from "../sysdef-src/sysdef";


const provider: ProviderGenerator = (run: Shell) => {
  return {
    name: "custom",
    async checkInstallation() {

    },
    async install(packages) {

    },
    async uninstall(packages) {

    },
    async getInstalled() {
      
    },
  }
}


export default provider;
