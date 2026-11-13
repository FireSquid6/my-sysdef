"""Exercise the public CLI against local Nix Chromium, with no external service."""
import os
from pathlib import Path
import subprocess
import time
import urllib.request

from browser_use import Agent, Browser
import browser_harness
import cdp_use
import fetch_use
from PIL import Image

# Native-wheel checks: exercise code, rather than just successful installation.
Image.new("RGB", (2, 2)).save("test.png")

cli = os.environ["BROWSER_USE_CLI"]
subprocess.run([cli, "--help"], check=True)
from importlib.metadata import distributions, version
from packaging.requirements import Requirement

# Check required distribution metadata too, not only modules reached by the CLI.
for dist in distributions():
    for raw in dist.requires or []:
        requirement = Requirement(raw)
        if requirement.marker is None or requirement.marker.evaluate({"extra": ""}):
            installed = version(requirement.name)
            assert requirement.specifier.contains(installed, prereleases=True), (
                dist.metadata["Name"], raw, installed
            )
assert version("browser-use") == "0.13.8"
# Upstream delegates --version to browser-harness, so it reports 0.1.9.
assert subprocess.check_output([cli, "--version"], text=True).strip() == "0.1.9"

profile = Path.cwd() / "chromium-profile"
with open("chromium.log", "w") as log:
    chrome = subprocess.Popen([
        os.environ["CHROMIUM"], "--headless", "--no-sandbox",
        "--disable-dev-shm-usage", "--disable-gpu", "--no-first-run",
        "--no-default-browser-check", "--remote-debugging-port=0",
        f"--user-data-dir={profile}", "about:blank",
    ], stdout=log, stderr=log)
    try:
        for _ in range(200):
            port_file = profile / "DevToolsActivePort"
            if port_file.exists():
                break
            if chrome.poll() is not None:
                raise RuntimeError(Path("chromium.log").read_text())
            time.sleep(0.1)
        port = port_file.read_text().splitlines()[0]
        os.environ["BU_CDP_URL"] = f"http://127.0.0.1:{port}"
        urllib.request.urlopen(os.environ["BU_CDP_URL"] + "/json/version").close()
        result = subprocess.run([cli], input='ensure_real_tab()\nprint(js("6 * 7"))\n',
                                text=True, capture_output=True, timeout=60)
        print(result.stdout)
        print(result.stderr)
        assert result.returncode == 0, result
        assert "42" in result.stdout, result.stdout
    finally:
        subprocess.run([cli, "--reload"], timeout=15, check=False)
        chrome.terminate()
        chrome.wait(timeout=15)
