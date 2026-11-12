#!/usr/bin/env bun
// A detached worker owns the desktop action listener after the toast is dismissed.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { notifyArgs } from "./notification.js";

type Message = { title: string; body: string; level: string; timeout: number; icon: string | null; action: { name: string; args: Record<string, unknown> } | null };
export async function deliver(message: Message) {
  const notifier = Bun.spawn(["notify-send", ...notifyArgs(message)], { stdout: "pipe", stderr: "pipe" });
  const [output, error, code] = await Promise.all([new Response(notifier.stdout).text(), new Response(notifier.stderr).text(), notifier.exited]);
  if (code !== 0) throw Error(`notify-send failed (${code}): ${error.trim()}`);
  if (message.action && output.trim() === "default") {
    // argv and JSON only: titles, bodies, addresses and command args never enter a shell.
    const action = Bun.spawn(["herdr-app", "do", message.action.name, JSON.stringify(message.action.args)], { stdout: "ignore", stderr: "pipe", env: { ...process.env, HERDR_APP_HOME: path.resolve(import.meta.dir, "../..") } });
    const error = await new Response(action.stderr).text();
    if (await action.exited !== 0) throw Error(`Herdr notification action failed: ${error.trim()}`);
    if (process.env.HYPRLAND_INSTANCE_SIGNATURE && Bun.which("hyprctl")) {
      const focus = Bun.spawn(["hyprctl", "eval", 'hl.dispatch(hl.dsp.focus({ window = "class:^(herdr-app)$" }))'], { stdout: "ignore", stderr: "ignore" });
      if (await focus.exited !== 0) throw Error("Could not bring Herdr to the foreground");
    }
  }
}

if (import.meta.main) {
  try {
    const [mode, payload] = process.argv.slice(2);
    if (!payload || !["--launch", "--worker"].includes(mode!)) throw Error("Expected --launch or --worker and a notification payload");
    const message: Message = JSON.parse(payload);
    for (const tool of ["notify-send", "herdr-app"]) if (!Bun.which(tool)) throw Error(`Missing required command: ${tool}`);
    if (mode === "--worker") await deliver(message);
    else {
      const dir = path.join(process.env.XDG_RUNTIME_DIR ?? os.tmpdir(), `sysdef-herdr-notifications-${process.getuid!()}`);
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const log = fs.openSync(path.join(dir, "errors.log"), "a", 0o600);
      try {
        const child = spawn(process.execPath, [import.meta.path, "--worker", payload], { detached: true, stdio: ["ignore", log, log], env: process.env });
        await new Promise<void>((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
        child.unref();
      } finally { fs.closeSync(log); }
    }
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
