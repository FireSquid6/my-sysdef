import { ANY_VERSION_STRING } from "./sysdef";
import type { PackageInfo } from "./sysdef";

export async function readline(): Promise<string> {
  for await (const line of console) {
    return line;
  }

  return "";
}

export async function promptForOk(prompt: string): Promise<void> {
  console.log(`${prompt} (y/N)`);
  const line = await readline();
  const ok = line === "y" || line === "Y";

  if (!ok) {
    console.log("Aborted.");
    process.exit(0);
  }
}



export function partitionArray<T>(packages: T[], partitionSize: number): T[][] {
  const partitions: T[][] = [];
  let currentPartition: T[] = [];

  for (const p of packages) {
    if (currentPartition.length >= partitionSize) {
      partitions.push(currentPartition);
      currentPartition = [];
    }
    currentPartition.push(p);
  }

  partitions.push(currentPartition);

  return partitions;
}

export function stringifyPackageParition(packages: PackageInfo[]): string {
  return packages.map(p => {
    const version = p.version === ANY_VERSION_STRING ? "" : `=${p.version}`;
    return `${p.name}${version}`;
  })
    .join(" ");
}
