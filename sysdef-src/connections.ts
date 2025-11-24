import fs from "fs";
import path from "path";
import readline from "readline";
import { errorOut } from "./sysdef";

export interface Filesystem {
  writeFile(filepath: string, contents: string): Promise<void>
  exists(filepath: string): Promise<boolean>
  ensureSymlink(destination: string, source: string): Promise<void>
  copy(source: string, destination: string): Promise<void>
}

export const dryFilesystem: Filesystem = {
  async writeFile(filepath, _) {
    console.log(`Would be writing to ${filepath}`);
  },
  async exists(filepath) {
    return fs.existsSync(filepath);
  },
  async ensureSymlink(destination, source) {},
  async copy(source, destination) {
    console.log(`Would be copying ${source} -> ${destination}`);
  },
}

export const normalFilesystem: Filesystem = {
  async writeFile(filepath, contents) {
    const dirname = path.dirname(filepath);
    fs.mkdirSync(dirname, { recursive: true });

    // Remove existing file if it exists
    if (fs.existsSync(filepath)) {
      fs.rmSync(filepath);
    }

    fs.writeFileSync(filepath, contents);
  },
  async exists(filepath) {
    return fs.existsSync(filepath);
  },
  async ensureSymlink(destination, source) {
    // Remove existing file or symlink if it exists
    const dirname = path.dirname(destination);
    fs.mkdirSync(dirname, { recursive: true });

    if (fs.existsSync(destination)) {
      const stats = fs.lstatSync(destination);

      if (stats.isFile()) {
        fs.rmSync(destination);
      } else if (stats.isSymbolicLink()) {
        fs.unlinkSync(destination);

      } else if (stats.isDirectory()) {
        errorOut(`Directory present in ${destination}. Remove it (and make sure nothing there needs to be backed up!) before continuing again.`);
      } else {
        errorOut(`Neither file nor link present in ${destination}. Something is probably not right so we are just stopping. Fix ${destination} manually and retry.`);
      }
    }

    try {
      fs.symlinkSync(source, destination);
    } catch (e) {
      console.log(e);
      errorOut(`Error trying to link ${source} -> ${destination}`);
    }
  },
  async copy(source, destination) {
    const dirname = path.dirname(destination);
    fs.mkdirSync(dirname, { recursive: true });

    // Remove existing file if it exists
    if (fs.existsSync(destination)) {
      fs.rmSync(destination);
    }

    fs.copyFileSync(source, destination);
  },
}

async function askForConfirmation(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

export const confirmationFilesystem: Filesystem = {
  async writeFile(filepath, contents) {
    const dirname = path.dirname(filepath);
    fs.mkdirSync(dirname, { recursive: true });

    // Check if file exists and ask for confirmation before removing
    if (fs.existsSync(filepath)) {
      const confirmed = await askForConfirmation(`File ${filepath} already exists. Delete it to write new content?`);
      if (!confirmed) {
        console.log("Write operation cancelled.");
        return;
      }
      fs.unlinkSync(filepath);
    }

    fs.writeFileSync(filepath, contents);
  },
  async exists(filepath) {
    return fs.existsSync(filepath);
  },
  async ensureSymlink(destination, source) {
    // Check if destination exists and ask for confirmation before removing
    try {
      const stats = fs.lstatSync(destination);
      const confirmed = await askForConfirmation(`File or symlink ${destination} already exists. Delete it to create new symlink?`);
      if (!confirmed) {
        console.log("Symlink operation cancelled.");
        return;
      }
      if (stats.isFile()) {
        fs.rmSync(destination);
      } else if (stats.isSymbolicLink()) {
        fs.unlinkSync(destination);
      } else {
        fs.rmSync(destination);
      }
    } catch (error) {
      // File doesn't exist, which is fine
    }

    fs.symlinkSync(source, destination);
  },
  async copy(source, destination) {
    const dirname = path.dirname(destination);
    fs.mkdirSync(dirname, { recursive: true });

    // Check if destination exists and ask for confirmation before removing
    if (fs.existsSync(destination)) {
      const confirmed = await askForConfirmation(`File ${destination} already exists. Delete it to copy new content?`);
      if (!confirmed) {
        console.log("Copy operation cancelled.");
        return;
      }
      fs.rmSync(destination);
    }

    fs.copyFileSync(source, destination);
  },
}
