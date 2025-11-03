import type { PackageInfo } from "./sysdef";


export class PackageSet {
  private packages = new Set<string>();
  private packageKeys = new Set<string>();

  add(pkg: PackageInfo) {
    this.packages.add(`${pkg.provider}:${pkg.name}:${pkg.version}`);
    this.packageKeys.add(`${pkg.provider}:${pkg.name}`);
  }

  has(pkg: PackageInfo) {
    return this.packages.has(`${pkg.provider}:${pkg.name}:${pkg.version}`);
  }

  hasAnyVersion(pkg: Omit<PackageInfo, "version">) {
    return this.packageKeys.has(`${pkg.provider}:${pkg.name}`);
  }

  addList(packages: PackageInfo[]) {
    for (const pkg of packages) {
      this.add(pkg);
    }
  }

}
