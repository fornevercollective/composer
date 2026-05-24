# composer — offline Quantum Composer (stripped)

Minimal offline dev surface inspired by [IBM Quantum Composer](https://quantum.cloud.ibm.com/composer), tuned for fast iteration before paid QPU/sim time.

| | |
|---|---|
| **Live (GitHub Pages)** | [fornevercollective.github.io/composer](https://fornevercollective.github.io/composer/) |
| **Repository** | [github.com/fornevercollective/composer](https://github.com/fornevercollective/composer) |
| **Local git clone** | `/Users/qbit/dev/composer` |

## Integrations

| Surface | Role |
|---------|------|
| [μgrad R0](file:///Users/qbit/dev/mueee/ugrad-r0.html) | Train → `quantum export` → QASM 3.0 VQC |
| [quantum-gutter](https://qbitos.github.io/mu.eee/quantum-gutter.html) | 59-lang / 11-symbol prefix lane |
| [qpu-goldie-results](https://qbitos.github.io/mu.eee/qpu-goldie-results.html) | Song / waveform result workthroughs |

Bridges: `BroadcastChannel('quantum-loopback')`, `postMessage` to/from μgrad (`ugradGetState`, `lastQASM`).

## Bloch sphere

| Surface | URL | Role |
|---------|-----|------|
| **Main panel** | Header **Bloch** toggle | Embedded sphere + QASM trajectory (stays open via `localStorage`) |
| **Standalone viewer** | [`bloch-viewer.html`](bloch-viewer.html) | IBM Composer–style full-window sphere; **Pop out** from main |
| **Dual lab** | [`bloch-lab.html`](bloch-lab.html) | Two spheres, inverse, antimatter, magnetic link, equations |

## Bloch dual lab

[`bloch-lab.html`](bloch-lab.html) — two spheres (particle + inverse), antimatter (CPT) marker, magnetic flux bridge, and live equation panel:

- **Exact point**: θ, φ sliders → |ψ⟩ = cos(θ/2)|0⟩ + e^{iφ}sin(θ/2)|1⟩
- **Trajectory**: QASM gate chain on `q[0]`, Hamiltonian ω·σ path, or geodesic to antipodal inverse
- **Dual**: r⁻ = −r (inverse), |ψ̃⟩ = iσ_y|ψ*⟩ (antimatter), H_mag = −(μ/2)B·σ, H_int ∝ J r₁·r₂

Syncs with μgrad via `BroadcastChannel('bloch-state')`.

## QPU calibration snapshots (preloaded errors + paths)

Pre-rolled, deterministic calibration data for every backend in `js/qpu-fleet.js`
(28 backends, 6 vendors). Each snapshot has T1/T2, single/2Q gate errors,
readout errors, gate durations, and the full coupler graph. Identical seeded
RNG runs in browser and Python so consumers see the same numbers.

- **Static file** — `data/qpu-calibrations.json` (regenerate with
  `python3 scripts/gen-calibrations.py`)
- **In-browser** — `window.QPUCalibrations.get(name)` /
  `window.QPUCalibrations.all()` / `window.QPUCalibrations.toJSON()`
- **localStorage** — `composerIBM.calibration.<backend>` and
  `composerIBM.calibration.all`
- **Loopback channel** — `BroadcastChannel('quantum-loopback')` messages:
  - `{ type: 'qpu-calibration', backend, snapshot }` (publish)
  - `{ type: 'qpu-calibration-request', backend }` (subscribe → publishes back)
  - `{ type: 'qpu-calibration-all-request' }` → `{ type: 'qpu-calibration-all', blob }`
- **Lattice panel** — top of the lattice section shows the snapshot timestamp,
  median 1Q/2Q/readout errors, T1/T2, 2Q duration, and path count. Nodes/links
  are colored by error (green → red).
- **T5x / engine bridge** — `integrations/qpu_calibrations.py` exposes
  `load()`, `summarize(snap)`, `best_path(snap, length)`, `worst_qubits(snap)`,
  `worst_links(snap)`, and `filter_backends(vendor=, tech=, min_qubits=)`.
  Used by models under `/Users/qbit/models/engine` to narrow OpenQASM
  suggestions to physically routable, low-error sub-lattices, and by
  `ugrad-r0.html` / `uvqbit.html` over the loopback channel.

## Quick start

**Git repo (canonical):**

```bash
git clone https://github.com/fornevercollective/composer.git /Users/qbit/dev/composer
cd /Users/qbit/dev/composer
./scripts/dev-server.sh
# → http://127.0.0.1:9470/
```

Same tree is also mirrored at `/Users/qbit/models/chat/composerIBM` for Cursor sessions.

Open μgrad beside it (`?noauto` recommended):

```bash
open /Users/qbit/dev/mueee/ugrad-r0.html?noauto
```

In μgrad: `train` → `quantum export`. In composer: **Import from μgrad** or paste QASM.

## Stack

- **Browser**: single-file PWA (`index.html` + `js/*`) — no bundler required
- **Rust** (`rust/qasm-lite`): fast QASM stats (optional WASM via `wasm-pack`)
- **Python** (`python/sim_local.py`): local statevector when `qiskit`/`numpy` available
- **Gutter** (`js/qasm-gutter.js`): line-level OpenQASM classifier (aligns with quantum-prefixes symbols)

## Pipeline export

**Export pipeline** writes `pipeline/submission-{timestamp}.json` with QASM, preflight summary, waveform snapshot, and portal hints (IBM Quantum, Braket, etc.).

## Concept steering (Bloch tangents → trending fields)

[`pipeline/concept-forks.json`](pipeline/concept-forks.json) holds Bloch-related concepts grouped into three **trending research fields**. The **`by_field`** object is the **canonical index** for training exporters: ordered id lists per field (`qec_hardware`, `pqc_qday`, `quantum_internet`). Each id must appear exactly once across `by_field` and must resolve to a node in `roots["quantum bloch"].chips`, `mueee_nodes`, or `extended_nodes`.

- **Browser**: load [`js/concept-steer.js`](js/concept-steer.js), then `await ConceptSteer.load()` and `ConceptSteer.trainingRows('quantum bloch')` (default `by_field` order). Use `ConceptSteer.validateByFieldIndex()` after edits to the JSON.
- **CLI**: `node scripts/export-concept-training.mjs` prints JSON rows; `--format ndjson` for one JSON object per line; `--validate` checks `by_field` id resolution and exits non-zero on mismatch.

## WASM build (optional)

```bash
cd rust/qasm-lite && wasm-pack build --target web --out-dir ../../wasm/pkg
```

Reload composer — **Analyze (WASM)** uses the Rust parser when `wasm/pkg` exists; otherwise JS fallback runs.

## Env

- `MUEEE_ROOT` — path to mueee tree (default: `/Users/qbit/dev/mueee`) for symlinked scripts
