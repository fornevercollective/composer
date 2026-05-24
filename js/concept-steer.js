/**
 * Concept tangents / forks — pipeline/concept-forks.json
 * Google Images chips + μeee Bloch corpus → three trending research fields.
 */
(function (root) {
  'use strict';

  const FORKS_URL = 'pipeline/concept-forks.json';
  let cache = null;

  function allNodes(data) {
    const list = [];
    const r = data.roots && data.roots['quantum bloch'];
    if (r && r.chips) list.push(...r.chips);
    if (data.mueee_nodes) list.push(...data.mueee_nodes);
    if (data.extended_nodes) list.push(...data.extended_nodes);
    return list;
  }

  function indexGraph(data) {
    const byId = new Map();
    allNodes(data).forEach((n) => {
      byId.set(n.id, { ...n, root: 'quantum bloch' });
    });
    const byField = { qec_hardware: [], pqc_qday: [], quantum_internet: [] };
    if (data.by_field) {
      Object.keys(data.by_field).forEach((k) => {
        byField[k] = (data.by_field[k] || [])
          .map((id) => byId.get(id))
          .filter(Boolean);
      });
    } else {
      byId.forEach((n) => {
        const f = n.trending_field;
        if (f && byField[f]) byField[f].push(n);
      });
    }
    Object.keys(byField).forEach((k) => {
      byField[k].sort((a, b) => (b.steer_weight || 0) - (a.steer_weight || 0));
    });
    return { data, byId, byField, root: data.roots && data.roots['quantum bloch'] };
  }

  async function load() {
    if (cache) return cache;
    const res = await fetch(FORKS_URL);
    if (!res.ok) throw new Error(`concept-forks: ${res.status}`);
    const data = await res.json();
    cache = indexGraph(data);
    return cache;
  }

  function loadSync(json) {
    cache = indexGraph(json);
    return cache;
  }

  function trendingFields() {
    if (!cache || !cache.data.trending_fields) return [];
    return Object.entries(cache.data.trending_fields)
      .map(([id, meta]) => ({ id, ...meta, count: (cache.byField[id] || []).length }))
      .sort((a, b) => (a.rank || 0) - (b.rank || 0));
  }

  function byField(fieldId) {
    if (!cache) return [];
    return cache.byField[fieldId] || [];
  }

  function chips(rootKey) {
    if (!cache) return [];
    const r = cache.data.roots[rootKey || 'quantum bloch'];
    return (r && r.chips) ? r.chips.slice().sort((a, b) => a.rank - b.rank) : [];
  }

  function mueeeNodes() {
    if (!cache) return [];
    return cache.data.mueee_nodes || [];
  }

  function tangents(rootKey) {
    const r = cache && cache.data.roots[rootKey || 'quantum bloch'];
    if (!r || !r.tangents) {
      return [...cache.byId.values()].filter((n) => n.relation === 'tangent');
    }
    return r.tangents.map((id) => cache.byId.get(id)).filter(Boolean);
  }

  function forks(rootKey) {
    const r = cache && cache.data.roots[rootKey || 'quantum bloch'];
    if (!r || !r.forks) {
      return [...cache.byId.values()].filter((n) => n.relation === 'fork' || n.relation === 'platform');
    }
    return r.forks.map((id) => cache.byId.get(id)).filter(Boolean);
  }

  /** Field ids in trending_fields.rank order (must match pipeline/concept-forks.json by_field keys). */
  function fieldIdsInTrendingOrder() {
    if (!cache || !cache.data.by_field) return [];
    if (!cache.data.trending_fields) return Object.keys(cache.data.by_field);
    return Object.entries(cache.data.trending_fields)
      .sort((a, b) => (a[1].rank || 0) - (b[1].rank || 0))
      .map(([id]) => id)
      .filter((id) => Object.prototype.hasOwnProperty.call(cache.data.by_field, id));
  }

  /** Ensure every id in by_field exists in the graph (editors should fix JSON if this fails). */
  function validateByFieldIndex() {
    if (!cache) return { ok: true, missing: [] };
    const missing = [];
    Object.entries(cache.data.by_field || {}).forEach(([fieldId, ids]) => {
      (ids || []).forEach((id) => {
        if (!cache.byId.has(id)) missing.push({ field: fieldId, id });
      });
    });
    return { ok: missing.length === 0, missing };
  }

  function rowFromNode(n, root, fieldId, fieldIndex) {
    return {
      context: root,
      trending_field: fieldId || n.trending_field,
      field_index: fieldIndex != null ? fieldIndex : null,
      suggestion: n.label,
      relation: n.relation,
      weight: n.steer_weight,
      rank: n.rank != null ? n.rank : null,
      source: n.source || null,
      id: n.id,
      aliases: n.aliases && n.aliases.length ? n.aliases : null
    };
  }

  function steer(text, opts) {
    if (!cache) return [];
    const limit = (opts && opts.limit) || 8;
    const field = opts && opts.field;
    let pool = field ? byField(field) : [...cache.byId.values()];
    const hay = String(text || '').toLowerCase();
    const scored = pool.map((node) => {
      let score = node.steer_weight || 0.5;
      const terms = [node.label, ...(node.aliases || [])].join(' ').toLowerCase().split(/\W+/);
      terms.forEach((t) => {
        if (t.length > 2 && hay.includes(t)) score += 0.15;
      });
      if (node.relation === 'core') score += 0.1;
      return { node, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => ({ ...s.node, score: s.score }));
  }

  /**
   * Training / fine-tune export rows.
   * Default mode `by_field` walks pipeline/concept-forks.json `by_field` in trending_fields rank order
   * — that object is the canonical index for exporters (stable ordering, one row per id).
   * Mode `all_nodes` flattens chips + mueee_nodes + extended_nodes (may duplicate ids; use for audits only).
   */
  function trainingRows(rootKey, opts) {
    if (!cache) return [];
    const root = rootKey || 'quantum bloch';
    const mode = (opts && opts.mode) || 'by_field';
    if (mode === 'all_nodes') {
      return allNodes(cache.data).map((n) => rowFromNode(n, root, n.trending_field, null));
    }
    const rows = [];
    const byF = cache.data.by_field || {};
    fieldIdsInTrendingOrder().forEach((fieldId) => {
      const ids = byF[fieldId] || [];
      ids.forEach((id, fieldIndex) => {
        const n = cache.byId.get(id);
        if (n) rows.push(rowFromNode(n, root, fieldId, fieldIndex));
      });
    });
    return rows;
  }

  root.ConceptSteer = {
    FORKS_URL,
    load,
    loadSync,
    trendingFields,
    byField,
    chips,
    mueeeNodes,
    tangents,
    forks,
    steer,
    trainingRows,
    fieldIdsInTrendingOrder,
    validateByFieldIndex,
    get graph() {
      return cache;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
