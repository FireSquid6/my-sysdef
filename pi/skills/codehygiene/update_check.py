"""Periodic 12-hour release check against public pyproject.toml metadata."""

from __future__ import annotations

from dataclasses import dataclass
import json
import os
from pathlib import Path
import sys
import threading
import time
from typing import TextIO
from urllib.request import urlopen

PYPROJECT_URL = "https://raw.githubusercontent.com/brianbell-x/codehygiene/main/pyproject.toml"
CHECK_INTERVAL_SEC = 12 * 3600
FETCH_TIMEOUT_SEC = 0.6
JOIN_TIMEOUT_SEC = 0.35
_OPT_OUT_FALSE = frozenset({"", "0", "false", "no", "off"})


@dataclass(frozen=True)
class UpdateHandle:
    installed: str
    cached_latest: str
    result_box: list[str]
    worker: threading.Thread | None


def _is_disabled_by_env() -> bool:
    env = os.environ
    for flag_name in ("CODEHYGIENE_NO_UPDATE_CHECK", "CI", "PYTEST_CURRENT_TEST"):
        raw_val = env.get(flag_name, "").strip().lower()
        if raw_val not in _OPT_OUT_FALSE:
            return True
    return False


def _cache_file_path() -> Path:
    env = os.environ
    if sys.platform == "win32":
        local_dir = env.get("LOCALAPPDATA", "").strip()
        root = Path(local_dir) if local_dir else Path.home() / "AppData" / "Local"
        return root / "codehygiene" / "update.json"

    if sys.platform == "darwin":
        return Path.home() / "Library" / "Caches" / "codehygiene" / "update.json"

    xdg_dir = env.get("XDG_CACHE_HOME", "").strip()
    root = Path(xdg_dir) if xdg_dir else Path.home() / ".cache"
    return root / "codehygiene" / "update.json"


def _read_cache(cache_path: Path) -> tuple[float, str]:
    if not cache_path.is_file():
        return (0.0, "")
    try:
        payload = json.loads(cache_path.read_text("utf-8"))
        return (float(payload["checked_at"]), str(payload["latest"]))
    except (OSError, ValueError, KeyError, TypeError):
        return (0.0, "")


def _write_cache(cache_path: Path, checked_at: float, latest: str) -> bool:
    body = json.dumps({"checked_at": round(checked_at, 1), "latest": latest})
    try:
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(body + "\n", encoding="utf-8")
        return True
    except OSError:
        return False


def extract_project_version(toml_text: str) -> str:
    in_project = False
    for raw_line in toml_text.splitlines():
        line = raw_line.strip()
        if line.startswith("[") and line.endswith("]"):
            in_project = line == "[project]"
            continue
        if in_project and line.startswith("version") and "=" in line:
            _, rhs = line.split("=", 1)
            return rhs.split("#", 1)[0].strip().strip("\"'")
    return ""


def parse_version_tuple(raw_ver: str) -> tuple[int, ...]:
    core = raw_ver.strip().lstrip("v").split("-", 1)[0]
    parts: list[int] = []
    for token in core.split("."):
        if not token.isdigit():
            return ()
        parts.append(int(token))
    return tuple(parts)


def _fetch_remote_version() -> str:
    try:
        with urlopen(PYPROJECT_URL, timeout=FETCH_TIMEOUT_SEC) as resp:
            raw_bytes = resp.read(16_384)
    except OSError:
        return ""
    return extract_project_version(raw_bytes.decode("utf-8", "replace"))


def _refresh_worker(cache_path: Path, fallback_latest: str, result_box: list[str]) -> None:
    now_sec = time.time()
    fetched = _fetch_remote_version()
    latest = fetched if fetched else fallback_latest
    _write_cache(cache_path, now_sec, latest)
    if latest:
        result_box.append(latest)


def start_update_check(installed: str, *, disabled: bool = False) -> UpdateHandle | None:
    if disabled or _is_disabled_by_env():
        return None

    cache_path = _cache_file_path()
    checked_at, cached_latest = _read_cache(cache_path)
    elapsed = time.time() - checked_at
    if 0.0 <= elapsed < CHECK_INTERVAL_SEC:
        return UpdateHandle(installed, cached_latest, [], None)

    result_box: list[str] = []
    worker = threading.Thread(
        target=_refresh_worker,
        args=(cache_path, cached_latest, result_box),
        daemon=True,
    )
    worker.start()
    return UpdateHandle(installed, cached_latest, result_box, worker)


def emit_update_notice(handle: UpdateHandle | None, stream: TextIO | None = None) -> bool:
    if handle is None:
        return False
    if handle.worker is not None:
        handle.worker.join(timeout=JOIN_TIMEOUT_SEC)

    latest = handle.result_box[0] if handle.result_box else handle.cached_latest
    installed_ver = parse_version_tuple(handle.installed)
    latest_ver = parse_version_tuple(latest)
    if not installed_ver or not latest_ver or latest_ver <= installed_ver:
        return False

    out = stream if stream is not None else sys.stderr
    msg = (
        f"note: codehygiene {latest} available (installed {handle.installed}) "
        "— run `npx skills update codehygiene -y` (add `-g` if global)\n"
    )
    out.write(msg)
    return True
