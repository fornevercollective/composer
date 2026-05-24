/**
 * Pre-loaded QPU calibration snapshots for every backend in the fleet.
 *
 * Why preloaded?
 *  - Composer is offline-first; we cannot fetch live vendor calibrations.
 *  - Downstream consumers (ugrad-r0.html, uvqbit.html tensor model, the T5x
 *    models under /Users/qbit/models/engine) need a stable per-backend
 *    snapshot of qubit errors and coupling paths to ground OpenQASM
 *    suggestions and routing heuristics.
 *
 * Each snapshot has a `ts` (boot-time timestamp) plus deterministic, seeded
 * synthetic numbers that vary by vendor + chip + qubit count. Calling
 * `refresh()` produces a NEW snapshot with a fresh timestamp (used to mimic
 * a calibration cycle without contacting the vendor).
 *
 * Exposed:
 *  - window.QPUCalibrations.get(name)              → snapshot for one backend
 *  - window.QPUCalibrations.all()                  → all backends (cached)
 *  - window.QPUCalibrations.refresh()              → re-roll + republish
 *  - window.QPUCalibrations.toJSON()               → compact export blob
 *  - window.QPUCalibrations.publish(name)          → loopback + storage
 *  - localStorage 'composerIBM.calibration.<name>' → per-backend JSON
 *  - localStorage 'composerIBM.calibration.current'→ active backend snapshot
 *  - BroadcastChannel('quantum-loopback') message:
 *      { type:'qpu-calibration', source:'composerIBM', ts, backend, snapshot }
 */
(function (root) {
  'use strict';

  const STORAGE_PREFIX = 'composerIBM.calibration';
  const CHANNEL = 'quantum-loopback';
  const ALL_KEY = `${STORAGE_PREFIX}.all`;

  let channel = null;
  const cache = new Map();
  let bootTs = Date.now();

  function getChannel() {
    if (channel !== null) return channel;
    if (typeof BroadcastChannel === 'undefined') {
      channel = null;
      return null;
    }
    try {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = onMessage;
    } catch (_) {
      channel = null;
    }
    return channel;
  }

  function onMessage(ev) {
    const d = ev && ev.data;
    if (!d || d.source === 'composerIBM') return;
    if (d.type === 'qpu-calibration-request') {
      const name = d.backend || (root.QPUFleet && root.QPUFleet._selected);
      if (name) publish(name);
    }
  }

  /** Mulberry32 PRNG seeded from a string (stable across reloads per backend). */
  function seedFromString(str) {
    let h = 2166136261 >>> 0;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function makeRng(seed) {
    let a = seed >>> 0;
    return function rng() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function rangeFor(tech) {
    switch (tech) {
      case 'trapped-ion':
        return {
          t1: [10000, 35000], t2: [2000, 6000],
          err1q: [0.00005, 0.00035], err2q: [0.0015, 0.0040],
          readout: [0.002, 0.012], duration1q: [50, 120], duration2q: [120, 320]
        };
      case 'neutral-atom':
        return {
          t1: [3000, 12000], t2: [800, 3500],
          err1q: [0.0010, 0.0040], err2q: [0.0050, 0.0150],
          readout: [0.010, 0.040], duration1q: [200, 600], duration2q: [600, 1400]
        };
      case 'photonic':
        return {
          t1: [80000, 250000], t2: [40000, 120000],
          err1q: [0.0008, 0.0030], err2q: [0.0040, 0.0120],
          readout: [0.005, 0.020], duration1q: [10, 40], duration2q: [40, 160]
        };
      case 'quantum-annealing':
        return {
          t1: [120, 320], t2: [40, 110],
          err1q: [0.0030, 0.0090], err2q: [0.0100, 0.0300],
          readout: [0.010, 0.040], duration1q: [4, 20], duration2q: [4, 20]
        };
      case 'simulator':
        return {
          t1: [Infinity, Infinity], t2: [Infinity, Infinity],
          err1q: [0, 0], err2q: [0, 0],
          readout: [0, 0], duration1q: [0, 0], duration2q: [0, 0]
        };
      case 'superconducting':
      default:
        return {
          t1: [60, 320], t2: [40, 220],
          err1q: [0.00020, 0.00080], err2q: [0.0050, 0.0180],
          readout: [0.005, 0.030], duration1q: [25, 60], duration2q: [180, 520]
        };
    }
  }

  function chipDriftFactor(chip, vendor) {
    if (!chip) return 1;
    const c = String(chip).toLowerCase();
    if (/(heron r2|heron-r2)/.test(c)) return 0.78;
    if (/heron/.test(c)) return 0.86;
    if (/(eagle r3|nighthawk)/.test(c)) return 0.88;
    if (/(eagle)/.test(c)) return 0.96;
    if (/(flamingo)/.test(c)) return 0.90;
    if (/willow/.test(c)) return 0.74;
    if (/(helios|h2)/.test(c)) return 0.70;
    if (/(forte|tempo)/.test(c)) return 0.78;
    if (/(ankaa)/.test(c)) return 0.92;
    if (/(garnet)/.test(c)) return 0.82;
    if (/(fresnel|aquila|phoenix|sqale)/.test(c)) return 0.84;
    if (/(boson)/.test(c)) return 0.88;
    if (/(borealis|mosaiq)/.test(c)) return 0.78;
    if (/(advantage2|advantage)/.test(c)) return 0.95;
    if (/(wuyuan)/.test(c)) return 0.94;
    if (vendor === 'Google' || vendor === 'IBM') return 0.84;
    return 1;
  }

  function pick(rng, [lo, hi]) {
    if (!isFinite(lo) || !isFinite(hi)) return Infinity;
    return lo + (hi - lo) * rng();
  }

  function layoutCols(chip, q) {
    if (/heron/i.test(chip || '')) return 17;
    if (/eagle/i.test(chip || '')) return 15;
    if (/flamingo|nighthawk/i.test(chip || '')) return 16;
    if (/willow/i.test(chip || '')) return 12;
    if (/ankaa/i.test(chip || '')) return 12;
    if (/garnet/i.test(chip || '')) return 12;
    return Math.max(2, Math.ceil(Math.sqrt(Math.max(1, q) * 1.35)));
  }

  /** Heavy-hex / square lattice coupler generator. Returns array of [a,b]. */
  function couplers(q, chip) {
    const cols = layoutCols(chip, q);
    const isHeavyHex = /heron|eagle|flamingo|nighthawk/i.test(chip || '');
    const edges = [];
    for (let i = 0; i < q; i++) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const right = i + 1;
      if (c < cols - 1 && right < q) {
        if (!isHeavyHex || (c + r) % 2 === 0) edges.push([i, right]);
      }
      const down = i + cols;
      if (down < q) {
        if (!isHeavyHex || c % 2 === 0) edges.push([i, down]);
      }
    }
    return edges;
  }

  function makeSnapshot(backend, ts) {
    const tech = backend.tech || 'superconducting';
    const q = Math.max(1, backend.q || 1);
    const seed = seedFromString(`${backend.name}|${backend.chip}|${q}|${tech}`);
    const rng = makeRng(seed);
    const range = rangeFor(tech);
    const drift = chipDriftFactor(backend.chip, backend.vendor);

    const qubits = [];
    for (let i = 0; i < q; i++) {
      qubits.push({
        id: i,
        t1_us: round(pick(rng, range.t1), 1),
        t2_us: round(pick(rng, range.t2), 1),
        err_1q: round(pick(rng, range.err1q) * drift, 6),
        readout_err: round(pick(rng, range.readout) * drift, 5),
        freq_ghz: tech === 'superconducting' ? round(4.6 + rng() * 0.8, 4) : null,
        duration_1q_ns: round(pick(rng, range.duration1q), 1)
      });
    }

    const edges = couplers(q, backend.chip);
    const links = edges.map(([a, b]) => ({
      a,
      b,
      err_2q: round(pick(rng, range.err2q) * drift, 6),
      duration_2q_ns: round(pick(rng, range.duration2q), 1),
      gate: tech === 'superconducting' ? 'cz' : tech === 'trapped-ion' ? 'rxx' : tech === 'photonic' ? 'cz' : 'cx'
    }));

    const stats = aggregateStats(qubits, links);
    return {
      backend: backend.name,
      vendor: backend.vendor,
      chip: backend.chip,
      tech,
      qubits_total: q,
      qubits_modeled: qubits.length,
      ts,
      ts_iso: new Date(ts).toISOString(),
      status: backend.status || 'unknown',
      stats,
      qubits,
      links
    };
  }

  function round(v, p) {
    if (!isFinite(v)) return v;
    const m = Math.pow(10, p);
    return Math.round(v * m) / m;
  }

  function aggregateStats(qubits, links) {
    const arr1 = qubits.map((q) => q.err_1q);
    const arr2 = links.map((l) => l.err_2q);
    const ro = qubits.map((q) => q.readout_err);
    return {
      median_err_1q: round(median(arr1), 6),
      median_err_2q: round(median(arr2), 6),
      worst_err_1q: round(Math.max(...arr1, 0), 6),
      worst_err_2q: round(Math.max(...arr2, 0), 6),
      median_readout: round(median(ro), 5),
      median_t1_us: round(median(qubits.map((q) => q.t1_us)), 1),
      median_t2_us: round(median(qubits.map((q) => q.t2_us)), 1),
      median_dur_2q_ns: round(median(links.map((l) => l.duration_2q_ns)), 1),
      link_count: links.length
    };
  }

  function median(arr) {
    if (!arr.length) return 0;
    const finite = arr.filter((v) => isFinite(v));
    if (!finite.length) return Infinity;
    const sorted = finite.slice().sort((a, b) => a - b);
    const m = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
  }

  function fleet() {
    if (root.QPUFleet && root.QPUFleet.FLEET_ALL) return root.QPUFleet.FLEET_ALL;
    if (root.QPUFleet && root.QPUFleet.FLEET) return root.QPUFleet.FLEET;
    return [];
  }

  function get(name) {
    if (!name) return null;
    if (cache.has(name)) return cache.get(name);
    const list = fleet();
    const backend = list.find((b) => b.name === name);
    if (!backend) return null;
    const snap = makeSnapshot(backend, bootTs);
    cache.set(name, snap);
    safeStore(`${STORAGE_PREFIX}.${name}`, snap);
    return snap;
  }

  function all() {
    const list = fleet();
    const out = {};
    list.forEach((b) => {
      const s = get(b.name);
      if (s) out[b.name] = s;
    });
    return out;
  }

  function refresh() {
    bootTs = Date.now();
    cache.clear();
    const snaps = all();
    safeStore(ALL_KEY, { ts: bootTs, ts_iso: new Date(bootTs).toISOString(), snapshots: snaps });
    publishAll();
    return snaps;
  }

  function toJSON() {
    const snaps = all();
    return {
      ts: bootTs,
      ts_iso: new Date(bootTs).toISOString(),
      version: 1,
      source: 'composerIBM/qpu-calibrations',
      vendors: Array.from(new Set(Object.values(snaps).map((s) => s.vendor))).sort(),
      snapshots: snaps
    };
  }

  function safeStore(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {}
  }

  function publish(name) {
    const snap = get(name);
    if (!snap) return null;
    safeStore(`${STORAGE_PREFIX}.current`, snap);
    const ch = getChannel();
    if (ch) {
      try {
        ch.postMessage({
          type: 'qpu-calibration',
          source: 'composerIBM',
          ts: Date.now(),
          backend: name,
          snapshot: snap
        });
      } catch (_) {}
    }
    try {
      window.dispatchEvent(new CustomEvent('qpu-calibration', { detail: snap }));
    } catch (_) {}
    return snap;
  }

  function publishAll() {
    const blob = toJSON();
    safeStore(ALL_KEY, blob);
    const ch = getChannel();
    if (ch) {
      try {
        ch.postMessage({
          type: 'qpu-calibration-all',
          source: 'composerIBM',
          ts: blob.ts,
          backendCount: Object.keys(blob.snapshots).length
        });
      } catch (_) {}
    }
    try {
      window.dispatchEvent(new CustomEvent('qpu-calibration-all', { detail: blob }));
    } catch (_) {}
    return blob;
  }

  function bootstrap() {
    refresh();
    if (typeof fetch === 'function') {
      fetch('data/qpu-calibrations.json', { cache: 'no-cache' })
        .then((r) => (r.ok ? r.json() : null))
        .then((blob) => {
          if (!blob || !blob.snapshots) return;
          bootTs = blob.ts || bootTs;
          cache.clear();
          Object.entries(blob.snapshots).forEach(([name, snap]) => cache.set(name, snap));
          safeStore(ALL_KEY, blob);
          publishAll();
        })
        .catch(() => {});
    }
  }

  root.QPUCalibrations = {
    get,
    all,
    refresh,
    publish,
    publishAll,
    toJSON,
    storageKey: STORAGE_PREFIX,
    bootstrap
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }
})(typeof window !== 'undefined' ? window : globalThis);
