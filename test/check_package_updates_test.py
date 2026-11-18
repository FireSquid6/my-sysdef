import contextlib
import importlib.util
import io
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("updates", ROOT / "scripts/check-package-updates.py")
updates = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(updates)


def release(version, asset, prerelease=False):
    return {"tag_name": version, "draft": False, "prerelease": prerelease,
            "assets": [{"name": asset}]}


class PackageUpdateTests(unittest.TestCase):
    def test_release_requires_matching_asset(self):
        releases = [release("v3.0.0", "mdserve-linux-x64", prerelease=True),
                    release("v2.1.1", "notesview-linux-x64"),
                    release("v1.0.0", "mdserve-linux-x64")]
        with patch.object(updates, "github", return_value=releases):
            self.assertEqual(updates.latest_release("owner/repo", "mdserve-linux-x64"), "1.0.0")

    def test_missing_asset_is_an_error(self):
        with patch.object(updates, "github", return_value=[]):
            with self.assertRaisesRegex(ValueError, "latest 100 releases"):
                updates.latest_release("owner/repo", "app-{version}.tgz")

    def test_versioned_asset(self):
        with patch.object(updates, "github", return_value=[release("v2.0.4", "app-2.0.4.tgz")]):
            self.assertEqual(updates.latest_release("owner/repo", "app-{version}.tgz"), "2.0.4")

    def test_numeric_version_comparison(self):
        self.assertGreater(updates.version_number("v2.10.0"), updates.version_number("2.9.0"))
        with self.assertRaises(ValueError):
            updates.version_number("2.0.0-rc1")

    def test_registry_updates(self):
        for latest, status in (("5.2.6", "UPDATE"), ("5.2.5", "current"), ("5.2.4", "current")):
            with self.subTest(latest=latest):
                with patch.object(updates, "pinned_version", return_value="5.2.5"):
                    with patch.object(updates, "fetch", return_value='{"version":"' + latest + '"}'):
                        self.assertIn(f": {status} ", updates.check("md-to-pdf"))

    def test_python_registry_metadata(self):
        with patch.object(updates, "pinned_version", return_value="0.13.8"):
            with patch.object(updates, "fetch", return_value='{"info":{"version":"0.14.0"}}'):
                self.assertIn(": UPDATE ", updates.check("browser-use"))

    def test_s_nail_download_index(self):
        with patch.object(updates, "fetch", return_value="s-nail-14.9.25.tar.xz s-nail-14.10.0.tar.xz"):
            self.assertIn("latest 14.10.0", updates.check("s-nail"))

    def test_git_pin_status(self):
        with patch.object(updates, "source_revision", return_value=("a" * 40, "owner/repo", "master")):
            with patch.object(updates, "github", return_value={"sha": "b" * 40}) as mocked:
                self.assertIn("PIN DIFFERS", updates.check("herdr-desktop"))
        mocked.assert_called_once_with("owner/repo/commits/master")

    def test_all_pins_are_readable(self):
        for name, (recipe, _, _) in {**updates.RELEASES, **updates.REGISTRIES}.items():
            with self.subTest(package=name):
                updates.version_number(updates.pinned_version(recipe))
        for name in [*updates.FLAKE_PACKAGES, "kvantum-tokyo-night"]:
            with self.subTest(package=name):
                revision, repo, branch = updates.source_revision(name)
                self.assertRegex(revision, r"^[0-9a-f]{40}$")
                self.assertIn("/", repo)
                self.assertTrue(branch)

    def test_package_filter(self):
        with patch.object(updates, "check", return_value="current") as mocked:
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(updates.main(["-p", "herdr-desktop"]), 0)
        mocked.assert_called_once_with("herdr-desktop")

    def test_failure_continues(self):
        def check(name):
            if name == "browser-use":
                raise OSError("network unavailable")
            return f"{name}: current"

        output = io.StringIO()
        with patch.object(updates, "check", side_effect=check) as mocked:
            with contextlib.redirect_stdout(output):
                self.assertEqual(updates.main([]), 1)
        self.assertEqual(mocked.call_count, len(updates.PACKAGES))
        self.assertIn("browser-use: ERROR: network unavailable", output.getvalue())
        self.assertIn("youtube-music-for-desktop: current", output.getvalue())


if __name__ == "__main__":
    unittest.main()
