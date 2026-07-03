import fs from "fs";
import { v } from "./validation";
import { errorOut } from "./sysdef";


// provider -> list of package names the user has explicitly marked as untracked.
// These are suppressed from the "untracked packages" warning during sync. Stored
// separately from the lockfile because it varies per machine (the lockfile is
// shared/committed, the trackfile is gitignored).
export const trackfileSchema = v.record(v.string(), v.array(v.string()))
export type TrackfileData = v.Infer<typeof trackfileSchema>;


export class Trackfile {
  private data: TrackfileData = {};

  // Names explicitly marked as untracked for a provider.
  getUntracked(provider: string): string[] {
    return this.data[provider] ?? [];
  }

  isUntracked(provider: string, name: string): boolean {
    return this.data[provider]?.includes(name) ?? false;
  }

  addUntracked(provider: string, name: string) {
    if (!this.data[provider]) {
      this.data[provider] = [];
    }
    if (!this.data[provider].includes(name)) {
      this.data[provider].push(name);
    }
  }

  removeUntracked(provider: string, name: string) {
    const list = this.data[provider];
    if (!list) {
      return;
    }
    const next = list.filter(n => n !== name);
    if (next.length === 0) {
      delete this.data[provider];
    } else {
      this.data[provider] = next;
    }
  }

  // All providers that have at least one untracked entry.
  getProviders(): string[] {
    return Object.keys(this.data);
  }

  serializeToFile(filepath: string) {
    const json = JSON.stringify(this.data);
    fs.writeFileSync(filepath, json);
  }

  readFromFile(filepath: string) {
    if (!fs.existsSync(filepath)) {
      // if the filepath doesn't exist, we can't read from it. Therefore,
      // the trackfile is empty
      return;
    }

    const contents = fs.readFileSync(filepath).toString();
    const json = JSON.parse(contents);
    const data = v.parseSafe(json, trackfileSchema);

    if (!data) {
      errorOut(`Failed to read trackfile from ${filepath}`);
    }

    this.data = data;
  }
}
