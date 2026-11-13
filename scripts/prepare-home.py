#!/usr/bin/env python3
"""Review/adopt Home Manager targets. Dry-run by default; never activate or install."""
import argparse
import datetime
import json
import os
from pathlib import Path, PurePosixPath
import pwd
import shutil
import stat
import subprocess
import sys
import tempfile
import uuid


def relative(value):
    if (not isinstance(value, str) or not value or value in (".", "/")
            or value.startswith("/") or ".." in PurePosixPath(value).parts
            or str(PurePosixPath(value)) != value):
        raise ValueError(f"Unsafe home-relative target: {value!r}")
    return value


def load_manifest(args):
    if args.manifest:
        with open(args.manifest, encoding="utf-8") as handle:
            return json.load(handle)
    if not args.configuration:
        raise ValueError("Specify --configuration user@host, or an evaluated --manifest file.")
    attribute = f'{args.flake}#homeConfigurations.{json.dumps(args.configuration)}.config.personal.migrationManifest'
    try:
        result = subprocess.run(["nix", "eval", "--json", "--no-write-lock-file", attribute],
                                check=True, text=True, stdout=subprocess.PIPE)
    except FileNotFoundError as error:
        raise ValueError("Nix is not installed. Install it explicitly first, or review an exported --manifest; no files were changed.") from error
    return json.loads(result.stdout)


def validate(manifest):
    if manifest.get("version") != 1:
        raise ValueError("Unsupported migration manifest version.")
    home = Path(manifest["home"])
    if not home.is_absolute() or home.resolve() != Path(os.environ.get("HOME", "")).resolve():
        raise ValueError("Manifest home must match this process's HOME. Review nix/hosts.nix before adopting anything.")
    if manifest["username"] != pwd.getpwuid(os.getuid()).pw_name:
        raise ValueError("Manifest username must match the current Unix account; never run this with sudo.")
    targets = [relative(item["target"]) for item in manifest["targets"]]
    if len(set(targets)) != len(targets):
        raise ValueError("Duplicate targets in manifest.")
    backup_root = PurePosixPath(".local/state/home-manager-migration")
    for target in targets:
        if any(str(parent) in targets for parent in PurePosixPath(target).parents if str(parent) != "."):
            raise ValueError(f"Overlapping managed targets: {target}")
        if (PurePosixPath(target) in backup_root.parents or target == str(backup_root)
                or backup_root in PurePosixPath(target).parents):
            raise ValueError(f"Managed target overlaps the migration backup directory: {target}")
    for item in manifest["targets"]:
        if item.get("source") is not None and not Path(item["source"]).exists():
            raise ValueError(f"Missing checkout source: {item['source']}. Fix the checkout location before activation.")
    return home


def directory_links(home, manifest):
    found = {}
    for item in manifest["targets"]:
        parts = PurePosixPath(item["target"]).parts
        for index in range(1, len(parts)):
            name = "/".join(parts[:index])
            candidate = home / name
            if candidate.is_symlink():
                expected = manifest.get("legacyDirectoryLinks", {}).get(name)
                if not expected or candidate.resolve() != Path(expected).resolve():
                    raise ValueError(f"Refusing to traverse unmanaged directory symlink {candidate}. Review and detach it manually first.")
                found[name] = candidate
    return found


def hm_owned(path):
    if not path.is_symlink():
        return False
    target = os.readlink(path)
    # Only leave links belonging to HM generations, not arbitrary Nix store files.
    return target.startswith("/nix/store/") and "-home-manager-files/" in target


def plan(home, manifest, ancestors):
    actions = [{"action": "detach-legacy-directory", "target": name} for name in ancestors]
    for item in manifest["targets"]:
        name = item["target"]
        candidate = home / name
        if any(name.startswith(parent + "/") for parent in ancestors):
            action = "inspect-after-detach"
        elif not os.path.lexists(candidate):
            action = "absent"
        elif hm_owned(candidate):
            action = "already-home-manager"
        else:
            action = "backup"
        actions.append({"action": action, "target": name})
    return actions


def adopt(home, manifest, ancestors):
    state = home / ".local/state/home-manager-migration"
    # Never write a backup through a symlink pointing into a checkout/another home.
    for parent in [state, *state.parents]:
        if parent == home:
            break
        if parent.is_symlink():
            raise ValueError(f"Backup directory has a symlink ancestor: {parent}")
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = state / f"{stamp}-{uuid.uuid4().hex[:8]}"
    backup.mkdir(parents=True, mode=0o700)
    records = []
    skipped = []

    def journal():
        (backup / "manifest.json").write_text(json.dumps({"home": str(home), "records": records, "skippedSpecialFiles": skipped}, indent=2) + "\n")
        (backup / "manifest.json").chmod(0o600)

    def move(name, kind):
        target = home / name
        # Flat slots: a saved directory symlink can NEVER become the parent of
        # another backup, even when recognized legacy application paths nest.
        saved = backup / "objects" / f"{len(records):06d}"
        saved.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        if os.path.lexists(saved):
            raise ValueError(f"Backup slot already exists; refusing to overwrite {saved}")
        # rename: no dereferencing and no accidental cross-filesystem copy/delete.
        os.rename(target, saved)
        records.append({"target": name, "backup": str(saved.relative_to(backup)), "kind": kind})
        journal()
        return saved

    journal()
    for name, target in sorted(ancestors.items(), key=lambda entry: len(PurePosixPath(entry[0]).parts)):
        # Copy into a sibling before moving the old link; failures leave it intact.
        temporary = Path(tempfile.mkdtemp(prefix=".hm-adopt-", dir=target.parent))
        copied = temporary / "directory"

        def ignore_special(directory, names):
            ignored = []
            for child in names:
                file = Path(directory) / child
                mode = file.lstat().st_mode
                if not (stat.S_ISREG(mode) or stat.S_ISDIR(mode) or stat.S_ISLNK(mode)):
                    ignored.append(child)
                    skipped.append(str(file))
            return ignored

        try:
            shutil.copytree(target.resolve(), copied, symlinks=True, ignore=ignore_special)
            copied.chmod(0o700)
            saved = move(name, "legacy-directory-link")
            try:
                os.rename(copied, target)
            except OSError:
                os.rename(saved, target)
                records.pop()
                journal()
                raise
        finally:
            if temporary.exists():
                shutil.rmtree(temporary)

    # Detachment materialized ordinary local parents; never move repository files.
    if directory_links(home, manifest):
        raise ValueError(f"A directory symlink remains. Stop and inspect the backup at {backup}.")
    for item in manifest["targets"]:
        name = item["target"]
        target = home / name
        if os.path.lexists(target) and not hm_owned(target):
            move(name, "unmanaged-target")
    journal()
    return backup


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", help="JSON exported from personal.migrationManifest; works without Nix")
    parser.add_argument("--flake", default=".")
    parser.add_argument("--configuration", help="Explicit Home Manager user@host output")
    parser.add_argument("--apply", action="store_true", help="Move conflicts to a private backup; default is read-only")
    parser.add_argument("--detach-legacy-dirs", action="store_true", help="After stopping affected apps, materialize known legacy root symlinks while preserving local runtime files")
    args = parser.parse_args()
    try:
        manifest = load_manifest(args)
        home = validate(manifest)
        ancestors = directory_links(home, manifest)
        report = {"dryRun": not args.apply, "actions": plan(home, manifest, ancestors)}
        if ancestors and not args.detach_legacy_dirs:
            report["blocked"] = "Legacy directory symlinks would cause writes into the checkout. Stop affected apps, then review --detach-legacy-dirs; nothing was changed."
            print(json.dumps(report, indent=2))
            return 2
        if args.apply:
            backup = adopt(home, manifest, ancestors)
            report["backup"] = str(backup)
            report["next"] = "Review backup/manifest.json, then explicitly build/switch Home Manager. No activation or package installation was performed. Restart detached apps afterward."
        print(json.dumps(report, indent=2))
        return 0
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as error:
        print(f"Migration stopped: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
