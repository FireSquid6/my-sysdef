#!/usr/bin/env bun

import { runMenu, type MenuOption } from "../lib/custom-menu";


export const menu: MenuOption[] = [
  {
    label: "Suspend",
    type: "shell",
    command: ["systemctl", "suspend"],
  },
  {
    label: "Shutdown",
    type: "shell",
    command: ["shutdown", "-h", "now"],
  },
  {
    label: "Logout",
    type: "shell",
    command: ["hyprland", "dispatch", "exit"],
  },
  {
    label: "Lock",
    type: "shell",
    command: ["hyprlock"],
  },
]


await runMenu(menu);
