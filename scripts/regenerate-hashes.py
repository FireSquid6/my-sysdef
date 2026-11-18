#!/usr/bin/env python3
"""Refresh repo-owned package hashes against the current pinned inputs."""

import argparse
import re
import shutil
import signal
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FAKE_HASH = "sha256-" + "A" * 43 + "="
HASH_ASSIGNMENT = re.compile(r'\b(?:hash|npmDepsHash|cargoHash)\s*=\s*"(sha256-[A-Za-z0-9+/]{43}=)";')
# Each list follows the hash assignments' order in its recipe.
TARGETS = {
    "herdr/default.nix": ["herdr-core.cargoDeps", "herdr-desktop.cargoDeps"],
    "s-nail.nix": ["s-nail.src"],
    "kvantum-tokyo-night.nix": ["kvantum-tokyo-night.src"],
    "global-tools/excalidraw-cli/default.nix": [
        "tommy-excalidraw-cli.src", "tommy-excalidraw-cli.npmDeps",
    ],
    "global-tools/md-to-pdf/default.nix": ["md-to-pdf.src", "md-to-pdf.npmDeps"],
    "desktop-apps/openchamber.nix": ["openchamber.src", "openchamber.npmDeps"],
    "desktop-apps/mdserve.nix": ["mdserve.src"],
    "desktop-apps/noteview.nix": ["noteview.src"],
    "desktop-apps/emdash-app.nix": ["emdash-app.src"],
    "desktop-apps/openchamber-desktop.nix": ["openchamber-desktop.src"],
    "desktop-apps/youtube-music-for-desktop.nix": ["youtube-music-for-desktop.src"],
}


def inventory(root):
    recipes = root / "nix/packages"
    found = {
        str(path.relative_to(recipes)): HASH_ASSIGNMENT.findall(path.read_text())
        for path in recipes.rglob("*.nix")
        if HASH_ASSIGNMENT.search(path.read_text())
    }
    if found.keys() != TARGETS.keys():
        raise ValueError("Package hash inventory changed; update TARGETS before regenerating.")
    for recipe, targets in TARGETS.items():
        if len(found[recipe]) != len(targets):
            raise ValueError(f"Hash count changed in {recipe}; update TARGETS.")
    return found


def build(root, target):
    return subprocess.run(
        ["nix", "build", "--no-link", "--no-write-lock-file", "-L", f".#{target}"],
        cwd=root, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    )


def regenerate(root, path, target, original_hash):
    original = path.read_text()
    if original.count(original_hash) != 1:
        raise ValueError(f"Expected one occurrence of {original_hash} in {path}")
    updated = original
    print(f"Regenerating {target}...", flush=True)
    try:
        path.write_text(original.replace(original_hash, FAKE_HASH))
        result = build(root, target)
        hashes = re.findall(r"got:\s+(sha256-[A-Za-z0-9+/]{43}=)", result.stdout)
        expected = re.search(r"specified:\s+" + re.escape(FAKE_HASH), result.stdout)
        if (result.returncode == 0 or len(hashes) != 1 or not expected
                or "hash mismatch in fixed-output derivation" not in result.stdout):
            raise ValueError(f"Could not determine hash for {target}:\n{result.stdout}")
        actual_hash, = hashes
        path.write_text(original.replace(original_hash, actual_hash))
        verified = build(root, target)
        if verified.returncode:
            raise ValueError(f"Verification failed for {target}:\n{verified.stdout}")
        updated = path.read_text()
    finally:
        path.write_text(updated)
    print(f"  {actual_hash}" + (" (unchanged)" if actual_hash == original_hash else " (updated)"))


def interrupted(signum, frame):
    raise KeyboardInterrupt


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    packages = sorted({target.split(".")[0] for targets in TARGETS.values() for target in targets})
    parser.add_argument(
        "-p", "--package", choices=packages,
        help="regenerate only this package's hashes (default: all packages)",
    )
    args = parser.parse_args(argv)
    if not shutil.which("nix"):
        parser.exit(1, "nix is required; enter the project's Nix environment first.\n")
    signal.signal(signal.SIGTERM, interrupted)
    try:
        hashes = inventory(ROOT)
        for recipe, targets in TARGETS.items():
            for target, original_hash in zip(targets, hashes[recipe], strict=True):
                if args.package and target.split(".")[0] != args.package:
                    continue
                regenerate(ROOT, ROOT / "nix/packages" / recipe, target, original_hash)
    except (OSError, ValueError, KeyboardInterrupt) as error:
        parser.exit(1, f"Stopped: {error}\nEarlier verified hashes remain updated.\n")
    scope = args.package or "All local packages"
    print(f"{scope}: hashes verified. Review git diff before deploying.")


if __name__ == "__main__":
    main()
