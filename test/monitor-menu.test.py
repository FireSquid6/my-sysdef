"""Headless contract checks; opt into the actual GTK keyboard test inside Hyprland."""
import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("monitor_menu", Path(__file__).resolve().parents[1] / "scripts/monitor-menu.py")
menu = importlib.util.module_from_spec(spec)
spec.loader.exec_module(menu)


class MenuTests(unittest.TestCase):
    def test_controller_status_contract(self):
        value = {"primary": "eDP-1", "primaryAssignment": None,
                 "monitors": [{"name": "eDP-1", "primary": True}],
                 "workspaces": [{"name": "S", "monitor": "eDP-1", "assignment": None, "mode": "tiling"}]}
        with patch.object(menu, "run_json", return_value=value):
            self.assertEqual(menu.controller_status(), value)
        value["workspaces"][0]["mode"] = "invalid"
        with patch.object(menu, "run_json", return_value=value):
            with self.assertRaises(ValueError):
                menu.controller_status()

    def test_singleton_toggle_and_cleanup(self):
        with tempfile.TemporaryDirectory(prefix="sysdef-menu-test-") as runtime, patch.dict(os.environ, {"XDG_RUNTIME_DIR": runtime}):
            first, second = menu.Singleton(), menu.Singleton()
            try:
                self.assertTrue(first.acquire_or_toggle())
                self.assertFalse(second.acquire_or_toggle())
                peer, _ = first.server.accept()
                peer.close()
            finally:
                second.close()
                first.close()
            self.assertFalse(Path(first.path).exists())

    def test_singleton_rejects_unsafe_directory(self):
        with tempfile.TemporaryDirectory(prefix="sysdef-menu-test-") as runtime, patch.dict(os.environ, {"XDG_RUNTIME_DIR": runtime}):
            Path(runtime, "sysdef-monitor-menu").mkdir(mode=0o777)
            Path(runtime, "sysdef-monitor-menu").chmod(0o777)
            with self.assertRaisesRegex(RuntimeError, "Unsafe singleton directory"):
                menu.Singleton()

    @unittest.skipUnless(os.environ.get("SYSDEF_TEST_LIVE_GTK") == "1", "Opt-in live Hyprland/GTK check")
    def test_live_keyboard_navigation(self):
        Gdk, GLib, Gtk, Layer = menu.load_gtk()
        Gtk.init_check(None)
        self.assertTrue(Layer.is_supported())
        singleton = menu.Singleton()
        self.assertTrue(singleton.acquire_or_toggle(), "Close the existing monitor menu before this test")
        errors = []
        main = Gtk.main

        def verify():
            window = next(w for w in Gtk.Window.list_toplevels() if w.get_title() == "Monitor manager")
            try:
                notebook = next(w for w in window.get_child().get_children() if isinstance(w, Gtk.Notebook))
                self.assertEqual(notebook.get_n_pages(), 2)
                self.assertEqual(notebook.get_current_page(), 0)
                def key(name):
                    event = Gdk.Event.new(Gdk.EventType.KEY_PRESS)
                    event.keyval = Gdk.keyval_from_name(name)
                    window.emit("key-press-event", event)
                key("Tab")
                self.assertEqual(notebook.get_current_page(), 1)
                rows = notebook.get_nth_page(1).get_child().get_child()
                self.assertEqual(len(rows.get_children()), 13)
                self.assertEqual(rows.get_selected_row().choice, "S")
                key("Down")
                self.assertEqual(rows.get_selected_row().choice, "G")
                key("Up")
                self.assertEqual(rows.get_selected_row().choice, "S")
                screenshot = os.environ.get("SYSDEF_TEST_SCREENSHOT")
                if screenshot:
                    layers = json.loads(subprocess.check_output(["hyprctl", "-j", "layers"]))
                    surface = next(s for m in layers.values() for ss in m["levels"].values() for s in ss if s["namespace"] == "sysdef-monitor-menu")
                    bounds = f'{surface["x"]},{surface["y"]} {surface["w"]}x{surface["h"]}'
                    subprocess.run(["grim", "-g", bounds, screenshot], check=True)
                key("Escape")
            except Exception as error:
                errors.append(error)
                window.destroy()
            return False

        def timed_main():
            GLib.timeout_add(1000, verify)
            main()
        try:
            with patch.object(Gtk, "main", timed_main):
                menu.show_menu(singleton, (Gdk, GLib, Gtk, Layer))
        finally:
            singleton.close()
        if errors:
            raise errors[0]


if __name__ == "__main__":
    unittest.main()
