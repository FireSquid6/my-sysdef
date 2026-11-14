import { Gtk } from "ags/gtk4"
import { SLIDERS, sliderLabel } from "./landscape-controls-model"
import type { LandscapeControlsService } from "./services/landscape-controls"

export function LandscapeControls({ service, register, track }: {
  service: LandscapeControlsService; register: (widget: Gtk.Widget) => void; track: (widget: Gtk.Widget) => void
}) {
  const toggle = <Gtk.Switch $={register} onNotifyHasFocus={track} class="landscape-sync" valign={Gtk.Align.CENTER}
    active={service.state(s => s.settings.sync)} tooltipText="Use the real clock, weather, moon, farm growth and CPU load"
    onNotifyActive={(self: Gtk.Switch) => { if (self.active !== service.state().settings.sync) service.toggleSync() }} />
  const sliders = SLIDERS.map(({ key, label, min, max, step }) => {
    const adjustment = <Gtk.Adjustment lower={min} upper={max} stepIncrement={step} pageIncrement={step * 5}
      value={service.state(s => s.settings.manual[key])}
      onValueChanged={(self: Gtk.Adjustment) => service.set(key, self.value)} /> as Gtk.Adjustment
    return <box orientation={Gtk.Orientation.VERTICAL} spacing={2}>
      <box><label label={label} hexpand xalign={0} class="sidebar-detail" />
        <label label={service.state(s => sliderLabel(key, s.settings.manual[key]))} xalign={1} class="sidebar-detail" /></box>
      <Gtk.Scale $={register} onNotifyHasFocus={track} class={`landscape-slider landscape-${key}`} hexpand
        adjustment={adjustment} drawValue={false} orientation={Gtk.Orientation.HORIZONTAL}
        tooltipText={`${label} · arrow keys adjust; Tab moves between controls`} />
    </box>
  })
  return <box orientation={Gtk.Orientation.VERTICAL} spacing={8} class="sidebar-section landscape-controls">
    <label label="Landscape controls" class="sidebar-heading" xalign={0} />
    <box spacing={12}>
      <label label="Sync with real life" hexpand xalign={0} />
      {toggle}
    </box>
    <label class="sidebar-detail" wrap xalign={0} label={service.state(s => s.settings.sync
      ? "Live conditions. Turn sync off to adjust the landscape below."
      : "Manual preview · saved farm growth is untouched. Season selects the crop; winter is fallow. Tab between sliders; arrows adjust.")} />
    <box orientation={Gtk.Orientation.VERTICAL} spacing={8} sensitive={service.state(s => !s.settings.sync)}>{sliders}</box>
    <label class="danger" wrap xalign={0} visible={service.state(s => !!s.error)} label={service.state(s => s.error)} />
  </box>
}
