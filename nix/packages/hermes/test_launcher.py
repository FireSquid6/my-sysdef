"""Exercise the public launcher contract without starting Electron or using user state."""
import json
import os
from pathlib import Path
import sys
import subprocess
import tempfile
import unittest


class LauncherTests(unittest.TestCase):
    def launch(self, *args):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for name in ("agent", "desktop"):
                executable = root / name
                executable.write_text(
                    f"#!{sys.executable}\n"
                    "import json, sys\n"
                    f"print(json.dumps([{name!r}, sys.argv[1:]]))\n"
                    "sys.exit(23)\n",
                    encoding="utf-8",
                )
                executable.chmod(0o755)
            source = Path(__file__).with_name("launcher.sh").read_text(encoding="utf-8")
            for name, value in {
                "shell": os.environ.get("TEST_SHELL", "/bin/sh"),
                "agent": str(root / "agent"),
                "desktop": str(root / "desktop"),
            }.items():
                source = source.replace(f"@{name}@", value)
            launcher = root / "hermes"
            launcher.write_text(source, encoding="utf-8")
            launcher.chmod(0o755)
            result = subprocess.run([str(launcher), *args], capture_output=True, text=True)
            self.assertEqual(result.returncode, 23, result.stderr)
            return json.loads(result.stdout)

    def test_desktop_dispatch_preserves_arguments(self):
        self.assertEqual(self.launch("desktop", "space argument", "--flag"),
                         ["desktop", ["space argument", "--flag"]])

    def test_other_commands_reach_agent(self):
        self.assertEqual(self.launch("chat", "desktop", ""),
                         ["agent", ["chat", "desktop", ""]])

    def test_no_arguments_reach_agent(self):
        self.assertEqual(self.launch(), ["agent", []])


if __name__ == "__main__":
    unittest.main()
