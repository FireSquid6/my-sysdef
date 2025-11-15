// this file just loads all the files in the packagelist
import type { ModuleGenerator } from "../sysdef-src/sysdef";
import fs from "fs";
import path from "path";

const rootDir = path.resolve(import.meta.dir, "..");

const m: ModuleGenerator = () => {
  const text = fs.readFileSync(path.join(rootDir, "pkglists/yay.txt")).toString();

  const lines = text.split("\n").filter(l => l !== "");

  return {
    name: "packages",
    variables: {},
    files: {},
    directories: {},
    packages: {
      "yay": lines,
    },
  }
}

export default m;
