"""composerIBM → T5x / engine bridge for preloaded QPU calibrations.

Resolves the static snapshot written by ``scripts/gen-calibrations.py`` and
exposes a tiny helper API so models under ``/Users/qbit/models/engine`` can
narrow OpenQASM suggestions to physically routable, low-error sub-lattices.

Example
-------
    from integrations.qpu_calibrations import load, best_path, summarize

    blob = load()
    snap = blob["snapshots"]["ibm_torino"]
    print(summarize(snap))
    qubits, err = best_path(snap, length=4)
    print("low-error chain", qubits, "total 2Q err", err)

The snapshot schema matches js/qpu-calibrations.js so browser and Python
consumers see identical numbers (same FNV-1a seed + Mulberry32 PRNG).
"""

from __future__ import annotations
import json, math, os
from pathlib import Path
from typing import Iterable, List, Optional, Tuple

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PATH = ROOT / "data" / "qpu-calibrations.json"


def load(path: Optional[os.PathLike] = None) -> dict:
    p = Path(path) if path else DEFAULT_PATH
    if not p.exists():
        raise FileNotFoundError(
            f"{p} missing — run `python3 scripts/gen-calibrations.py` first"
        )
    return json.loads(p.read_text())


def snapshots(blob: Optional[dict] = None) -> dict:
    return (blob or load())["snapshots"]


def vendors(blob: Optional[dict] = None) -> List[str]:
    return list((blob or load()).get("vendors", []))


def summarize(snap: dict) -> str:
    s = snap["stats"]
    return (
        f"{snap['backend']} ({snap['vendor']} · {snap['chip']} · "
        f"{snap['qubits_total']}q · {s['link_count']} paths) "
        f"@ {snap['ts_iso']} — "
        f"1Q={s['median_err_1q']:.4%}, 2Q={s['median_err_2q']:.4%}, "
        f"RO={s['median_readout']:.3%}, T1={s['median_t1_us']}µs, "
        f"T2={s['median_t2_us']}µs"
    )


def adjacency(snap: dict) -> dict:
    """Map qubit → list[(neighbor, err_2q, duration_2q_ns, gate)]."""
    adj: dict = {q["id"]: [] for q in snap["qubits"]}
    for l in snap["links"]:
        adj.setdefault(l["a"], []).append((l["b"], l["err_2q"], l["duration_2q_ns"], l["gate"]))
        adj.setdefault(l["b"], []).append((l["a"], l["err_2q"], l["duration_2q_ns"], l["gate"]))
    return adj


def best_path(snap: dict, length: int = 4, max_paths: int = 50000) -> Tuple[List[int], float]:
    """Greedy + DFS search for the lowest cumulative 2Q-error chain of ``length`` qubits.

    Returns (qubit_ids, total_err). For very large backends this is bounded by
    ``max_paths`` partial expansions for safety.
    """
    if length < 1:
        return [], 0.0
    adj = adjacency(snap)
    qubits = sorted(snap["qubits"], key=lambda q: q["err_1q"])
    best: Tuple[List[int], float] = ([], math.inf)
    visits = 0
    for seed in qubits[: max(8, length * 4)]:
        stack = [([seed["id"]], 0.0)]
        while stack:
            visits += 1
            if visits > max_paths:
                return best
            path, cost = stack.pop()
            if len(path) == length:
                if cost < best[1]:
                    best = (path, cost)
                continue
            tail = path[-1]
            for nbr, err, _dur, _g in sorted(adj.get(tail, []), key=lambda t: t[1]):
                if nbr in path:
                    continue
                new_cost = cost + (err if err is not None else 0.0)
                if new_cost >= best[1]:
                    continue
                stack.append((path + [nbr], new_cost))
    return best


def worst_qubits(snap: dict, k: int = 5) -> List[dict]:
    """Top-k highest-error qubits — useful to blacklist in routing."""
    return sorted(snap["qubits"], key=lambda q: q["err_1q"], reverse=True)[:k]


def worst_links(snap: dict, k: int = 5) -> List[dict]:
    return sorted(snap["links"], key=lambda l: l["err_2q"], reverse=True)[:k]


def filter_backends(
    blob: Optional[dict] = None,
    *,
    vendor: Optional[str] = None,
    tech: Optional[str] = None,
    min_qubits: int = 0,
) -> List[dict]:
    out: List[dict] = []
    for s in snapshots(blob).values():
        if vendor and s.get("vendor") != vendor:
            continue
        if tech and s.get("tech") != tech:
            continue
        if s.get("qubits_total", 0) < min_qubits:
            continue
        out.append(s)
    return out


if __name__ == "__main__":
    import sys
    blob = load()
    print(f"loaded {len(snapshots(blob))} backends @ {blob['ts_iso']}")
    name = sys.argv[1] if len(sys.argv) > 1 else "ibm_torino"
    snap = snapshots(blob).get(name)
    if not snap:
        print(f"backend '{name}' not found. vendors: {vendors(blob)}")
        sys.exit(1)
    print(summarize(snap))
    chain, err = best_path(snap, length=int(sys.argv[2]) if len(sys.argv) > 2 else 4)
    print(f"lowest-error chain (len {len(chain)}): {chain}  total 2Q err = {err:.6f}")
