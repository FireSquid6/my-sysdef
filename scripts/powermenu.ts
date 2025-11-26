#!../bin/bun
import { runMenu, type MenuOption } from "../lib/custom-menu";


const menu: MenuOption[] = [
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
]


await runMenu(menu);
