#!/usr/bin/env python3
"""Layer-shell monitor/workspace picker; controller owns persistence and policy."""

import argparse
import fcntl
import json
import os
from pathlib import Path
import socket
import stat
import subprocess
import sys
import threading
import time


CONTROLLER = Path(__file__).resolve().with_name("workspace-manager.ts")
ICONS = {"S": "", "G": "", "R": "󰚩", "N": "󰠮"}
CSS = b"""
window { background: #1a1b26; color: #c0caf5; }
notebook header { background: #16161e; border-color: #414868; }
notebook tab { padding: 10px 30px; }
notebook tab:checked { background: #292e42; color: #7aa2f7; }
label.title { font-size: 21px; font-weight: bold; color: #7aa2f7; }
label.hint, label.detail { color: #a9b1d6; font-size: 12px; }
label.error { color: #f7768e; }
list { background: #1a1b26; }
row { padding: 8px 12px; border-radius: 6px; }
row:selected { background: #292e42; color: #c0caf5; }
button { background: #24283b; color: #c0caf5; border-color: #414868;
         box-shadow: none; text-shadow: none; border-radius: 5px; }
button:hover { background: #414868; }
button:focus { border-color: #7aa2f7; }
scrolledwindow { border-color: #414868; }
"""


class Singleton:
    """Keep the flock until exit; a private socket toggles the lock holder.

    No PID files/signals: the socket is created only under the exclusive lock,
    inside an owner-only directory. Peer credentials also gate close requests.
    Clients retry while a lock holder is still preparing its listening socket.
    """

    def __init__(self):
        runtime = os.environ.get("XDG_RUNTIME_DIR")
        if not runtime:
            raise RuntimeError("XDG_RUNTIME_DIR is not set")
        directory = Path(runtime) / "sysdef-monitor-menu"
        try:
            directory.mkdir(mode=0o700)
        except FileExistsError:
            pass
        info = directory.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise RuntimeError("Unsafe singleton directory: " + str(directory))
        self.path = str(directory / "control.sock")
        self.fd = os.open(directory / "lock", os.O_RDWR | os.O_CREAT | os.O_CLOEXEC | os.O_NOFOLLOW, 0o600)
        info = os.fstat(self.fd)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid():
            os.close(self.fd)
            raise RuntimeError("Unsafe singleton lock")
        self.server = None
        self.owner = False

    def acquire_or_toggle(self):
        deadline = time.monotonic() + 5
        while True:
            try:
                fcntl.flock(self.fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                self.owner = True
                break
            except BlockingIOError:
                client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                try:
                    client.settimeout(0.2)
                    client.connect(self.path)
                    # Connecting is the request; the server checks SO_PEERCRED.
                    return False
                except (FileNotFoundError, ConnectionRefusedError, socket.timeout):
                    if time.monotonic() >= deadline:
                        raise RuntimeError("Existing menu is not responding")
                    time.sleep(0.05)
                finally:
                    client.close()
        try:
            os.unlink(self.path)
        except FileNotFoundError:
            pass
        self.server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.server.setblocking(False)
        self.server.bind(self.path)
        self.server.listen(8)
        return True

    def watch(self, GLib, close):
        def ready(_fd, _condition):
            import struct
            try:
                peer, _ = self.server.accept()
            except BlockingIOError:
                return True
            with peer:
                credentials = peer.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12)
                _, uid, _ = struct.unpack("3i", credentials)
                if uid == os.getuid():
                    close()
            return True

        GLib.io_add_watch(self.server.fileno(), GLib.PRIORITY_DEFAULT, GLib.IO_IN, ready)

    def close(self):
        if self.server is not None:
            self.server.close()
        if self.owner:
            try:
                os.unlink(self.path)
            except FileNotFoundError:
                pass
        os.close(self.fd)


def run_json(argv):
    result = subprocess.run(argv, capture_output=True, text=True, timeout=20, check=False)
    if result.returncode:
        raise RuntimeError((result.stderr or result.stdout).strip() or f"Command exited {result.returncode}")
    return json.loads(result.stdout)


def controller_status():
    data = run_json(["bun", str(CONTROLLER), "status"])
    # Reject malformed responses before replacing the last usable UI state.
    if not isinstance(data, dict):
        raise ValueError("Controller status must be an object")
    for monitor in data["monitors"]:
        if not isinstance(monitor["name"], str) or not isinstance(monitor["primary"], bool):
            raise ValueError("Invalid monitor in controller status")
    for workspace in data["workspaces"]:
        if (not isinstance(workspace["name"], str)
                or not isinstance(workspace["monitor"], str)
                or (workspace["assignment"] is not None and not isinstance(workspace["assignment"], str))
                or workspace["mode"] not in ("tiling", "floating")):
            raise ValueError("Invalid workspace in controller status")
    if not isinstance(data["primary"], str) or (data["primaryAssignment"] is not None
                                               and not isinstance(data["primaryAssignment"], str)):
        raise ValueError("Invalid primary assignment in controller status")
    return data


def load_gtk():
    import gi
    gi.require_version("Gtk", "3.0")
    gi.require_version("Gdk", "3.0")
    gi.require_version("GtkLayerShell", "0.1")
    from gi.repository import Gdk, GLib, Gtk, GtkLayerShell
    return Gdk, GLib, Gtk, GtkLayerShell


def show_menu(singleton, modules):
    Gdk, GLib, Gtk, Layer = modules

    class Menu:
        def __init__(self):
            self.state = None
            self.busy = False
            self.closed = False
            self.window = Gtk.Window(title="Monitor manager")
            self.window.set_default_size(600, 580)
            self.window.set_resizable(False)
            self.window.connect("destroy", self.quit)
            self.window.connect("key-press-event", self.key)
            Layer.init_for_window(self.window)
            Layer.set_namespace(self.window, "sysdef-monitor-menu")
            Layer.set_layer(self.window, Layer.Layer.OVERLAY)
            Layer.set_keyboard_mode(self.window, Layer.KeyboardMode.EXCLUSIVE)
            # No anchors: layer-shell centers this bounded surface on its output.
            provider = Gtk.CssProvider()
            provider.load_from_data(CSS)
            Gtk.StyleContext.add_provider_for_screen(Gdk.Screen.get_default(), provider,
                                                    Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
            root = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12)
            root.set_border_width(18)
            self.window.add(root)
            title = Gtk.Label(label="Monitor manager", xalign=0)
            title.get_style_context().add_class("title")
            root.pack_start(title, False, False, 0)
            self.tabs = Gtk.Notebook()
            self.tabs.set_hexpand(True)
            self.tabs.set_vexpand(True)
            root.pack_start(self.tabs, True, True, 0)
            self.lists = []
            for name in ("Primary", "Workspaces"):
                rows = Gtk.ListBox()
                rows.set_selection_mode(Gtk.SelectionMode.SINGLE)
                rows.set_activate_on_single_click(True)
                scroll = Gtk.ScrolledWindow()
                scroll.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
                scroll.add(rows)
                self.tabs.append_page(scroll, Gtk.Label(label=name))
                self.lists.append(rows)
            self.lists[0].connect("row-activated", self.activate_primary)
            self.tabs.connect("switch-page", lambda *_: GLib.idle_add(self.focus_selection))
            self.message = Gtk.Label(label="Loading…", xalign=0)
            self.message.set_line_wrap(True)
            self.message.set_max_width_chars(68)
            root.pack_start(self.message, False, False, 0)
            hint = Gtk.Label(label="Tab: page  •  ↑/↓: select  •  Enter: primary  •  ←/→: assignment  •  Esc: close")
            hint.set_line_wrap(True)
            hint.get_style_context().add_class("hint")
            root.pack_start(hint, False, False, 0)
            singleton.watch(GLib, self.window.destroy)
            # Discover the focused output off the GTK thread, before mapping.
            self.request(initial=True)

        def quit(self, *_):
            self.closed = True
            Gtk.main_quit()

        def focus_selection(self):
            rows = self.lists[self.tabs.get_current_page()]
            row = rows.get_selected_row()
            if row:
                row.grab_focus()
            return False

        def request(self, mutation=None, initial=False):
            if self.busy:
                return
            self.busy = True
            self.message.get_style_context().remove_class("error")
            self.message.set_text("Applying…" if mutation else "Loading…")

            def work():
                data, error, monitors = None, None, []
                if mutation:
                    try:
                        result = subprocess.run(["bun", str(CONTROLLER), *mutation], capture_output=True,
                                                text=True, timeout=20, check=False)
                        if result.returncode:
                            error = (result.stderr or result.stdout).strip() or "Controller mutation failed"
                    except Exception as exc:
                        error = str(exc)
                # Refresh even after a timeout/failure: saving may have preceded apply.
                try:
                    data = controller_status()
                except Exception as exc:
                    error = (error + "\n" if error else "") + str(exc)
                if initial:
                    try:
                        monitors = run_json(["hyprctl", "monitors", "-j"])
                    except Exception:
                        pass  # Compositor chooses an output if discovery is unavailable.
                GLib.idle_add(self.received, data, error, monitors, initial)

            threading.Thread(target=work, daemon=True).start()

        def received(self, data, error, monitors, initial):
            if self.closed:
                return False
            self.busy = False
            if data is not None:
                self.state = data
                self.render()
            if error:
                self.message.get_style_context().add_class("error")
                self.message.set_text("Error: " + error[:900])
            else:
                self.message.set_text("Changes are saved and applied immediately.")
            if initial:
                self.place(monitors)
                self.window.show_all()
                self.focus_selection()
            return False

        def place(self, monitors):
            focused = next((m for m in monitors if m.get("focused")), None)
            display = Gdk.Display.get_default()
            if not focused or not display:
                return
            for index in range(display.get_n_monitors()):
                monitor = display.get_monitor(index)
                geometry = monitor.get_geometry()
                # Hyprland output coordinates and GDK geometry are logical pixels.
                if (monitor.get_model() == focused.get("name") or
                        (geometry.x == focused.get("x") and geometry.y == focused.get("y"))):
                    Layer.set_monitor(self.window, monitor)
                    # Fit smaller laptop outputs without making the surface fullscreen.
                    self.window.set_default_size(min(600, max(300, geometry.width - 48)),
                                                 min(580, max(260, geometry.height - 48)))
                    break

        def render(self):
            previous = []
            had_primary_selection = self.lists[0].get_selected_row() is not None
            for rows in self.lists:
                selected = rows.get_selected_row()
                previous.append(getattr(selected, "choice", None))
                for child in rows.get_children():
                    rows.remove(child)
            primary = self.state["primaryAssignment"]
            for choice, label, description in [(None, "Automatic", "Follow controller policy")] + [
                    (m["name"], m["name"] + (" · current primary" if m["primary"] else ""), m.get("description") or "") for m in self.state["monitors"]]:
                row = Gtk.ListBoxRow()
                row.choice = choice
                text = label + ("  ✓" if choice == primary else "")
                box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=3)
                box.pack_start(Gtk.Label(label=text, xalign=0), False, False, 0)
                detail = Gtk.Label(label=description, xalign=0)
                detail.set_ellipsize(3)  # Pango.EllipsizeMode.END
                detail.get_style_context().add_class("detail")
                box.pack_start(detail, False, False, 0)
                row.add(box)
                self.lists[0].add(row)
                if choice == (previous[0] if had_primary_selection else primary):
                    self.lists[0].select_row(row)
            # Preserve controller order, including the named S/G/R/N workspaces.
            for workspace in self.state["workspaces"]:
                row = Gtk.ListBoxRow()
                row.choice = workspace["name"]
                box = Gtk.Box(spacing=10)
                info = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=3)
                info.pack_start(Gtk.Label(label=f'{workspace["name"]}  {ICONS.get(workspace["name"], "󰣆")}', xalign=0), False, False, 0)
                detail = Gtk.Label(label=f'{workspace["monitor"]} · {workspace["mode"]}', xalign=0)
                detail.get_style_context().add_class("detail")
                info.pack_start(detail, False, False, 0)
                box.pack_start(info, True, True, 0)
                for label, direction in [("‹", -1), (workspace["assignment"] or "Automatic", 1), ("›", 1)]:
                    button = Gtk.Button(label=label)
                    button.set_tooltip_text("Cycle saved monitor assignment")
                    button.connect("clicked", self.click_assignment, row, direction)
                    box.pack_start(button, False, False, 0)
                row.add(box)
                self.lists[1].add(row)
                if row.choice == previous[1]:
                    self.lists[1].select_row(row)
            for rows in self.lists:
                if rows.get_selected_row() is None:
                    rows.select_row(rows.get_row_at_index(0))
                rows.show_all()
            self.focus_selection()

        def activate_primary(self, _rows, row):
            if self.state:
                self.request(["primary", row.choice if row.choice is not None else "auto"])

        def click_assignment(self, _button, row, direction):
            self.lists[1].select_row(row)
            self.cycle(row, direction)

        def cycle(self, row, direction):
            if not self.state or row is None or self.busy:
                return
            workspace = next(w for w in self.state["workspaces"] if w["name"] == row.choice)
            choices = [None] + [m["name"] for m in self.state["monitors"]]
            current = workspace["assignment"]
            # A saved assignment to an unplugged monitor is not an effective assignment.
            index = choices.index(current) if current in choices else 0
            target = choices[(index + direction) % len(choices)]
            self.request(["assign", workspace["name"], target if target is not None else "auto"])

        def key(self, _window, event):
            name = Gdk.keyval_name(event.keyval)
            if name == "Escape":
                self.window.destroy()
            elif name in ("Tab", "ISO_Left_Tab"):
                self.tabs.set_current_page(1 - self.tabs.get_current_page())
            elif name in ("Up", "Down"):
                rows = self.lists[self.tabs.get_current_page()]
                row = rows.get_selected_row()
                count = len(rows.get_children())
                if count:
                    index = row.get_index() if row else 0
                    row = rows.get_row_at_index((index + (1 if name == "Down" else -1)) % count)
                    rows.select_row(row)
                    row.grab_focus()
            elif name in ("Left", "Right") and self.tabs.get_current_page() == 1:
                self.cycle(self.lists[1].get_selected_row(), 1 if name == "Right" else -1)
            elif name in ("Return", "KP_Enter") and self.tabs.get_current_page() == 0:
                row = self.lists[0].get_selected_row()
                if row:
                    self.activate_primary(self.lists[0], row)
            else:
                return False
            return True

    Menu()
    Gtk.main()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Check GTK3/layer-shell imports without opening a window")
    args = parser.parse_args()
    try:
        modules = load_gtk()
        if args.check:
            print("GTK 3 and GtkLayerShell dependencies are available (display not opened).")
            return 0
        singleton = Singleton()
        try:
            if singleton.acquire_or_toggle():
                Gtk = modules[2]
                initialized, _ = Gtk.init_check(None)
                if not initialized:
                    raise RuntimeError("Cannot initialize GTK display")
                if not modules[3].is_supported():
                    raise RuntimeError("Compositor does not support GTK layer shell")
                show_menu(singleton, modules)
        finally:
            singleton.close()
        return 0
    except Exception as exc:
        print(f"monitor-menu: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
