#!../bin/bun

import fs from "fs";
import path from "path";
import os, { type } from "os";
import { runMenu, type MenuOption } from "../lib/custom-menu";

const sourcePath = path.join(os.homedir(), "source");

const projectScript = path.join(import.meta.dirname, "proj.sh");
const directories = fs.readdirSync(sourcePath);

const menu: MenuOption[] = directories.map(d => {
  return {
    type: "shell",
    label: d,
    command: [projectScript, d, "window"],
  }
});


await runMenu(menu);
