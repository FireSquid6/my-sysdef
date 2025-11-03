import fs from "fs";
import path from "path";

export interface Filesystem {
  writeFile(filepath: string, contents: string): void
  exists(filepath: string): boolean  
  ensureSymlink(destination: string, source: string): void
}

export const dryFilesystem: Filesystem = {
  writeFile(filepath, _) {
      console.log(`Would be writing to ${filepath}`);
  },
  exists(filepath) {
      return fs.existsSync(filepath);
  },
  ensureSymlink(destination, source) {
      console.log(`Creating symlink ${source} -> ${destination}`);
  },
}

export const normalFilesystem: Filesystem = {
  writeFile(filepath, contents) {
    const dirname = path.dirname(filepath);
    fs.mkdirSync(dirname, { recursive: true });
    fs.writeFileSync(filepath, contents);
  },
  exists(filepath) {
    return fs.existsSync(filepath);
  },
  ensureSymlink(destination, source) {
    try {
      const stats = fs.lstatSync(destination);

      if (stats.isSymbolicLink()) {
        return;
      }
      throw new Error(`Trying to create a symlink to non-symlink file: ${destination}`);
    } catch (e: any) {
      if (e.code === "ENONET") {
        fs.symlinkSync(source, destination);
        return;
      }
      throw e;
    }
  },
}
