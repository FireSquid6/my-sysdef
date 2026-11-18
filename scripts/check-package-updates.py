#!/usr/bin/env python3
"""Check custom package pins for upstream updates without changing any files."""

import argparse
from functools import lru_cache
import json
from pathlib import Path
import re
from urllib.error import URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
# Release assets matter: mdserve and noteview share a repo but not every release.
RELEASES = {
    "emdash-app": ("desktop-apps/emdash-app.nix", "generalaction/emdash", "emdash-x86_64.AppImage"),
    "youtube-music-for-desktop": (
        "desktop-apps/youtube-music-for-desktop.nix", "Venipa/ytmdesktop2",
        "YouTube-Music-for-Desktop-{version}.AppImage",
    ),
    "mdserve": ("desktop-apps/mdserve.nix", "FireSquid6/noteview", "mdserve-linux-x64"),
    "noteview": ("desktop-apps/noteview.nix", "FireSquid6/noteview", "notesview-linux-x64"),
    "openchamber": (
        "desktop-apps/openchamber.nix", "openchamber/openchamber", "openchamber-web-{version}.tgz",
    ),
    "openchamber-desktop": (
        "desktop-apps/openchamber-desktop.nix", "openchamber/openchamber",
        "OpenChamber-{version}-linux-x86_64.AppImage",
    ),
}
REGISTRIES = {
    "tommy-excalidraw-cli": (
        "global-tools/excalidraw-cli/default.nix",
        "https://registry.npmjs.org/@tommywalkie%2Fexcalidraw-cli/latest", "version",
    ),
    "md-to-pdf": (
        "global-tools/md-to-pdf/default.nix", "https://registry.npmjs.org/md-to-pdf/latest", "version",
    ),
    "browser-use": (
        "global-tools/browser-use/pyproject.toml", "https://pypi.org/pypi/browser-use/json", "info",
    ),
}
FLAKE_PACKAGES = {
    "herdr-core": "herdr-core", "herdr-desktop": "herdr-app",
    "hermes": "hermes", "nanosync": "nanosync",
}
PACKAGES = sorted(set(RELEASES) | set(REGISTRIES) | set(FLAKE_PACKAGES)
                  | {"s-nail", "kvantum-tokyo-night"})


@lru_cache(maxsize=None)
def fetch(url):
    request = Request(url, headers={"User-Agent": "sysdef-package-update-checker"})
    with urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8")


def github(path):
    return json.loads(fetch(f"https://api.github.com/repos/{path}"))


def version_number(version):
    normalized = version.removeprefix("v")
    if not re.fullmatch(r"\d+\.\d+\.\d+", normalized):
        raise ValueError(f"Unsupported release version: {version}")
    return tuple(map(int, normalized.split(".")))


def pinned_version(recipe):
    text = (ROOT / "nix/packages" / recipe).read_text()
    pattern = r'browser-use==([^"\s]+)' if recipe.endswith(".toml") else r'\bversion\s*=\s*"([^"]+)"'
    match = re.search(pattern, text)
    if not match:
        raise ValueError(f"No pinned version found in {recipe}")
    return match.group(1)


def latest_release(repo, asset):
    # Bound API work explicitly; fail rather than call a missing asset up-to-date.
    releases = github(f"{repo}/releases?per_page=100")
    for release in releases:
        if release["draft"] or release["prerelease"]:
            continue
        version = release["tag_name"].removeprefix("v")
        expected = asset.format(version=version)
        if any(item["name"] == expected for item in release["assets"]):
            return version
    raise ValueError(f"No stable release with {asset} in {repo}'s latest 100 releases")


def source_revision(name):
    if name == "kvantum-tokyo-night":
        text = (ROOT / "nix/packages/kvantum-tokyo-night.nix").read_text()
        match = re.search(r'\brev\s*=\s*"([0-9a-f]+)"', text)
        if not match:
            raise ValueError("No pinned Kvantum revision found")
        return match.group(1), "0xsch1zo/Kvantum-Tokyo-Night", "HEAD"
    lock = json.loads((ROOT / "flake.lock").read_text())
    node = lock["nodes"]["root"]["inputs"][FLAKE_PACKAGES[name]]
    locked = lock["nodes"][node]["locked"]
    if locked["type"] == "github":
        repo = f'{locked["owner"]}/{locked["repo"]}'
    else:
        match = re.fullmatch(r"https://github.com/([^/]+/[^/]+)", locked["url"])
        if not match:
            raise ValueError(f"Unsupported source URL: {locked['url']}")
        repo = match.group(1)
    branch = locked.get("ref", "HEAD").removeprefix("refs/heads/")
    return locked["rev"], repo, branch


def check(name):
    if name in FLAKE_PACKAGES or name == "kvantum-tokyo-night":
        current, repo, branch = source_revision(name)
        latest = github(f"{repo}/commits/{quote(branch, safe='')}")["sha"]
        status = "PIN DIFFERS" if current != latest else "current"
        return f"{name}: {status} ({current[:12]} -> {latest[:12]})"
    if name in RELEASES:
        recipe, repo, asset = RELEASES[name]
        current = pinned_version(recipe)
        latest = latest_release(repo, asset)
    elif name in REGISTRIES:
        recipe, url, field = REGISTRIES[name]
        current = pinned_version(recipe)
        metadata = json.loads(fetch(url))[field]
        latest = metadata["version"] if field == "info" else metadata
    else:
        current = pinned_version("s-nail.nix")
        versions = re.findall(r"s-nail-(\d+\.\d+\.\d+)\.tar\.xz", fetch("https://ftp.sdaoden.eu/"))
        if not versions:
            raise ValueError("No s-nail releases found on the upstream download index")
        latest = max(versions, key=version_number)
    status = "UPDATE" if version_number(latest) > version_number(current) else "current"
    return f"{name}: {status} (pinned {current}, latest {latest})"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("-p", "--package", choices=PACKAGES, help="check only this package")
    args = parser.parse_args(argv)
    failed = False
    for name in [args.package] if args.package else PACKAGES:
        try:
            print(check(name), flush=True)
        except (OSError, URLError, ValueError, KeyError, TypeError) as error:
            print(f"{name}: ERROR: {error}", flush=True)
            failed = True
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
