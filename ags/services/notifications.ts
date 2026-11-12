import { createState, onCleanup, type Accessor } from "ags";
import Gio from "gi://Gio";
import GLib from "gi://GLib";

export interface Notification {
  id: number;
  app: string;
  summary: string;
  body: string;
  actions: { id: string; label: string }[];
  transient: boolean;
  popup: boolean;
  icon?: string;
  urgency: number;
  active: boolean;
}
export interface NotificationService {
  items: Accessor<Notification[]>;
  dnd: Accessor<boolean>;
  error: Accessor<string>;
  start(): void;
  stop(): void;
  dismiss(id: number): void;
  invoke(id: number, action: string): void;
  clear(): void;
  toggleDnd(): void;
}

// Text is always displayed using Gtk.Label use-markup=false, never interpreted.
export function notificationText(value: string): string {
  return value.replace(/<[^>]*>/g, "").replace(/\u0000/g, "").slice(0, 8192);
}
export function notificationActions(values: string[]): Notification["actions"] {
  const actions: Notification["actions"] = [];
  for (let i = 0; i + 1 < values.length && actions.length < 20; i += 2)
    actions.push({ id: values[i]!, label: notificationText(values[i + 1]!) });
  return actions;
}
export function retainNotification(items: Notification[], next: Notification): Notification[] {
  return [next, ...items.filter(item => item.id !== next.id)].slice(0, 100);
}

const XML = `<node><interface name="org.freedesktop.Notifications">
<method name="GetCapabilities"><arg type="as" direction="out"/></method>
<method name="GetServerInformation"><arg type="s" direction="out"/><arg type="s" direction="out"/><arg type="s" direction="out"/><arg type="s" direction="out"/></method>
<method name="Notify"><arg type="s" direction="in"/><arg type="u" direction="in"/><arg type="s" direction="in"/><arg type="s" direction="in"/><arg type="s" direction="in"/><arg type="as" direction="in"/><arg type="a{sv}" direction="in"/><arg type="i" direction="in"/><arg type="u" direction="out"/></method>
<method name="CloseNotification"><arg type="u" direction="in"/></method>
<signal name="NotificationClosed"><arg type="u"/><arg type="u"/></signal>
<signal name="ActionInvoked"><arg type="u"/><arg type="s"/></signal>
</interface></node>`;

export function createNotificationService(): NotificationService {
  const [items, setItems] = createState<Notification[]>([]);
  const [dnd, setDnd] = createState(false);
  const [error, setError] = createState("");
  let owner = 0;
  let exported: Gio.DBusExportedObject | null = null;
  let nextId = 1;
  const timers = new Map<number, number>();
  const cancel = (id: number) => {
    const timer = timers.get(id);
    if (timer) GLib.source_remove(timer);
    timers.delete(id);
  };
  const signal = (name: string, signature: string, values: unknown[]) =>
    exported?.emit_signal(name, new GLib.Variant(signature, values));
  function close(id: number, reason: number) {
    const item = items().find(n => n.id === id);
    if (!item) return;
    cancel(id);
    if (item.active) signal("NotificationClosed", "(uu)", [id, reason]);
    setItems(list => item.transient ? list.filter(n => n.id !== id)
      : list.map(n => n.id === id ? { ...n, active: false, popup: false } : n));
  }
  const service: NotificationService = {
    items, dnd, error,
    start() {
      if (owner) return;
      setError("");
      owner = Gio.bus_own_name(Gio.BusType.SESSION, "org.freedesktop.Notifications",
        Gio.BusNameOwnerFlags.DO_NOT_QUEUE,
        connection => {
          exported = Gio.DBusExportedObject.wrapJSObject(XML, {
            GetCapabilities: () => ["actions", "body", "persistence"],
            GetServerInformation: () => ["sysdef-notifications", "sysdef", "1.0", "1.2"],
            Notify(app: string, replaces: number, icon: string, summary: string, body: string,
              actions: string[], hints: Record<string, GLib.Variant>, timeout: number) {
              const previous = items().find(n => n.id === replaces && n.active);
              const id = previous ? previous.id : nextId++;
              cancel(id);
              const urgency = Number(hints.urgency?.deep_unpack() ?? 1);
              const item: Notification = {
                id, app: notificationText(app), summary: notificationText(summary),
                body: notificationText(body), actions: notificationActions(actions),
                transient: Boolean(hints.transient?.deep_unpack()),
                popup: !dnd(), icon: /^[\w.-]+$/.test(icon) ? icon : undefined,
                urgency, active: true,
              };
              const retained = retainNotification(items(), item);
              for (const old of items()) if (!retained.some(n => n.id === old.id)) {
                cancel(old.id);
                if (old.active) signal("NotificationClosed", "(uu)", [old.id, 4]);
              }
              setItems(retained);
              const duration = timeout < 0 ? (urgency === 2 ? 0 : 6000) : timeout;
              if (duration > 0) timers.set(id, GLib.timeout_add(GLib.PRIORITY_DEFAULT,
                Math.min(duration, 2147483647), () => {
                  timers.delete(id); close(id, 1); return GLib.SOURCE_REMOVE;
                }));
              return id;
            },
            CloseNotification: (id: number) => close(id, 3),
          });
          exported.export(connection, "/org/freedesktop/Notifications");
        }, () => { setError(""); }, () => {
          for (const id of timers.keys()) cancel(id);
          exported?.unexport(); exported = null;
          setItems(list => list.filter(n => !n.transient).map(n => ({ ...n, active: false, popup: false })));
          setError("Notifications unavailable: another daemon owns the name or the session bus disconnected.");
        });
    },
    stop() {
      for (const id of timers.keys()) cancel(id);
      exported?.unexport(); exported = null;
      if (owner) Gio.bus_unown_name(owner);
      owner = 0;
      setItems(list => list.filter(n => !n.transient).map(n => ({ ...n, active: false, popup: false })));
    },
    dismiss: id => close(id, 2),
    invoke(id, action) {
      const item = items().find(n => n.id === id);
      if (!item?.active || !item.actions.some(a => a.id === action)) return;
      signal("ActionInvoked", "(us)", [id, action]);
      close(id, 2);
    },
    clear() { for (const item of items()) close(item.id, 2); setItems([]); },
    toggleDnd() {
      setDnd(value => !value);
      if (dnd()) setItems(list => list.map(n => ({ ...n, popup: false })));
    },
  };
  onCleanup(() => service.stop());
  return service;
}
