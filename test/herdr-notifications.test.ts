import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { notification, notifyArgs } from "../herdr/mods/tty-toast/notification.js";

const mod = path.resolve(import.meta.dir, "../herdr/mods/tty-toast");
const alert = { title: "Pi needs you", body: "sysdef · agent", level: "warning", overlay: "toast-1", action: { name: "agent.focus", args: { terminal: "remote/t1" } } };

describe("Herdr desktop notification forwarding", () => {
  test("suppresses the viewed agent only while Herdr is active", () => {
    for (const focus of [{ terminal: "remote/t1" }, { shown: "remote/t1", terminal: "t2" }, { agent: "remote/t1" }]) {
      expect(notification(alert, true, focus)).toBeNull();
      expect(notification(alert, false, focus)).not.toBeNull();
    }
    expect(notification(alert, true, { terminal: "t1" })).not.toBeNull();
    expect(notification(alert, true, { terminal: "remote/t1", shown: "remote/t2" })).not.toBeNull();
    expect(notification(alert, true, null)).not.toBeNull();
    expect(notification({ title: "Connection failed", level: "error" }, true, { terminal: "remote/t1" })).not.toBeNull();
  });

  test("preserves payload, action, timeout and urgency without adding sounds or shell expressions", () => {
    const payload = { ...alert, title: "-literal title; $(touch /tmp/not-executed)", body: "<details>\nline two", timeout: 12000, icon: "icons/pi.svg" };
    const message = notification(payload, false, null)!;
    expect(message).toMatchObject({ title: payload.title, body: payload.body, level: payload.level, timeout: payload.timeout, icon: payload.icon, action: payload.action });
    expect(notifyArgs(message)).toEqual(["--app-name=Herdr", "--hint=boolean:suppress-sound:true", "--urgency=normal", "--expire-time=12000", "--icon=icons/pi.svg", "--action=default=Open Herdr", "--", payload.title, payload.body]);
    expect(notifyArgs(notification({ title: "Error", level: "error" }, false, null)!)).toContain("--urgency=critical");
    expect(notification({ title: "Info", timeout: -1 }, false, null)?.timeout).toBe(0);
    expect(notification({ title: "Info", timeout: 900000 }, false, null)?.timeout).toBe(600000);
  });

  test("dispatches once from init, closes the overlay, and leaves rendering and sounds alone", async () => {
    const code = fs.readFileSync(path.join(mod, "main.js"), "utf8");
    const calls: unknown[][] = [], tasks: Promise<unknown>[] = [], closed: string[] = [];
    const element = { size() { return this; } };
    let active = false;
    const dependencies = { View: class {}, div: () => element, props: () => alert, closeOverlay: (id: string) => closed.push(id),
      exec: async (...args: unknown[]) => { calls.push(args); return { code: 0 }; }, appHome: () => "/config with spaces", focused: () => ({ terminal: "remote/t1" }), window: () => ({ active }), notification };
    const Toast = new Function(...Object.keys(dependencies), code.replace(/^import .*;$/gm, "").replace("export default class", "return class"))(...Object.values(dependencies));
    const view = new Toast();
    view.init({}, { spawn(fn: () => Promise<unknown>) { tasks.push(fn()); } });
    view.render(); view.render();
    await Promise.all(tasks);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe("bun");
    expect((calls[0]?.[1] as string[])[0]).toBe("/config with spaces/mods/tty-toast/desktop-notify.ts");
    expect(closed).toEqual(["toast-1"]);
    active = true;
    new Toast().init({}, { spawn() { throw Error("Viewed agent must not dispatch"); } });
    expect(calls).toHaveLength(1);
    expect(closed).toEqual(["toast-1", "toast-1"]);
    expect(code).not.toContain("playSound");
    expect(JSON.parse(fs.readFileSync(path.resolve(mod, "../../settings.json"), "utf8")).sounds.enabled).toBe(true);
  });

  test("detached worker survives toast launcher exit and runs the original click action (mock commands)", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sysdef-herdr-notify-"));
    try {
      const notifyLog = path.join(dir, "notify.json"), actionLog = path.join(dir, "action.json"), release = path.join(dir, "release");
      fs.writeFileSync(path.join(dir, "notify-send"), `#!${process.execPath}\nimport fs from 'node:fs';\nfs.writeFileSync(process.env.NOTIFY_LOG, JSON.stringify(process.argv.slice(2)));\nfor(let i=0; i<500 && !fs.existsSync(process.env.RELEASE); i++) await Bun.sleep(10);\nif(process.env.NOTIFY_EXIT) process.exit(Number(process.env.NOTIFY_EXIT));\nif(fs.existsSync(process.env.RELEASE)) console.log(process.env.ACTION_RESULT ?? 'default');\n`, { mode: 0o755 });
      fs.writeFileSync(path.join(dir, "herdr-app"), `#!${process.execPath}\nimport fs from 'node:fs'; fs.writeFileSync(process.env.ACTION_LOG, JSON.stringify(process.argv.slice(2)));\n`, { mode: 0o755 });
      const env = { ...process.env, PATH: `${dir}:${process.env.PATH}`, XDG_RUNTIME_DIR: dir, NOTIFY_LOG: notifyLog, ACTION_LOG: actionLog, RELEASE: release, HYPRLAND_INSTANCE_SIGNATURE: "" };
      const child = Bun.spawn([process.execPath, path.join(mod, "desktop-notify.ts"), "--launch", JSON.stringify(notification(alert, false, null))], { env, stdout: "pipe", stderr: "pipe" });
      expect(await child.exited).toBe(0); // Must not wait for a click or a closed toast's task lifetime.
      fs.writeFileSync(release, "");
      for (let i = 0; i < 200 && !fs.existsSync(actionLog); i++) await Bun.sleep(10);
      expect(JSON.parse(fs.readFileSync(notifyLog, "utf8"))).toEqual(notifyArgs(notification(alert, false, null)!));
      expect(JSON.parse(fs.readFileSync(actionLog, "utf8"))).toEqual(["do", "agent.focus", JSON.stringify(alert.action.args)]);
      fs.rmSync(actionLog);
      const dismissed = Bun.spawn([process.execPath, path.join(mod, "desktop-notify.ts"), "--worker", JSON.stringify(notification(alert, false, null))], { env: { ...env, ACTION_RESULT: "" }, stdout: "pipe", stderr: "pipe" });
      expect(await dismissed.exited).toBe(0);
      expect(fs.existsSync(actionLog)).toBe(false);
      const failed = Bun.spawn([process.execPath, path.join(mod, "desktop-notify.ts"), "--worker", JSON.stringify(notification(alert, false, null))], { env: { ...env, NOTIFY_EXIT: "1" }, stdout: "pipe", stderr: "pipe" });
      expect(await failed.exited).not.toBe(0);
      expect(fs.existsSync(actionLog)).toBe(false);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
