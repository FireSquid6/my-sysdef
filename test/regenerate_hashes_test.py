import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/regenerate-hashes.py"
SPEC = importlib.util.spec_from_file_location("regenerate_hashes", SCRIPT)
hashes = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(hashes)

OLD = "sha256-" + "B" * 43 + "="
NEW = "sha256-" + "C" * 43 + "="
MISMATCH = (
    "error: hash mismatch in fixed-output derivation '/nix/store/vendor.drv':\n"
    f" specified: {hashes.FAKE_HASH}\n got: {NEW}\n"
)


def result(code, output=""):
    return subprocess.CompletedProcess([], code, stdout=output)


class RegenerateHashesTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.recipe = self.root / "package.nix"
        self.original = f'{{ hash = "{OLD}"; unrelated = "preserved"; }}\n'
        self.recipe.write_text(self.original)

    def regenerate(self):
        hashes.regenerate(self.root, self.recipe, "example.src", OLD)

    def test_regenerates_then_verifies_before_keeping_hash(self):
        def build(root, target):
            self.assertEqual(target, "example.src")
            if hashes.FAKE_HASH in self.recipe.read_text():
                return result(1, MISMATCH)
            self.assertEqual(self.recipe.read_text(), self.original.replace(OLD, NEW))
            return result(0)

        with patch.object(hashes, "build", side_effect=build) as mocked:
            self.regenerate()
        self.assertEqual(mocked.call_count, 2)
        self.assertEqual(self.recipe.read_text(), self.original.replace(OLD, NEW))

    def test_fetch_failure_restores_original(self):
        for output in ("network unavailable", MISMATCH.replace(hashes.FAKE_HASH, OLD),
                       MISMATCH + f"got: {OLD}\n"):
            with self.subTest(output=output):
                with patch.object(hashes, "build", return_value=result(1, output)):
                    with self.assertRaises(ValueError):
                        self.regenerate()
                self.assertEqual(self.recipe.read_text(), self.original)

    def test_verification_failure_restores_original(self):
        with patch.object(hashes, "build", side_effect=[result(1, MISMATCH), result(1, "failed")]):
            with self.assertRaisesRegex(ValueError, "Verification failed"):
                self.regenerate()
        self.assertEqual(self.recipe.read_text(), self.original)

    def test_interrupt_restores_original(self):
        with patch.object(hashes, "build", side_effect=KeyboardInterrupt):
            with self.assertRaises(KeyboardInterrupt):
                self.regenerate()
        self.assertEqual(self.recipe.read_text(), self.original)

    def test_success_with_placeholder_is_not_accepted(self):
        with patch.object(hashes, "build", return_value=result(0, MISMATCH)):
            with self.assertRaises(ValueError):
                self.regenerate()
        self.assertEqual(self.recipe.read_text(), self.original)

    def test_all_current_package_hashes_are_registered(self):
        inventory = hashes.inventory(SCRIPT.parent.parent)
        self.assertEqual(sum(map(len, inventory.values())), 15)

    def test_unregistered_hash_aborts_before_writing(self):
        recipes = self.root / "nix/packages"
        recipes.mkdir(parents=True)
        (recipes / "new.nix").write_text(self.original)
        with self.assertRaisesRegex(ValueError, "inventory changed"):
            hashes.inventory(self.root)

    def test_package_selection(self):
        for option, package, targets in (
            ("--package", "herdr-desktop", ["herdr-desktop.cargoDeps"]),
            ("-p", "openchamber", ["openchamber.src", "openchamber.npmDeps"]),
        ):
            with self.subTest(package=package):
                with patch.object(hashes, "regenerate") as mocked:
                    with patch.object(hashes.shutil, "which", return_value="nix"):
                        hashes.main([option, package])
                self.assertEqual([call.args[2] for call in mocked.call_args_list], targets)

    def test_default_selects_all_packages(self):
        with patch.object(hashes, "regenerate") as mocked:
            with patch.object(hashes.shutil, "which", return_value="nix"):
                hashes.main([])
        self.assertEqual(
            [call.args[2] for call in mocked.call_args_list],
            [target for targets in hashes.TARGETS.values() for target in targets],
        )

    def test_unknown_package_is_rejected_before_work(self):
        with patch.object(hashes, "regenerate") as mocked:
            with patch("sys.stderr"):
                with self.assertRaises(SystemExit) as raised:
                    hashes.main(["--package", "unknown"])
        self.assertEqual(raised.exception.code, 2)
        mocked.assert_not_called()

    def test_build_does_not_update_lock_or_create_result_link(self):
        with patch.object(hashes.subprocess, "run", return_value=result(0)) as mocked:
            hashes.build(self.root, "example.npmDeps")
        command = mocked.call_args.args[0]
        self.assertIn("--no-write-lock-file", command)
        self.assertIn("--no-link", command)
        self.assertIn(".#example.npmDeps", command)


if __name__ == "__main__":
    unittest.main()
