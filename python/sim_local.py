#!/usr/bin/env python3
"""Offline statevector simulation for composerIBM (no cloud billing)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def sim_with_qiskit(qasm: str, shots: int) -> dict:
    from qiskit import QuantumCircuit
    from qiskit_aer import AerSimulator

    qc = QuantumCircuit.from_qasm_str(qasm)
    sim = AerSimulator()
    job = sim.run(qc, shots=shots)
    counts = job.result().get_counts()
    return {"backend": "aer", "shots": shots, "counts": counts, "qubits": qc.num_qubits}


def sim_toy(qasm: str, shots: int) -> dict:
    """Minimal fallback when qiskit is not installed."""
    lines = [ln.strip() for ln in qasm.splitlines() if ln.strip() and not ln.strip().startswith("//")]
    gates = sum(
        1
        for ln in lines
        if any(
            ln.lower().startswith(g)
            for g in ("h ", "x ", "cx ", "cz ", "measure", "rz(", "rx(", "ry(", "sx ")
        )
    )
    return {
        "backend": "toy",
        "shots": shots,
        "note": "install qiskit + qiskit-aer for real simulation",
        "gate_lines": gates,
        "counts": {"0" * 2: shots // 2, "1" * 2: shots - shots // 2},
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="composerIBM local simulator")
    ap.add_argument("--qasm", type=Path, help="QASM file path")
    ap.add_argument("--shots", type=int, default=1024)
    args = ap.parse_args()

    if args.qasm:
        qasm = args.qasm.read_text()
    else:
        qasm = sys.stdin.read()

    if not qasm.strip():
        print(json.dumps({"error": "empty qasm"}), file=sys.stderr)
        return 1

    try:
        out = sim_with_qiskit(qasm, args.shots)
    except ImportError:
        out = sim_toy(qasm, args.shots)

    print(json.dumps(out, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
