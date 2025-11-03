import fs from "fs";
import { v } from "./validation";
import { errorOut } from "./sysdef";


export const lockfileSchema = v.record(v.string(), v.record(v.string(), v.string()))
export type LockfileData = v.Infer<typeof lockfileSchema>;


export class Lockfile {
  private data: LockfileData = {};

  getVersion(provider: string, name: string): string | undefined {
    if (this.data[provider]) {
      return this.data[provider][name];
    }
    return undefined;
  }

  setVersion(provider: string, name: string, version: string) {
    if (!this.data[provider]) {
      this.data[provider] = {}
    }
    this.data[provider][name] = version;
  }
  
  delete(provider: string, name: string) {
    if (this.data[provider] !== undefined && this.data[provider][name] !== undefined) {
      delete this.data[provider][name];
    }
  }

  serializeToFile(filepath: string) {
    const json = JSON.stringify(this.data);
    fs.writeFileSync(filepath, json);
  }
  
  readFromFile(filepath: string) {
    if (!fs.existsSync(filepath)) {
      // if the filepath doesn't exist, we can't read from it. Therefore,
      // the lockfile is empty
      return;
    }

    const contents = fs.readFileSync(filepath).toString();
    const json = JSON.parse(contents);
    const data = v.parseSafe(json, lockfileSchema);

    if (!data) {
      errorOut(`Failed to read lockfile from ${filepath}`);
    }

    this.data = data;
  }
}
