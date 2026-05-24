#!/usr/bin/env python3
"""Mirror of js/qpu-calibrations.js — emits data/qpu-calibrations.json.

Run from repo root:
    python3 scripts/gen-calibrations.py

Consumers:
    - http://127.0.0.1:9470/data/qpu-calibrations.json (dev server)
    - /Users/qbit/models/chat/composerIBM/data/qpu-calibrations.json (local fs)
    - LLM / T5x bridges under /Users/qbit/models/engine
"""

from __future__ import annotations
import json, math, os, re, sys, time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FLEET_JS = ROOT / "js" / "qpu-fleet.js"
OUT = ROOT / "data" / "qpu-calibrations.json"

U32 = 0xFFFFFFFF

def fnv1a(s: str) -> int:
    h = 2166136261
    for c in s:
        h ^= ord(c)
        h = (h * 16777619) & U32
    return h

def mul32(a: int, b: int) -> int:
    return ((a * b) & U32) ^ (((a * b) >> 0) & 0)  # truncate to 32 bits

def imul(a: int, b: int) -> int:
    a &= U32
    b &= U32
    prod = (a * b) & 0xFFFFFFFFFFFFFFFF
    lo = prod & U32
    if lo & 0x80000000:
        lo -= 0x100000000
    return lo & U32

def make_rng(seed: int):
    a = [seed & U32]
    def rng() -> float:
        a[0] = (a[0] + 0x6d2b79f5) & U32
        t = imul(a[0] ^ (a[0] >> 15), 1 | a[0])
        t = (t + imul(t ^ (t >> 7), 61 | t)) & U32
        t ^= a[0]
        t &= U32
        return ((t ^ (t >> 14)) & U32) / 4294967296.0
    return rng

RANGES = {
    "trapped-ion": dict(t1=(10000,35000), t2=(2000,6000), err1q=(0.00005,0.00035),
                        err2q=(0.0015,0.0040), readout=(0.002,0.012),
                        d1q=(50,120), d2q=(120,320)),
    "neutral-atom": dict(t1=(3000,12000), t2=(800,3500), err1q=(0.0010,0.0040),
                          err2q=(0.0050,0.0150), readout=(0.010,0.040),
                          d1q=(200,600), d2q=(600,1400)),
    "photonic":    dict(t1=(80000,250000), t2=(40000,120000), err1q=(0.0008,0.0030),
                          err2q=(0.0040,0.0120), readout=(0.005,0.020),
                          d1q=(10,40), d2q=(40,160)),
    "quantum-annealing": dict(t1=(120,320), t2=(40,110), err1q=(0.0030,0.0090),
                          err2q=(0.0100,0.0300), readout=(0.010,0.040),
                          d1q=(4,20), d2q=(4,20)),
    "simulator":   dict(t1=(math.inf,math.inf), t2=(math.inf,math.inf), err1q=(0,0),
                          err2q=(0,0), readout=(0,0), d1q=(0,0), d2q=(0,0)),
    "superconducting": dict(t1=(60,320), t2=(40,220), err1q=(0.00020,0.00080),
                          err2q=(0.0050,0.0180), readout=(0.005,0.030),
                          d1q=(25,60), d2q=(180,520)),
}

def drift(chip: str, vendor: str) -> float:
    if not chip: return 1.0
    c = chip.lower()
    if re.search(r"heron r2|heron-r2", c): return 0.78
    if "heron" in c: return 0.86
    if re.search(r"eagle r3|nighthawk", c): return 0.88
    if "eagle" in c: return 0.96
    if "flamingo" in c: return 0.90
    if "willow" in c: return 0.74
    if re.search(r"helios|h2", c): return 0.70
    if re.search(r"forte|tempo", c): return 0.78
    if "ankaa" in c: return 0.92
    if "garnet" in c: return 0.82
    if re.search(r"fresnel|aquila|phoenix|sqale", c): return 0.84
    if "boson" in c: return 0.88
    if re.search(r"borealis|mosaiq", c): return 0.78
    if re.search(r"advantage", c): return 0.95
    if "wuyuan" in c: return 0.94
    if vendor in ("Google","IBM"): return 0.84
    return 1.0

def pick(rng, lohi):
    lo, hi = lohi
    if math.isinf(lo) or math.isinf(hi): return math.inf
    return lo + (hi - lo) * rng()

def round_p(v, p):
    if math.isinf(v): return None
    m = 10 ** p
    return round(v * m) / m

def layout_cols(chip, q):
    chip = chip or ""
    if re.search(r"heron", chip, re.I): return 17
    if re.search(r"eagle", chip, re.I): return 15
    if re.search(r"flamingo|nighthawk", chip, re.I): return 16
    if re.search(r"willow", chip, re.I): return 12
    if re.search(r"ankaa", chip, re.I): return 12
    if re.search(r"garnet", chip, re.I): return 12
    return max(2, math.ceil(math.sqrt(max(1, q) * 1.35)))

def couplers(q, chip):
    cols = layout_cols(chip, q)
    heavy = bool(re.search(r"heron|eagle|flamingo|nighthawk", chip or "", re.I))
    edges = []
    for i in range(q):
        r = i // cols
        c = i % cols
        right = i + 1
        if c < cols - 1 and right < q and (not heavy or (c + r) % 2 == 0):
            edges.append((i, right))
        down = i + cols
        if down < q and (not heavy or c % 2 == 0):
            edges.append((i, down))
    return edges

def median(values):
    finite = [v for v in values if v is not None and not math.isinf(v)]
    if not finite: return math.inf
    s = sorted(finite); n = len(s)
    return s[n//2] if n % 2 else (s[n//2 - 1] + s[n//2]) / 2

def snapshot(b, ts_ms):
    tech = b.get("tech","superconducting")
    q = max(1, int(b.get("q") or 1))
    seed = fnv1a(f"{b['name']}|{b.get('chip','')}|{q}|{tech}")
    rng = make_rng(seed)
    r = RANGES.get(tech, RANGES["superconducting"])
    d = drift(b.get("chip",""), b.get("vendor",""))

    qubits = []
    for i in range(q):
        qubits.append(dict(
            id=i,
            t1_us=round_p(pick(rng, r["t1"]), 1),
            t2_us=round_p(pick(rng, r["t2"]), 1),
            err_1q=round_p(pick(rng, r["err1q"]) * d, 6),
            readout_err=round_p(pick(rng, r["readout"]) * d, 5),
            freq_ghz=round_p(4.6 + rng() * 0.8, 4) if tech == "superconducting" else None,
            duration_1q_ns=round_p(pick(rng, r["d1q"]), 1),
        ))

    edges = couplers(q, b.get("chip",""))
    gate = {"superconducting":"cz","trapped-ion":"rxx","photonic":"cz"}.get(tech,"cx")
    links = [dict(
        a=a, b=bb,
        err_2q=round_p(pick(rng, r["err2q"]) * d, 6),
        duration_2q_ns=round_p(pick(rng, r["d2q"]), 1),
        gate=gate,
    ) for (a, bb) in edges]

    stats = dict(
        median_err_1q=round_p(median([qq["err_1q"] for qq in qubits]) or 0, 6),
        median_err_2q=round_p(median([l["err_2q"] for l in links]) or 0, 6),
        worst_err_1q=round_p(max((qq["err_1q"] for qq in qubits), default=0), 6),
        worst_err_2q=round_p(max((l["err_2q"] for l in links), default=0), 6),
        median_readout=round_p(median([qq["readout_err"] for qq in qubits]) or 0, 5),
        median_t1_us=round_p(median([qq["t1_us"] for qq in qubits]), 1),
        median_t2_us=round_p(median([qq["t2_us"] for qq in qubits]), 1),
        median_dur_2q_ns=round_p(median([l["duration_2q_ns"] for l in links]), 1),
        link_count=len(links),
    )

    ts_iso = datetime.fromtimestamp(ts_ms/1000, tz=timezone.utc).isoformat().replace("+00:00","Z")
    return dict(
        backend=b["name"], vendor=b.get("vendor"), chip=b.get("chip"),
        tech=tech, qubits_total=q, qubits_modeled=len(qubits),
        ts=ts_ms, ts_iso=ts_iso, status=b.get("status","unknown"),
        stats=stats, qubits=qubits, links=links,
    )

FLEET_RE = re.compile(r"\{\s*name:\s*'([^']+)'[^}]+\}", re.S)
FIELD_RE = re.compile(r"(\w+):\s*('([^']*)'|([0-9.\-]+))")

def parse_fleet():
    src = FLEET_JS.read_text()
    # crude: extract the FLEET = [ ... ]; block
    m = re.search(r"const FLEET = \[(.*?)\];", src, re.S)
    if not m:
        sys.exit("Couldn't find FLEET array in qpu-fleet.js")
    items = []
    for entry in re.finditer(r"\{\s*([^}]+?)\s*\}", m.group(1), re.S):
        obj = {}
        for fm in FIELD_RE.finditer(entry.group(1)):
            key, _, sval, nval = fm.groups()
            obj[key] = sval if sval is not None else float(nval) if "." in nval or "-" in nval[1:] else int(nval)
        items.append(obj)
    # also include local sim
    items.append(dict(name="local-aer", chip="Aer simulator", q=32,
                     region="Local (offline)", lat=0, lon=0,
                     tech="simulator", vendor="composerIBM", status="online"))
    return items

def main():
    ts_ms = int(time.time() * 1000)
    fleet = parse_fleet()
    snaps = { b["name"]: snapshot(b, ts_ms) for b in fleet }
    blob = dict(
        ts=ts_ms,
        ts_iso=datetime.fromtimestamp(ts_ms/1000, tz=timezone.utc).isoformat().replace("+00:00","Z"),
        version=1,
        source="composerIBM/qpu-calibrations",
        vendors=sorted({ s["vendor"] for s in snaps.values() if s.get("vendor") }),
        snapshots=snaps,
    )
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(blob, indent=2, allow_nan=False, default=str))
    print(f"wrote {OUT.relative_to(ROOT)} · {len(snaps)} backends · {blob['ts_iso']}")

if __name__ == "__main__":
    main()
