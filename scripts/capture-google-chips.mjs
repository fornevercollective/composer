#!/usr/bin/env node
/**
 * Capture Google Images refinement chips for a query (for refreshing concept-forks.json).
 *
 * Option A — SerpApi (needs SERPAPI_KEY):
 *   SERPAPI_KEY=... node scripts/capture-google-chips.mjs "quantum bloch"
 *
 * Option B — paste DOM text from #hdtb-sc .IUOThf:
 *   node scripts/capture-google-chips.mjs --paste "Ac stark Bloch sphere Floquet ..."
 */
const query = process.argv[2] || 'quantum bloch';
const pasteIdx = process.argv.indexOf('--paste');
const pasteText = pasteIdx >= 0 ? process.argv.slice(pasteIdx + 1).join(' ') : '';

function chipsFromPaste(text) {
  const labels = (text.includes('|') ? text.split('|') : text.split(/\s{2,}/))
    .map((s) => s.trim())
    .filter(Boolean);
  return labels.map((label, i) => ({
    label,
    rank: i + 1,
    relation: 'refinement',
    steer_weight: Math.max(0.5, 1 - i * 0.03)
  }));
}

async function chipsFromSerpApi(q) {
  const key = process.env.SERPAPI_KEY;
  if (!key) throw new Error('Set SERPAPI_KEY for live capture');
  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'google_images');
  url.searchParams.set('q', q);
  url.searchParams.set('api_key', key);
  const res = await fetch(url);
  const data = await res.json();
  const related = data.related_searches || data.suggested_searches || [];
  return related.map((r, i) => ({
    label: r.query || r.title || r.name,
    rank: i + 1,
    relation: 'refinement',
    steer_weight: Math.max(0.5, 1 - i * 0.03),
    link: r.link
  }));
}

async function main() {
  const chips = pasteText ? chipsFromPaste(pasteText) : await chipsFromSerpApi(query);
  const out = {
    query,
    captured: new Date().toISOString(),
    source: pasteText ? 'dom_paste' : 'serpapi',
    dom_hint: '#hdtb-sc .IUOThf[role=list]',
    chips
  };
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
