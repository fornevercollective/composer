#!/usr/bin/env python3
"""
Tree-walker style QASM gutter (offline). For full tree-sitter, add grammar binding later.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

RULES = [
    (re.compile(r"^OPENQASM", re.I), "shebang"),
    (re.compile(r"^include\s", re.I), "include"),
    (re.compile(r"^//"), "comment"),
    (re.compile(r"^qubit|^qreg", re.I), "qubit"),
    (re.compile(r"^bit|^creg", re.I), "bit"),
    (re.compile(r"^measure\b", re.I), "measure"),
    (re.compile(r"^(cx|cz|ch|ccx)\b", re.I), "gate"),
    (re.compile(r"^(h|x|y|z|rx|ry|rz|sx|u\d?|p)\b", re.I), "gate"),
]


def classify_line(line: str) -> dict:
    t = line.strip()
    if not t:
        return {"category": "blank", "sym": " "}
    for rx, cat in RULES:
        if rx.search(t):
            return {"category": cat, "sym": cat[0]}
    return {"category": "other", "sym": "?"}


def walk(path: Path) -> dict:
    text = path.read_text()
    lines = text.splitlines()
    classified = [{"line": i + 1, **classify_line(ln)} for i, ln in enumerate(lines)]
    counts: dict[str, int] = {}
    for c in classified:
        cat = c["category"]
        counts[cat] = counts.get(cat, 0) + 1
    return {"file": str(path), "total": len(lines), "counts": counts, "lines": classified[:200]}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("qasm", type=Path)
    ap.add_argument("-o", "--out", type=Path)
    args = ap.parse_args()
    report = walk(args.qasm)
    blob = json.dumps(report, indent=2)
    if args.out:
        args.out.write_text(blob)
    else:
        print(blob)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
