#!/usr/bin/env node
/**
 * Offline training exporter — reads pipeline/concept-forks.json and emits rows
 * in the same order as ConceptSteer.trainingRows() with mode "by_field" (canonical).
 *
 * Usage:
 *   node scripts/export-concept-training.mjs
 *   node scripts/export-concept-training.mjs --format ndjson > training.ndjson
 *   node scripts/export-concept-training.mjs --validate
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');
const FORKS = path.join(REPO, 'pipeline', 'concept-forks.json');

function buildById(data) {
  const byId = new Map();
  const add = (n) => {
    if (n && n.id) byId.set(n.id, { ...n, root: 'quantum bloch' });
  };
  const root = data.roots && data.roots['quantum bloch'];
  if (root && root.chips) root.chips.forEach(add);
  (data.mueee_nodes || []).forEach(add);
  (data.extended_nodes || []).forEach(add);
  return byId;
}

function fieldIdsInTrendingOrder(data) {
  const bf = data.by_field || {};
  if (!data.trending_fields) return Object.keys(bf);
  return Object.entries(data.trending_fields)
    .sort((a, b) => (a[1].rank || 0) - (b[1].rank || 0))
    .map(([id]) => id)
    .filter((id) => Object.prototype.hasOwnProperty.call(bf, id));
}

function validateByField(data, byId) {
  const missing = [];
  const bf = data.by_field || {};
  for (const [fieldId, ids] of Object.entries(bf)) {
    for (const id of ids) {
      if (!byId.has(id)) missing.push({ field: fieldId, id });
    }
  }
  return { ok: missing.length === 0, missing };
}

function trainingRowsByField(data, contextRoot) {
  const byId = buildById(data);
  const root = contextRoot || 'quantum bloch';
  const rows = [];
  const byF = data.by_field || {};
  fieldIdsInTrendingOrder(data).forEach((fieldId) => {
    const ids = byF[fieldId] || [];
    ids.forEach((id, fieldIndex) => {
      const n = byId.get(id);
      if (!n) return;
      rows.push({
        context: root,
        trending_field: fieldId,
        field_index: fieldIndex,
        suggestion: n.label,
        relation: n.relation,
        weight: n.steer_weight,
        rank: n.rank != null ? n.rank : null,
        source: n.source || null,
        id: n.id,
        aliases: n.aliases || null
      });
    });
  });
  return { rows, byId };
}

function main() {
  const raw = fs.readFileSync(FORKS, 'utf8');
  const data = JSON.parse(raw);
  const { byId } = trainingRowsByField(data);
  const v = validateByField(data, byId);

  if (process.argv.includes('--validate')) {
    if (!v.ok) {
      console.error(JSON.stringify(v, null, 2));
      process.exit(1);
    }
    console.log(`OK: by_field references resolve (${Object.values(data.by_field).flat().length} ids)`);
    return;
  }

  const { rows } = trainingRowsByField(data);
  const fmt = process.argv.includes('--format') ? process.argv[process.argv.indexOf('--format') + 1] : 'json';

  if (fmt === 'ndjson') {
    rows.forEach((r) => console.log(JSON.stringify(r)));
    return;
  }
  console.log(JSON.stringify({ version: data.version, row_count: rows.length, rows }, null, 2));
}

main();
