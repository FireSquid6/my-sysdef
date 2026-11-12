import app from "ags/gtk4/app"
import GLib from "gi://GLib?version=2.0"
import Gio from "gi://Gio?version=2.0"
import { run } from "./services/controller"
import { Astal, Gdk, Gtk } from "ags/gtk4"
import { createComputed, For, onCleanup } from "ags"
import { createPoll } from "ags/time"
import type { createController } from "./services/controller"
import type { createSystemService } from "./services/system"
import { Tray } from "./indicators"
import type { createTrayService } from "./services/tray"
import type { createNotificationService } from "./services/notifications"

export const BAR_WIDTHS = { audio: 96, battery: 84, notifications: 64 } as const
function Divider() {
  return <Gtk.Separator orientation={Gtk.Orientation.VERTICAL} valign={Gtk.Align.CENTER} class="bar-divider" />
}

export function Bar({ monitor, controller, system, tray, notifications, open, report }: {
  monitor: Gdk.Monitor
  controller: ReturnType<typeof createController>
  system: ReturnType<typeof createSystemService>
  tray: ReturnType<typeof createTrayService>
  notifications: ReturnType<typeof createNotificationService>
  open: (name: string, monitor?: Gdk.Monitor) => void
  report: (error: unknown) => void
}) {
  const name = monitor.connector ?? monitor.model ?? "output"
  const compact = monitor.geometry.width < 1800
  const workspaceWidth = compact ? 52 : 64
  const workspaces = createComputed(() => controller.desktop().workspaces.filter(w => w.monitor === name))
  const title = createComputed(() => {
    const output = controller.desktop().monitors.find(m => m.name === name)
    const active = output?.activeWorkspace?.name
    return controller.desktop().clients.filter(c => c.workspace.name === active).sort((a, b) => (a.focusHistoryID ?? 999) - (b.focusHistoryID ?? 999))[0]?.title ?? ""
  })
  const clock = createPoll("", 1000, () => GLib.DateTime.new_now_local().format(compact ? "%a %d %b · %H:%M" : "%A, %B %d | %I:%M:%S %p") ?? "")
  const window = <window name={`bar-${name}`} application={app} namespace="sysdef-bar" visible
    gdkmonitor={monitor} layer={Astal.Layer.TOP} exclusivity={Astal.Exclusivity.EXCLUSIVE}
    anchor={Astal.WindowAnchor.TOP | Astal.WindowAnchor.LEFT | Astal.WindowAnchor.RIGHT}
    class="sysdef-bar">
    <centerbox class="bar-content">
      <box $type="start" spacing={2}>
        <box class="workspaces" spacing={1}>
          <For each={workspaces}>{workspace => <button widthRequest={workspaceWidth} hexpand={false}
            class={`workspace ${workspace.mode}${workspace.active ? " active" : ""}${workspace.occupied ? " occupied" : ""}`}
            tooltipText={`${workspace.name} · ${workspace.mode} · ${workspace.monitor}`}
            onClicked={() => { void controller.controller("focus", workspace.name).catch(report) }}>
            <label label={`${workspace.name} ${workspace.icon} ${workspace.mode === "tiling" ? "▦" : "◇"}`} maxWidthChars={1} ellipsize={3} />
          </button>}</For>
        </box>
        <button class="window-title" visible={!compact} tooltipText={title} onClicked={() => open("windows", monitor)}>
          <label label={title} ellipsize={3} maxWidthChars={20} />
        </button>
      </box>
      <box $type="center" />
      <box $type="end" spacing={0}>
        <box visible={createComputed(() => tray.items().length > 0 || !!tray.error())}><Tray service={tray} /><Divider /></box>
        <box visible={createComputed(() => !!(controller.error() || system.state().error))}>
          <button class="bar-error" label="" tooltipText={createComputed(() => [controller.error(), system.state().error].filter(Boolean).join("\n"))}
            onClicked={() => open("sidebar", monitor)} /><Divider />
        </box>
        <button widthRequest={BAR_WIDTHS.notifications} hexpand={false} class="status-chip notifications-chip"
          tooltipText="Notifications · Super+B" onClicked={() => open("notifications", monitor)}>
          <label label={notifications.items(items => `󰂚 ${items.length || ""}`)} maxWidthChars={1} ellipsize={3} />
        </button>
        <Divider />
        <box visible={system.state(s => !!s.battery)}>
          <box widthRequest={BAR_WIDTHS.battery} hexpand={false} valign={Gtk.Align.CENTER}
            class={system.state(s => `status-readout battery ${s.batteryClass}`)} tooltipText={system.state(s => s.batteryDetail)}>
            <label label={system.state(s => s.battery)} maxWidthChars={1} ellipsize={3} hexpand />
          </box>
          <Divider />
        </box>
        <button widthRequest={BAR_WIDTHS.audio} hexpand={false} class="status-chip volume" tooltipText="Audio settings · Scroll: volume · Right click: mute"
          onClicked={() => { try { Gio.Subprocess.new(["pavucontrol"], Gio.SubprocessFlags.NONE) } catch (e) { report(e) } }}>
          <label label={system.state(s => s.volume)} maxWidthChars={1} ellipsize={3} />
          <Gtk.EventControllerScroll flags={Gtk.EventControllerScrollFlags.VERTICAL} onScroll={(_self, _dx, dy) => {
            if (dy) void run(["pamixer", dy < 0 ? "-i" : "-d", "1"]).then(system.update).catch(report)
            return true
          }} />
          <Gtk.GestureClick button={3} onPressed={() => { void run(["pamixer", "-t"]).then(system.update).catch(report) }} />
        </button>
        <Divider />
        <button class="status-chip network" tooltipText={system.state(s => s.network)} onClicked={() => open("network", monitor)}>
          <label label={system.state(s => s.network)} ellipsize={3} maxWidthChars={compact ? 12 : 22} />
        </button>
        <Divider />
        <button label={clock} class="status-chip clock" tooltipText="Calendar" onClicked={() => open("calendar", monitor)} />
        <Divider />
        <button label="󰍜" class="bar-settings" tooltipText="Monitors · Super+M" onClicked={() => open("monitors", monitor)} />
        <Divider />
        <button label="⏻" class="bar-power" tooltipText="Sidebar · Super+P" onClicked={() => open("sidebar", monitor)} />
      </box>
    </centerbox>
  </window> as Astal.Window
  onCleanup(() => window.destroy())
  return window
}
