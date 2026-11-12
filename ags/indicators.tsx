import { For, createComputed, onCleanup } from "ags";
import { Astal, Gtk, Gdk } from "ags/gtk4";
import app from "ags/gtk4/app";
import type { Notification, NotificationService } from "./services/notifications";
import type { TrayService } from "./services/tray";

export function Tray({ service }: { service: TrayService }): Gtk.Widget {
  return <box class="tray" spacing={4}>
    <label class="danger" label="Tray unavailable" visible={service.error(value => !!value)} tooltipText={service.error} />
    <For each={service.items}>{item => <button tooltipText={item.title}
      visible={item.status !== "Passive"} onClicked={self => item.isMenu ? item.menu(self) : item.activate()}>
      {item.paintable ? <image paintable={item.paintable} pixelSize={18} /> : <image iconName={item.iconName} pixelSize={18} />}
      <Gtk.GestureClick button={Gdk.BUTTON_SECONDARY} onPressed={gesture => {
        gesture.set_state(Gtk.EventSequenceState.CLAIMED);
        item.menu(gesture.get_widget()!);
      }} />
      <Gtk.GestureClick button={Gdk.BUTTON_MIDDLE} onPressed={gesture => {
        gesture.set_state(Gtk.EventSequenceState.CLAIMED); item.secondaryActivate();
      }} />
    </button>}</For>
  </box> as Gtk.Widget;
}

function NotificationCard({ item, service }: { item: Notification; service: NotificationService }): Gtk.Widget {
  return <box class="notification" orientation={Gtk.Orientation.VERTICAL} spacing={6}>
    <box spacing={6}>
      <label class="muted" label={item.app} useMarkup={false} hexpand xalign={0} ellipsize={3} />
      <button label="×" tooltipText="Dismiss notification" onClicked={() => service.dismiss(item.id)} />
    </box>
    <label class="notification-title" label={item.summary} useMarkup={false} wrap lines={2} ellipsize={3} xalign={0} maxWidthChars={46} />
    <label class="notification-body" label={item.body} useMarkup={false} wrap lines={6} ellipsize={3} xalign={0} maxWidthChars={46} visible={!!item.body} />
    <box orientation={Gtk.Orientation.VERTICAL} spacing={4}>{item.actions.map(action => <button
      sensitive={service.error(value => item.active && !value)} onClicked={() => service.invoke(item.id, action.id)}>
      <label label={action.label} useMarkup={false} wrap lines={2} ellipsize={3} maxWidthChars={40} />
    </button>)}</box>
  </box> as Gtk.Widget;
}

export function NotificationList({ service }: { service: NotificationService }): Gtk.Widget {
  return <box class="panel" orientation={Gtk.Orientation.VERTICAL} spacing={8} widthRequest={360}>
    <box spacing={8}>
      <button label={service.dnd(value => value ? "DND: on" : "DND: off")} onClicked={() => service.toggleDnd()} />
      <button label="Clear history" sensitive={service.items(items => items.length > 0)} onClicked={() => service.clear()} />
    </box>
    <label class="danger" label={service.error} visible={service.error(value => !!value)} wrap useMarkup={false} />
    <label class="muted" label="No notifications" visible={service.items(items => items.length === 0)} />
    <scrolledwindow vexpand maxContentHeight={580} propagateNaturalHeight hscrollbarPolicy={Gtk.PolicyType.NEVER}>
      <box orientation={Gtk.Orientation.VERTICAL} spacing={8}>
        <For each={service.items}>{item => <NotificationCard item={item} service={service} />}</For>
      </box>
    </scrolledwindow>
  </box> as Gtk.Widget;
}

export function NotificationPopups({ service, monitor }: { service: NotificationService; monitor: Gdk.Monitor }): Astal.Window {
  const popups = createComputed(() => service.items().filter(item => item.popup).slice(0, 3));
  const window = <window name={`sysdef-notifications-${monitor.connector ?? "monitor"}`}
    application={app} namespace="sysdef-notifications" gdkmonitor={monitor} layer={Astal.Layer.OVERLAY}
    anchor={Astal.WindowAnchor.TOP | Astal.WindowAnchor.RIGHT}
    exclusivity={Astal.Exclusivity.IGNORE} keymode={Astal.Keymode.NONE}
    marginTop={42} marginRight={12} visible={popups(items => items.length > 0)}>
    <scrolledwindow maxContentHeight={Math.max(160, Math.min(720, monitor.geometry.height - 100))}
      propagateNaturalHeight hscrollbarPolicy={Gtk.PolicyType.NEVER}>
      <box orientation={Gtk.Orientation.VERTICAL} spacing={8} widthRequest={360}>
        <For each={popups}>{item => <NotificationCard item={item} service={service} />}</For>
      </box>
    </scrolledwindow>
  </window> as Astal.Window;
  onCleanup(() => window.destroy());
  return window;
}
