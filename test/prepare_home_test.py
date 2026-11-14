import json
import os
from pathlib import Path
import pwd
import socket
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(os.environ.get("PREPARE_HOME_SCRIPT", Path(__file__).resolve().parents[1] / "scripts/prepare-home.py"))


class PrepareHomeTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.home = self.root / "home"
        self.checkout = self.root / "checkout"
        self.home.mkdir()
        self.checkout.mkdir()
        (self.checkout / "settings.json").write_text("shared")
        self.manifest = {
            "version": 1, "username": pwd.getpwuid(os.getuid()).pw_name,
            "home": str(self.home), "checkout": str(self.checkout),
            "legacyDirectoryLinks": {},
            "targets": [{"target": ".settings.json", "source": str(self.checkout / "settings.json")},
                        {"target": ".bashrc", "source": None}],
        }
        self.file = self.root / "manifest.json"

    def run_tool(self, *args):
        self.file.write_text(json.dumps(self.manifest))
        return subprocess.run([sys.executable, str(SCRIPT), "--manifest", str(self.file), *args],
                              env={**os.environ, "HOME": str(self.home)}, capture_output=True, text=True)

    def test_dry_run_does_not_write(self):
        (self.home / ".bashrc").write_text("original shell")
        result = self.run_tool()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(json.loads(result.stdout)["dryRun"])
        self.assertEqual((self.home / ".bashrc").read_text(), "original shell")
        self.assertFalse((self.home / ".local").exists())

    def test_apply_backs_up_without_following_leaf_symlinks(self):
        (self.home / ".settings.json").symlink_to(self.checkout / "settings.json")
        (self.home / ".bashrc").write_text("original shell")
        result = self.run_tool("--apply")
        self.assertEqual(result.returncode, 0, result.stderr)
        backup = Path(json.loads(result.stdout)["backup"])
        records = {record["target"]: backup / record["backup"] for record in json.loads((backup / "manifest.json").read_text())["records"]}
        self.assertTrue(records[".settings.json"].is_symlink())
        self.assertEqual(records[".bashrc"].read_text(), "original shell")
        self.assertEqual((self.checkout / "settings.json").read_text(), "shared")
        self.assertFalse((self.home / ".bashrc").exists())
        self.assertEqual(backup.stat().st_mode & 0o777, 0o700)
        self.assertEqual((backup / "manifest.json").stat().st_mode & 0o777, 0o600)

    def legacy_directory(self):
        source = self.checkout / "herdr"
        source.mkdir()
        (source / "settings.json").write_text("shared configuration")
        (source / "sessions.json").write_text("private local state")
        (self.home / ".config").mkdir()
        (self.home / ".config/herdr-app").symlink_to(source, target_is_directory=True)
        self.manifest["legacyDirectoryLinks"] = {".config/herdr-app": str(source)}
        self.manifest["targets"] = [{"target": ".config/herdr-app/settings.json", "source": str(source / "settings.json")}]
        return source

    def test_legacy_root_symlink_blocks_before_any_moves(self):
        source = self.legacy_directory()
        result = self.run_tool("--apply")
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertIn("nothing was changed", result.stdout)
        self.assertTrue((self.home / ".config/herdr-app").is_symlink())
        self.assertTrue((source / "settings.json").exists())
        self.assertFalse((self.home / ".local").exists())

    def test_explicit_detach_preserves_runtime_and_never_moves_checkout_files(self):
        source = self.legacy_directory()
        server = socket.socket(socket.AF_UNIX)
        self.addCleanup(server.close)
        # Nix build TMPDIR paths can exceed AF_UNIX's 108-byte path limit.
        previous = Path.cwd()
        try:
            os.chdir(source)
            server.bind("herdr-app.sock")
        finally:
            os.chdir(previous)
        result = self.run_tool("--apply", "--detach-legacy-dirs")
        self.assertEqual(result.returncode, 0, result.stderr)
        destination = self.home / ".config/herdr-app"
        self.assertFalse(destination.is_symlink())
        self.assertEqual((destination / "sessions.json").read_text(), "private local state")
        self.assertFalse((destination / "settings.json").exists())
        self.assertFalse((destination / "herdr-app.sock").exists())
        self.assertEqual((source / "settings.json").read_text(), "shared configuration")
        self.assertEqual((source / "sessions.json").read_text(), "private local state")
        backup = Path(json.loads(result.stdout)["backup"])
        journal = json.loads((backup / "manifest.json").read_text())
        self.assertIn(str(source / "herdr-app.sock"), journal["skippedSpecialFiles"])
        self.assertTrue((backup / journal["records"][0]["backup"]).is_symlink())

    def test_nested_legacy_links_use_independent_backup_slots(self):
        source = self.legacy_directory()
        nested_source = self.checkout / "opencode"
        nested_source.mkdir()
        (nested_source / "settings.json").write_text("nested configuration")
        (source / "opencode").symlink_to(nested_source)
        original_inode = (source / "opencode").lstat().st_ino
        nested = ".config/herdr-app/opencode"
        self.manifest["legacyDirectoryLinks"][nested] = str(nested_source)
        self.manifest["targets"] = [{"target": nested + "/settings.json", "source": str(nested_source / "settings.json")}]
        result = self.run_tool("--apply", "--detach-legacy-dirs")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((source / "opencode").lstat().st_ino, original_inode)
        self.assertEqual((nested_source / "settings.json").read_text(), "nested configuration")
        self.assertFalse((self.home / nested).is_symlink())
        backup = Path(json.loads(result.stdout)["backup"])
        records = json.loads((backup / "manifest.json").read_text())["records"]
        self.assertEqual(len(records), 3)
        for record in records:
            self.assertEqual((backup / record["backup"]).parent.resolve(), backup / "objects")

    def test_unrecognized_symlink_ancestor_is_never_traversed(self):
        outside = self.root / "outside"
        outside.mkdir()
        (outside / "keep").write_text("must not change")
        (self.home / ".config").symlink_to(outside)
        self.manifest["targets"] = [{"target": ".config/keep", "source": None}]
        result = self.run_tool("--apply", "--detach-legacy-dirs")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("unmanaged directory symlink", result.stderr)
        self.assertEqual((outside / "keep").read_text(), "must not change")
        self.assertFalse((self.home / ".local").exists())

    def test_path_escapes_wrong_home_and_overlaps_fail_before_mutations(self):
        for target in ["../outside", "/etc/passwd", ".", ".local", ".local/state/home-manager-migration", "a//b"]:
            self.manifest["targets"] = [{"target": target, "source": None}]
            self.assertNotEqual(self.run_tool("--apply").returncode, 0)
        self.manifest["targets"] = [{"target": ".config", "source": None}, {"target": ".config/child", "source": None}]
        self.assertNotEqual(self.run_tool("--apply").returncode, 0)
        self.manifest["home"] = str(self.root / "wrong")
        self.assertNotEqual(self.run_tool("--apply").returncode, 0)
        self.assertFalse((self.home / ".local").exists())

    def test_existing_home_manager_links_are_not_removed(self):
        (self.home / ".settings.json").symlink_to("/nix/store/example-home-manager-files/.settings.json")
        result = self.run_tool("--apply")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((self.home / ".settings.json").is_symlink())
        backup = Path(json.loads(result.stdout)["backup"])
        self.assertEqual(json.loads((backup / "manifest.json").read_text())["records"], [])

    def test_missing_source_fails_before_backup(self):
        self.manifest["targets"][0]["source"] = str(self.checkout / "missing")
        result = self.run_tool("--apply")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Missing checkout source", result.stderr)
        self.assertFalse((self.home / ".local").exists())


if __name__ == "__main__":
    unittest.main()
