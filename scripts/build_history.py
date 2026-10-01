#!/usr/bin/env python3
from __future__ import annotations

import difflib
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ARTICLE = ROOT / "article"
OUT = ROOT / "site" / "data" / "history.json"


def git(*args: str) -> str:
    return subprocess.check_output(
        ["git", *args],
        cwd=ROOT,
        text=True,
        encoding="utf-8",
        errors="replace",
    )


def extract_title(content: str, fallback: str) -> str:
    for pattern in (r"\\section\{([^}]+)\}", r"\\title\{([^}]+)\}"):
        m = re.search(pattern, content)
        if m:
            return m.group(1).replace("--", "—")
    return fallback


def extract_history_id(content: str, fallback: str) -> str:
    m = re.search(r"^\s*%\s*history-id:\s*(\S+)", content, flags=re.MULTILINE)
    return m.group(1) if m else fallback


def line_stats(previous: str | None, current: str) -> tuple[int, int]:
    if previous is None:
        return len(current.splitlines()), 0
    added = deleted = 0
    for line in difflib.ndiff(previous.splitlines(), current.splitlines()):
        if line.startswith("+ "):
            added += 1
        elif line.startswith("- "):
            deleted += 1
    return added, deleted


def history_for(path: Path) -> dict:
    rel = path.relative_to(ROOT).as_posix()
    current = path.read_text(encoding="utf-8")

    log = git(
        "log",
        "--follow",
        "--format=%H%x1f%ct%x1f%s",
        "--",
        rel,
    ).strip()

    rows = []
    if log:
        for raw in reversed(log.splitlines()):
            sha, unix_ts, message = raw.split("\x1f", 2)
            try:
                content = git("show", f"{sha}:{rel}")
            except subprocess.CalledProcessError:
                # Renames are not part of the current demo fixture. If a historical
                # path cannot be resolved, skip it rather than breaking deployment.
                continue
            rows.append(
                {
                    "sha": sha,
                    "shortSha": sha[:7],
                    "timestamp": int(unix_ts),
                    "date": datetime.fromtimestamp(
                        int(unix_ts), tz=timezone.utc
                    ).isoformat(),
                    "message": message,
                    "content": content,
                }
            )

    previous = None
    for index, row in enumerate(rows, start=1):
        added, deleted = line_stats(previous, row["content"])
        row["version"] = index
        row["additions"] = added
        row["deletions"] = deleted
        previous = row["content"]

    return {
        "path": rel,
        "name": path.name,
        "title": extract_title(current, path.stem),
        "historyId": extract_history_id(current, path.stem),
        "versionCount": len(rows),
        "latestSha": rows[-1]["sha"] if rows else None,
        "versions": rows,
    }


def main() -> None:
    files = sorted(ARTICLE.rglob("*.tex"))
    payload = {
        "repository": "dchorazkiewicz/git-HTML-history",
        "branch": "main",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "files": [history_for(path) for path in files],
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(
        f"Wrote {OUT.relative_to(ROOT)} with "
        f"{len(payload['files'])} files and "
        f"{sum(f['versionCount'] for f in payload['files'])} file versions."
    )


if __name__ == "__main__":
    main()
