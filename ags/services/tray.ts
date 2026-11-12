import { createState, onCleanup, type Accessor } from "ags";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Gtk from "gi://Gtk?version=4.0";
import Gdk from "gi://Gdk?version=4.0";
import { trayPixels } from "../tray-model";

export interface TrayItem {
  id: string;
  title: string;
  iconName: string;
  paintable?: Gdk.Paintable;
  status: string;
  isMenu: boolean;
  activate(x?: number, y?: number): void;
  secondaryActivate(x?: number, y?: number): void;
  menu(widget: Gtk.Widget): void;
}
export interface TrayService {
  items: Accessor<TrayItem[]>;
  error: Accessor<string>;
  start(): void;
  stop(): void;
}
const IFACE = "org.kde.StatusNotifierItem";
const WATCHER = "org.kde.StatusNotifierWatcher";
const XML = `<node><interface name="${WATCHER}">
<method name="RegisterStatusNotifierItem"><arg type="s" direction="in"/></method>
<method name="RegisterStatusNotifierHost"><arg type="s" direction="in"/></method>
<property name="RegisteredStatusNotifierItems" type="as" access="read"/>
<property name="IsStatusNotifierHostRegistered" type="b" access="read"/>
<property name="ProtocolVersion" type="i" access="read"/>
<signal name="StatusNotifierItemRegistered"><arg type="s"/></signal>
<signal name="StatusNotifierItemUnregistered"><arg type="s"/></signal>
<signal name="StatusNotifierHostRegistered"/>
<signal name="StatusNotifierHostUnregistered"/>
</interface></node>`;
const unpack = (value: unknown): any => value instanceof GLib.Variant ? value.deep_unpack() : value;
const text = (value: unknown) => String(unpack(value) ?? "").replace(/\u0000/g, "").slice(0, 1024);
const safeIcon = (value: unknown) => /^[\w.-]+$/.test(text(value)) ? text(value) : "application-x-executable-symbolic";

export function createTrayService(): TrayService {
  const [items, setItems] = createState<TrayItem[]>([]);
  const [error, setError] = createState("");
  let owner = 0;
  let connection: Gio.DBusConnection | null = null;
  let exported: Gio.DBusExportedObject | null = null;
  let generation = 0;
  const entries = new Map<string, { watch: number; subscription: number }>();
  const hosts = new Map<string, number>();
  const popovers = new Set<Gtk.Popover>();
  function call(bus: string, path: string, iface: string, method: string,
    args: GLib.Variant | null, done?: (value: any) => void) {
    const epoch = generation;
    connection?.call(bus, path, iface, method, args, null, Gio.DBusCallFlags.NONE,
      4000, null, (conn, result) => {
        if (epoch !== generation) return;
        try {
          const value = conn!.call_finish(result).deep_unpack();
          done?.(value);
        }
        catch (e) { setError(`Tray ${method}: ${String(e)}`); }
      });
  }
  function changed() {
    exported?.emit_property_changed("RegisteredStatusNotifierItems", new GLib.Variant("as", [...entries.keys()]));
  }
  function remove(id: string) {
    const entry = entries.get(id);
    if (!entry) return;
    Gio.bus_unwatch_name(entry.watch);
    connection?.signal_unsubscribe(entry.subscription);
    entries.delete(id);
    setItems(list => list.filter(item => item.id !== id));
    exported?.emit_signal("StatusNotifierItemUnregistered", new GLib.Variant("(s)", [id]));
    changed();
  }
  function register(address: string, sender: string) {
    const slash = address.indexOf("/");
    const bus = address.startsWith("/") ? sender : slash < 0 ? address : address.slice(0, slash);
    const path = address.startsWith("/") ? address : slash < 0 ? "/StatusNotifierItem" : address.slice(slash);
    if (!Gio.dbus_is_name(bus) || !GLib.Variant.is_object_path(path)) throw new Error("Invalid tray address");
    const id = bus + path;
    if (entries.has(id) || !connection) return;
    const send = (method: string, x = 0, y = 0) => call(bus, path, IFACE, method, new GLib.Variant("(ii)", [Math.round(x), Math.round(y)]));
    function refresh() {
      call(bus, path, "org.freedesktop.DBus.Properties", "GetAll", new GLib.Variant("(s)", [IFACE]), result => {
        if (!entries.has(id)) return;
        const props = result[0];
        const attention = text(props.Status) === "NeedsAttention";
        const pixels = (attention ? trayPixels(unpack(props.AttentionIconPixmap)) : null) ?? trayPixels(unpack(props.IconPixmap));
        const paintable = pixels ? Gdk.MemoryTexture.new(pixels.width, pixels.height, Gdk.MemoryFormat.R8G8B8A8, pixels.rgba, pixels.width * 4) : undefined;
        const item: TrayItem = {
          id, title: text(props.Title) || text(props.Id) || bus,
          iconName: safeIcon(text(props.Status) === "NeedsAttention" ? text(props.AttentionIconName) || props.IconName : props.IconName),
          paintable, isMenu: props.ItemIsMenu !== undefined ? Boolean(unpack(props.ItemIsMenu)) : !!text(props.Menu) && text(props.Menu) !== "/",
          status: text(props.Status), activate: (x, y) => send("Activate", x, y),
          secondaryActivate: (x, y) => send("SecondaryActivate", x, y),
          menu(widget) {
            const menuPath = text(props.Menu);
            if (!GLib.Variant.is_object_path(menuPath) || menuPath === "/") { send("ContextMenu"); return; }
            const menuIface = "com.canonical.dbusmenu";
            call(bus, menuPath, menuIface, "AboutToShow", new GLib.Variant("(i)", [0]), () => {
              call(bus, menuPath, menuIface, "GetLayout", new GLib.Variant("(iias)", [0, -1, []]), layout => {
                if (!entries.has(id) || !widget.get_root()) return;
                const popover = new Gtk.Popover({ autohide: true, has_arrow: true });
                const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 3 });
                popover.set_child(box);
                // Build bounded nested submenus as indented rows; no remote markup or icon paths.
                let count = 0;
                function render(raw: unknown, depth: number) {
                  if (++count > 200 || depth > 8) return;
                  const [nodeId, properties, children] = unpack(raw);
                  if (unpack(properties.visible) === false) return;
                  if (text(properties.type) === "separator") box.append(new Gtk.Separator());
                  else if (nodeId !== 0) {
                    const toggle = text(properties["toggle-type"]);
                    const checked = Number(unpack(properties["toggle-state"])) === 1;
                    const label = `${"  ".repeat(depth)}${toggle ? checked ? "✓ " : "○ " : ""}${text(properties.label).replace(/_/g, "")}`;
                    const button = new Gtk.Button({ label, sensitive: unpack(properties.enabled) !== false });
                    button.connect("clicked", () => {
                      call(bus, menuPath, menuIface, "Event", new GLib.Variant("(isvu)", [nodeId, "clicked", new GLib.Variant("i", 0), 0]));
                      popover.popdown();
                    });
                    box.append(button);
                  }
                  for (const child of children ?? []) render(child, nodeId === 0 ? depth : depth + 1);
                }
                render(layout[1], 0);
                popover.set_parent(widget);
                popovers.add(popover);
                popover.connect("closed", () => { popovers.delete(popover); popover.unparent(); });
                popover.popup();
              });
            });
          },
        };
        setItems(list => [...list.filter(old => old.id !== id), item]);
      });
    }
    const subscription = connection.signal_subscribe(bus, null, null, path, null,
      Gio.DBusSignalFlags.NONE, () => refresh());
    const watch = Gio.bus_watch_name_on_connection(connection, bus, Gio.BusNameWatcherFlags.NONE,
      () => refresh(), () => remove(id));
    entries.set(id, { watch, subscription });
    exported?.emit_signal("StatusNotifierItemRegistered", new GLib.Variant("(s)", [id]));
    changed();
    refresh();
  }
  const service: TrayService = {
    items, error,
    start() {
      if (owner) return;
      setError("");
      owner = Gio.bus_own_name(Gio.BusType.SESSION, WATCHER, Gio.BusNameOwnerFlags.DO_NOT_QUEUE,
        conn => {
          connection = conn;
          exported = Gio.DBusExportedObject.wrapJSObject(XML, {
            get RegisteredStatusNotifierItems() { return [...entries.keys()]; },
            get IsStatusNotifierHostRegistered() { return true; },
            get ProtocolVersion() { return 0; },
            RegisterStatusNotifierItemAsync([address]: [string], invocation: Gio.DBusMethodInvocation) {
              try {
                register(address, invocation.get_sender()!);
                invocation.return_value(new GLib.Variant("()", []));
              } catch (e) { invocation.return_dbus_error("org.freedesktop.DBus.Error.InvalidArgs", String(e)); }
            },
            RegisterStatusNotifierHostAsync([address]: [string], invocation: Gio.DBusMethodInvocation) {
              const bus = address.startsWith("/") ? invocation.get_sender()! : address;
              if (!Gio.dbus_is_name(bus)) {
                invocation.return_dbus_error("org.freedesktop.DBus.Error.InvalidArgs", "Invalid host name"); return;
              }
              if (!hosts.has(bus)) hosts.set(bus, Gio.bus_watch_name_on_connection(conn, bus,
                Gio.BusNameWatcherFlags.NONE, null, () => {
                  const watch = hosts.get(bus); if (watch) Gio.bus_unwatch_name(watch); hosts.delete(bus);
                }));
              invocation.return_value(new GLib.Variant("()", []));
            },
          });
          exported.export(conn, "/StatusNotifierWatcher");
        }, () => {
          setError("");
          exported?.emit_signal("StatusNotifierHostRegistered", new GLib.Variant("()", []));
        }, () => {
          generation++;
          for (const id of [...entries.keys()]) remove(id);
          for (const watch of hosts.values()) Gio.bus_unwatch_name(watch);
          hosts.clear();
          exported?.unexport(); exported = null;
          connection = null;
          setError("Tray unavailable: another StatusNotifierWatcher owns the name or the session bus disconnected.");
        });
    },
    stop() {
      generation++;
      for (const popover of popovers) { popover.unparent(); }
      popovers.clear();
      for (const id of [...entries.keys()]) remove(id);
      for (const watch of hosts.values()) Gio.bus_unwatch_name(watch);
      hosts.clear();
      exported?.unexport(); exported = null;
      if (owner) Gio.bus_unown_name(owner);
      owner = 0; connection = null;
      setItems([]);
    },
  };
  onCleanup(() => service.stop());
  return service;
}
