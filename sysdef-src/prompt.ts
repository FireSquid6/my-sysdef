import { ANY_VERSION_STRING } from "./sysdef";
import type { PackageInfo } from "./sysdef";

// read a single line from stdin via process.stdin data events (the same
// approach as readPassword in index.ts, minus the echo suppression). The
// `for await (const line of console)` form does not reliably yield here.
export function readline(): Promise<string> {
  return new Promise((resolve) => {
    const decoder = new TextDecoder();
    let buf = "";
    const onData = (chunk: Buffer) => {
      buf += decoder.decode(chunk);
      const nl = buf.indexOf("\n");
      if (nl === -1) {
        return;
      }
      process.stdin.off("data", onData);
      process.stdin.pause();
      resolve(buf.slice(0, nl).replace(/\r$/, ""));
    };

    process.stdin.resume();
    process.stdin.on("data", onData);
  });
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
