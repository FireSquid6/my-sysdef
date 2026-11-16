import { expect, test } from "bun:test";
import { networkLabel } from "../ags/system-model";

// Execute the public service against manually driven Gio/GLib, not wall time or
// desktop commands. Stalled children never complete until cancelled by the service.
const source = await Bun.file(new URL("../ags/services/system.ts", import.meta.url)).text();
const prelude = `
export const harness = { children: [], timers: new Map(), next: 1 };
const networkLabel = output => harness.networkLabel(output);
const createState = initial => { let value = initial; return [() => value, next => value = next]; };
const readFile = () => { throw Error('No battery'); };
const GLib = { PRIORITY_DEFAULT: 0, SOURCE_REMOVE: false, SOURCE_CONTINUE: true,
  timeout_add_seconds: (_, seconds, callback) => { const id = harness.next++; harness.timers.set(id, {seconds, callback}); return id; },
  source_remove: id => harness.timers.delete(id)
};
class Cancellable { cancelled = false; cancel() { this.cancelled = true; } }
const Gio = { Cancellable, FileQueryInfoFlags: { NONE: 0 },
  File: { new_for_path: () => ({ enumerate_children: () => ({ next_file: () => null, close() {} }) }) },
  SubprocessFlags: { STDOUT_PIPE: 1, STDERR_PIPE: 2 },
  Subprocess: { new: argv => {
    const child = { argv, killed: false, force_exit() { this.killed = true; },
      communicate_utf8_async(input, cancellable, callback) { this.cancellable = cancellable; this.callback = callback; },
      communicate_utf8_finish(result) { if (result instanceof Error) throw result; return [true, result, '']; },
      get_successful: () => true,
      complete(value) { this.callback(this, value); }
    };
    harness.children.push(child); return child;
  } }
};
`;
const runtime = await import(`data:text/javascript;base64,${Buffer.from(new Bun.Transpiler({ loader: "ts" }).transformSync(prelude + source.replace(/^import .*\n/gm, ""))).toString("base64")}`);
// Keep real presentation decisions while replacing only native I/O.
runtime.harness.networkLabel = networkLabel;

test("stalled status children time out, release busy, and allow another update", async () => {
  const { harness, createSystemService } = runtime;
  const service = createSystemService();
  const first = service.update();
  const children = harness.children.slice(-3);
  expect(children).toHaveLength(3);
  const deadlines = [...harness.timers.entries()] as Array<[number, any]>;
  expect(deadlines).toHaveLength(3);
  for (const [id, timer] of deadlines) {
    expect(timer.seconds).toBeGreaterThan(0);
    expect(timer.seconds).toBeLessThanOrEqual(5);
    harness.timers.delete(id); timer.callback();
  }
  await first;
  expect(children.every((c: any) => c.killed && c.cancellable.cancelled)).toBe(true);
  expect(service.state()).toMatchObject({ volume: "󰝟 Unavailable", network: "󱚼 Unavailable" });
  expect(service.state().error).toContain("Audio:");
  expect(service.state().error).toContain("Network:");
  expect(harness.timers.size).toBe(0);
  const next = service.update();
  expect(harness.children.length).toBeGreaterThanOrEqual(6);
  const latest = harness.children.slice(-3);
  latest[0].complete("37"); latest[1].complete("false"); latest[2].complete("ethernet:connected:Wired");
  await next;
  expect(service.state()).toMatchObject({ volume: " 37%", network: networkLabel("ethernet:connected:Wired"), error: "" });
  expect(harness.timers.size).toBe(0);
  service.stop();
});

test("stop kills pending children, removes timers and ignores late completions", async () => {
  const { harness, createSystemService } = runtime;
  const service = createSystemService();
  const active = service.update();
  const children = harness.children.slice(-3);
  expect(children).toHaveLength(3);
  const count = harness.children.length;
  const before = service.state();
  service.stop(); service.stop();
  expect(harness.timers.size).toBe(0);
  expect(children.every((c: any) => c.killed && c.cancellable.cancelled)).toBe(true);
  children.forEach((c: any) => c.complete("late"));
  await active;
  await service.update();
  expect(harness.children).toHaveLength(count);
  expect(harness.timers.size).toBe(0);
  expect(service.state()).toBe(before);
});

test("start owns one polling timer and cannot restart a stopped service", async () => {
  const { harness, createSystemService } = runtime;
  const service = createSystemService();
  service.start(); service.start();
  expect([...harness.timers.values()].filter((timer: any) => timer.seconds === 5)).toHaveLength(1);
  service.stop();
  expect(harness.timers.size).toBe(0);
  const count = harness.children.length;
  service.start();
  await service.update();
  expect(harness.timers.size).toBe(0);
  expect(harness.children).toHaveLength(count);
});
