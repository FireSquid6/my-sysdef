import { describe, expect, test } from "bun:test";

// Bundle only the pure helpers, leaving all GI and reactive runtime externals out
// of this Node/Bun test process. This does not launch GJS or claim D-Bus names.
const source = await Bun.file(new URL("../ags/services/notifications.ts", import.meta.url)).text();
const helpers = source.slice(source.indexOf("export function notificationText"), source.indexOf("const XML"));
const module = await import(`data:text/javascript;base64,${Buffer.from(Bun.Transpiler ? new Bun.Transpiler({ loader: "ts" }).transformSync(helpers) : helpers).toString("base64")}`);
const { notificationText, notificationActions, retainNotification } = module;

describe("notification presentation and retention", () => {
  test("untrusted notification text is bounded plain text", () => {
    expect(notificationText('<b>hello</b><img src="file:///secret">\0world')).toBe("helloworld");
    expect(notificationText("x".repeat(9000))).toHaveLength(8192);
    expect(notificationText("a & b < 3")).toBe("a & b < 3");
  });
  test("action pairs preserve opaque IDs and sanitize labels", () => {
    expect(notificationActions(["default", "<b>Open</b>", "odd"])).toEqual([{ id: "default", label: "Open" }]);
    expect(notificationActions(Array.from({ length: 100 }, (_, i) => String(i)))).toHaveLength(20);
  });
  test("replacement removes duplicate IDs and newest history is bounded to 100", () => {
    const initial = Array.from({ length: 100 }, (_, id) => ({ id }));
    const replacement = { id: 20, summary: "new" };
    const replaced = retainNotification(initial, replacement);
    expect(replaced).toHaveLength(100);
    expect(replaced[0]).toEqual(replacement);
    expect(replaced.filter((item: { id: number }) => item.id === 20)).toHaveLength(1);
    const appended = retainNotification(initial, { id: 101 });
    expect(appended).toHaveLength(100);
    expect(appended[0].id).toBe(101);
    expect(appended.at(-1).id).toBe(98);
  });
});

// Exercise the exported D-Bus contract with an inert transport, never the user's
// session bus. The production service code itself is unchanged by this harness.
const prelude = `
export const harness = { requests: 0, impl: null, signals: [], timers: new Map(), unowned: 0 };
const createState = initial => {
  let value = initial;
  return [() => value, next => value = typeof next === 'function' ? next(value) : next];
};
const onCleanup = () => {};
class Variant { constructor(signature, value) { this.value = value; } deep_unpack() { return this.value; } }
const GLib = { Variant, PRIORITY_DEFAULT: 0, SOURCE_REMOVE: false,
  source_remove: id => harness.timers.delete(id),
  timeout_add: (_, ms, callback) => { const id = harness.timers.size + 1; harness.timers.set(id, {ms, callback}); return id; }
};
const Gio = { BusType: { SESSION: 1 }, BusNameOwnerFlags: { DO_NOT_QUEUE: 4 },
  bus_own_name: (type, name, flags, acquired, owned) => {
    harness.requests++; harness.name = name; harness.flags = flags; acquired({}); owned({}); return 1;
  },
  bus_unown_name: () => harness.unowned++,
  DBusExportedObject: { wrapJSObject: (xml, impl) => {
    harness.impl = impl;
    return { export() {}, unexport() {}, emit_signal(name, args) { harness.signals.push([name, args.deep_unpack()]); } };
  } }
};
`;
const runtime = await import(`data:text/javascript;base64,${Buffer.from(new Bun.Transpiler({ loader: "ts" }).transformSync(prelude + source.replace(/^import .*;\n/gm, ""))).toString("base64")}`);

describe("notification daemon contract with inert D-Bus transport", () => {
  test("construction is inert; start is idempotent and never replaces another daemon", () => {
    const { harness, createNotificationService } = runtime;
    const count = harness.requests;
    const service = createNotificationService();
    expect(harness.requests).toBe(count);
    service.start(); service.start();
    expect(harness.requests).toBe(count + 1);
    expect(harness.name).toBe("org.freedesktop.Notifications");
    expect(harness.flags).toBe(4);
    service.stop();
    service.start();
    expect(harness.requests).toBe(count + 2);
    service.stop();
  });
  test("Notify replaces active IDs, honors expiry and DND, and keeps dismissed history", () => {
    const { harness, createNotificationService } = runtime;
    const service = createNotificationService(); service.start();
    const notify = (replaces = 0, timeout = 0) => harness.impl.Notify("app", replaces, "icon", "<b>title</b>", "body", ["open", "Open"], {}, timeout);
    const id = notify();
    expect(service.items()[0].summary).toBe("title");
    expect(notify(id)).toBe(id);
    expect(service.items()).toHaveLength(1);
    service.dismiss(id);
    expect(service.items()[0].active).toBe(false);
    expect(service.items()[0].popup).toBe(false);
    expect(harness.signals.at(-1)).toEqual(["NotificationClosed", [id, 2]]);
    expect(notify(id)).not.toBe(id);
    service.toggleDnd();
    const timedId = notify(0, 123);
    expect(service.items()[0].popup).toBe(false);
    const timer = [...harness.timers.values()].find((timer: any) => timer.ms === 123) as any;
    timer.callback();
    expect(service.items().find((item: any) => item.id === timedId).active).toBe(false);
    expect(harness.signals.at(-1)).toEqual(["NotificationClosed", [timedId, 1]]);
    service.clear(); expect(service.items()).toEqual([]);
    service.stop();
  });
  test("actions only invoke advertised active IDs and transient close leaves no history", () => {
    const { harness, createNotificationService } = runtime;
    const service = createNotificationService(); service.start();
    const id = harness.impl.Notify("app", 0, "", "title", "", ["open", "Open"], {transient: {deep_unpack: () => true}}, 0);
    const count = harness.signals.length;
    service.invoke(id, "unknown"); expect(harness.signals).toHaveLength(count);
    service.invoke(id, "open");
    expect(harness.signals.slice(-2)).toEqual([["ActionInvoked", [id, "open"]], ["NotificationClosed", [id, 2]]]);
    expect(service.items()).toEqual([]);
    service.stop();
  });
});
