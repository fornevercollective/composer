/**
 * QPU fleet — from uvqbit QPUS (28 backends · 6 modalities).
 * Select: north→south within each UTC band, grouped by hub + codex city + total qubits.
 * Codex glyphs match uvqbit Quantum Geographic Codex (Globe · Codex · Map).
 */
(function (root) {
  'use strict';

  const CODEX_MAP_URL = 'https://mueee.qbitos.ai/uvqbit.html';

  /** IBM codename → city on the Geographic Codex map (lat/lon are map pins, not DC). */
  const IBM_CODEX_CITY = {
    ibm_torino: 'Torino',
    ibm_strasbourg: 'Strasbourg',
    ibm_brussels: 'Brussels',
    ibm_aachen: 'Aachen',
    ibm_miami: 'Miami',
    ibm_pittsburgh: 'Pittsburgh',
    ibm_boston: 'Boston',
    ibm_fez: 'Fez',
    ibm_marrakesh: 'Marrakesh',
    ibm_kingston: 'Kingston'
  };

  const FLEET = [
    { name: 'iqm_garnet', chip: 'Garnet', q: 150, region: 'Espoo, FI', lat: 60.21, lon: 24.66, tech: 'superconducting', vendor: 'IQM', status: 'online' },
    { name: 'ibm_brussels', chip: 'Eagle', q: 127, region: 'Ehningen, DE', lat: 50.85, lon: 4.35, tech: 'superconducting', vendor: 'IBM', status: 'online' },
    { name: 'ibm_aachen', chip: 'Eagle', q: 156, region: 'Ehningen, DE', lat: 50.78, lon: 6.08, tech: 'superconducting', vendor: 'IBM', status: 'degraded' },
    { name: 'dwave_advantage2', chip: 'Advantage2', q: 4400, region: 'Burnaby, BC', lat: 49.26, lon: -122.95, tech: 'quantum-annealing', vendor: 'D-Wave', status: 'online' },
    { name: 'ibm_strasbourg', chip: 'Eagle', q: 127, region: 'Ehningen, DE', lat: 48.57, lon: 7.75, tech: 'superconducting', vendor: 'IBM', status: 'online' },
    { name: 'quandela_mosaiq', chip: 'MosaiQ', q: 12, region: 'Massy, FR', lat: 48.73, lon: 2.27, tech: 'photonic', vendor: 'Quandela', status: 'online' },
    { name: 'pasqal_fresnel', chip: 'Fresnel', q: 200, region: 'Massy, FR', lat: 48.73, lon: 2.27, tech: 'neutral-atom', vendor: 'Pasqal', status: 'online' },
    { name: 'alice_bob_boson4', chip: 'Boson 4', q: 4, region: 'Paris, FR', lat: 48.86, lon: 2.35, tech: 'superconducting', vendor: 'Alice & Bob', status: 'online' },
    { name: 'ibm_torino', chip: 'Heron r1', q: 133, region: 'Ehningen, DE', lat: 45.07, lon: 7.69, tech: 'superconducting', vendor: 'IBM', status: 'online' },
    { name: 'xanadu_borealis', chip: 'Borealis', q: 216, region: 'Toronto, ON', lat: 43.65, lon: -79.38, tech: 'photonic', vendor: 'Xanadu', status: 'online' },
    { name: 'ibm_boston', chip: 'Flamingo', q: 156, region: 'Yorktown, NY', lat: 42.36, lon: -71.06, tech: 'superconducting', vendor: 'IBM', status: 'maint' },
    { name: 'quera_aquila', chip: 'Aquila', q: 280, region: 'Boston, MA', lat: 42.36, lon: -71.06, tech: 'neutral-atom', vendor: 'QuEra', status: 'online' },
    { name: 'ibm_pittsburgh', chip: 'Eagle r3', q: 127, region: 'Poughkeepsie, NY', lat: 40.44, lon: -79.99, tech: 'superconducting', vendor: 'IBM', status: 'online' },
    { name: 'quantinuum_h2', chip: 'H2', q: 56, region: 'Broomfield, CO', lat: 39.92, lon: -105.09, tech: 'trapped-ion', vendor: 'Quantinuum', status: 'online' },
    { name: 'quantinuum_helios', chip: 'Helios', q: 98, region: 'Broomfield, CO', lat: 39.92, lon: -105.09, tech: 'trapped-ion', vendor: 'Quantinuum', status: 'online' },
    { name: 'infleqtion_sqale', chip: 'SQale', q: 1600, region: 'Louisville, CO', lat: 39.98, lon: -105.13, tech: 'neutral-atom', vendor: 'Infleqtion', status: 'online' },
    { name: 'atom_computing', chip: 'Phoenix', q: 1225, region: 'Boulder, CO', lat: 40.01, lon: -105.27, tech: 'neutral-atom', vendor: 'Atom Computing', status: 'online' },
    { name: 'ionq_forte', chip: 'Forte', q: 36, region: 'College Park, MD', lat: 38.98, lon: -76.94, tech: 'trapped-ion', vendor: 'IonQ', status: 'online' },
    { name: 'ionq_tempo', chip: 'Tempo', q: 64, region: 'College Park, MD', lat: 38.98, lon: -76.94, tech: 'trapped-ion', vendor: 'IonQ', status: 'online' },
    { name: 'rigetti_ankaa3', chip: 'Ankaa-3', q: 84, region: 'Berkeley, CA', lat: 37.87, lon: -122.27, tech: 'superconducting', vendor: 'Rigetti', status: 'online' },
    { name: 'psiquantum_q1', chip: 'Q1', q: 0, region: 'Palo Alto, CA', lat: 37.44, lon: -122.14, tech: 'photonic', vendor: 'PsiQuantum', status: 'development' },
    { name: 'ibm_fez', chip: 'Heron r2', q: 156, region: 'Poughkeepsie, NY', lat: 34.03, lon: -5.0, tech: 'superconducting', vendor: 'IBM', status: 'online' },
    { name: 'google_willow', chip: 'Willow', q: 105, region: 'Santa Barbara, CA', lat: 34.42, lon: -119.7, tech: 'superconducting', vendor: 'Google', status: 'online' },
    { name: 'ibm_marrakesh', chip: 'Heron r2', q: 156, region: 'Poughkeepsie, NY', lat: 31.63, lon: -8.0, tech: 'superconducting', vendor: 'IBM', status: 'online' },
    { name: 'origin_wuyuan', chip: 'Wuyuan', q: 72, region: 'Hefei, CN', lat: 31.82, lon: 117.23, tech: 'superconducting', vendor: 'Origin Quantum', status: 'online' },
    { name: 'ibm_miami', chip: 'Nighthawk r1', q: 120, region: 'Miami, FL', lat: 25.76, lon: -80.19, tech: 'superconducting', vendor: 'IBM', status: 'online' },
    { name: 'ibm_kingston', chip: 'Eagle', q: 156, region: 'Kingston, JM', lat: 18.0, lon: -76.79, tech: 'superconducting', vendor: 'IBM', status: 'degraded' }
  ];

  const LOCAL = {
    name: 'local-aer',
    chip: 'Aer simulator',
    q: 32,
    region: 'Local (offline)',
    lat: 0,
    lon: 0,
    tech: 'simulator',
    vendor: 'composerIBM',
    status: 'online'
  };

  function tzFromLon(lon) {
    if (lon == null || lon === 0) return 0;
    const h = Math.round(lon / 15);
    return Math.max(-12, Math.min(14, h));
  }

  function tzLabel(h) {
    if (h === 0) return 'UTC';
    return h > 0 ? `UTC+${h}` : `UTC${h}`;
  }

  function hubKey(q) {
    return q.region || q.name;
  }

  function hubCity(region) {
    if (!region) return '—';
    if (region === 'us-east') return 'Miami';
    const i = region.indexOf(',');
    return (i >= 0 ? region.slice(0, i) : region).trim();
  }

  function codexCity(q) {
    if (!q) return '';
    if (q.city) return q.city;
    if (IBM_CODEX_CITY[q.name]) return IBM_CODEX_CITY[q.name];
    if (q.name === 'origin_wuyuan') return 'Wuyuan';
    return hubCity(q.region) || q.name;
  }

  /** ◉ pinned · ◎ codex ring (IBM virtual / non-online) · ◇ reserved slot */
  function codexGlyph(q) {
    if (!q || q.name === 'local-aer') return '◇';
    if (!q.lat && !q.lon) return '◇';
    if (q.status === 'development' || q.q === 0) return '◇';
    if (q.name.startsWith('ibm_')) return '◎';
    if (q.status === 'degraded' || q.status === 'maint') return '◎';
    return '◉';
  }

  function codexSlotLabel(q) {
    return `${codexGlyph(q)}{${codexCity(q)}}`;
  }

  function codexMapUrl(backend, tab) {
    const params = new URLSearchParams();
    const q = getByName(backend);
    if (backend && backend !== 'local-aer') params.set('backend', backend);
    if (q) params.set('codex', codexCity(q));
    if (tab) params.set('tab', tab);
    const qs = params.toString();
    return qs ? `${CODEX_MAP_URL}?${qs}` : CODEX_MAP_URL;
  }

  function searchableText(q) {
    const tz = tzLabel(tzFromLon(q.lon));
    return [
      q.name,
      q.chip,
      q.q,
      `${q.q}q`,
      q.region,
      hubCity(q.region),
      codexCity(q),
      q.tech,
      q.vendor,
      q.status,
      tz,
      q.lat,
      q.lon
    ]
      .filter((v) => v != null)
      .join(' ')
      .toLowerCase();
  }

  function filterFleet(list, query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return list.slice();
    const parts = q.split(/\s+/).filter(Boolean);
    return list.filter((unit) => {
      const hay = searchableText(unit);
      return parts.every((p) => hay.includes(p));
    });
  }

  function sortFleet(list, mode) {
    const sortMode = mode || 'timezone';
    return list.slice().sort((a, b) => {
      if (sortMode === 'q-desc') {
        if ((b.q || 0) !== (a.q || 0)) return (b.q || 0) - (a.q || 0);
        return a.name.localeCompare(b.name);
      }
      if (sortMode === 'q-asc') {
        if ((a.q || 0) !== (b.q || 0)) return (a.q || 0) - (b.q || 0);
        return a.name.localeCompare(b.name);
      }
      if (sortMode === 'name') return a.name.localeCompare(b.name);
      if (sortMode === 'region') {
        const ra = `${hubCity(a.region)} ${a.region || ''}`;
        const rb = `${hubCity(b.region)} ${b.region || ''}`;
        const rr = ra.localeCompare(rb);
        if (rr !== 0) return rr;
        return (b.q || 0) - (a.q || 0);
      }
      const ta = tzFromLon(a.lon);
      const tb = tzFromLon(b.lon);
      if (tb !== ta) return tb - ta;
      return (b.lat || 0) - (a.lat || 0);
    });
  }

  function buildLocationGroups(list, mode) {
    const sorted = sortFleet(list, mode === 'region' ? 'region' : 'timezone');
    const groups = [];
    let cur = null;

    sorted.forEach((q) => {
      const tz = tzFromLon(q.lon);
      const hub = hubKey(q);
      const key = `${tz}|${hub}`;
      if (!cur || cur.key !== key) {
        cur = {
          key,
          tz,
          tzLabel: tzLabel(tz),
          hub,
          hubCity: hubCity(hub),
          codexCities: [],
          lat: q.lat,
          units: [],
          totalQ: 0
        };
        groups.push(cur);
      }
      cur.units.push(q);
      cur.totalQ += q.q || 0;
      const cc = codexCity(q);
      if (cc && cur.codexCities.indexOf(cc) < 0) cur.codexCities.push(cc);
      if (q.lat > (cur.lat || -90)) cur.lat = q.lat;
    });

    return groups;
  }

  function backendsMap() {
    const m = { 'local-aer': { qubits: LOCAL.q, name: LOCAL.name, ...LOCAL } };
    FLEET.forEach((q) => {
      m[q.name] = { qubits: q.q, name: q.name, ...q };
    });
    return m;
  }

  function getByName(name) {
    if (name === 'local-aer') return LOCAL;
    return FLEET.find((q) => q.name === name) || null;
  }

  function optionLabel(q) {
    const st = q.status === 'online' ? '●' : q.status === 'maint' ? '◐' : '○';
    return `${st} ${q.name} · ${q.q}q · ${codexSlotLabel(q)}`;
  }

  function optionShort(q) {
    const st = q.status === 'online' ? '●' : q.status === 'maint' ? '◐' : '○';
    const short = q.name.replace(/^ibm_/, '').replace(/^quantinuum_/, 'q·').replace(/^ionq_/, '');
    return `${st} ${short} · ${q.q}q`;
  }

  function appendOption(parent, q, meta) {
    const opt = document.createElement('option');
    const tz = tzLabel(tzFromLon(q.lon));
    opt.value = q.name;
    opt.textContent = optionShort(q);
    opt.title = optionLabel(q);
    opt.dataset.lat = String(q.lat);
    opt.dataset.lon = String(q.lon);
    opt.dataset.region = meta && meta.hub ? meta.hub : q.region;
    opt.dataset.city = codexCity(q);
    opt.dataset.codex = codexGlyph(q);
    opt.dataset.tz = meta && meta.tzLabel ? meta.tzLabel : tz;
    opt.dataset.q = String(q.q || 0);
    opt.dataset.chip = q.chip || '';
    opt.dataset.vendor = q.vendor || '';
    opt.dataset.tech = q.tech || '';
    parent.appendChild(opt);
  }

  function populateSelect(selectEl, selectedName, opts) {
    if (!selectEl) return;
    const options = opts || {};
    const prev = selectedName || selectEl.value;
    selectEl.innerHTML = '';

    const mode = options.sort || 'q-desc';
    const filtered = filterFleet(FLEET, options.query);

    if (mode === 'timezone' || mode === 'region') {
      const locGroups = buildLocationGroups(filtered, mode);

      locGroups.forEach((g) => {
        const og = document.createElement('optgroup');
        const codexBand =
          g.codexCities.length > 0
            ? `{${g.codexCities.join(' · ')}}`
            : `{${g.hubCity}}`;
        og.label = `${g.tzLabel} · ${g.hubCity} · ${codexBand} · ${g.totalQ}q · ${g.units.length} unit${g.units.length > 1 ? 's' : ''}`;
        g.units.forEach((q) => appendOption(og, q, g));
        selectEl.appendChild(og);
      });
    } else {
      const sorted = sortFleet(filtered, mode);
      const og = document.createElement('optgroup');
      og.label =
        mode === 'q-asc'
          ? 'Qubit count · low to high'
          : mode === 'name'
            ? 'Backend name · A to Z'
            : 'Qubit count · high to low';
      sorted.forEach((q) => appendOption(og, q));
      selectEl.appendChild(og);
    }

    const sim = document.createElement('optgroup');
    sim.label = 'Offline · no billing';
    if (!options.query || searchableText(LOCAL).includes(String(options.query).toLowerCase())) {
      appendOption(sim, LOCAL);
      selectEl.appendChild(sim);
    }

    if (prev && Array.from(selectEl.options).some((o) => o.value === prev)) selectEl.value = prev;
    else if (Array.from(selectEl.options).some((o) => o.value === 'ibm_torino')) selectEl.value = 'ibm_torino';
    else if (selectEl.options.length) selectEl.value = selectEl.options[0].value;
  }

  function searchSuggestions() {
    const terms = new Set();
    [...FLEET, LOCAL].forEach((q) => {
      [
        q.name,
        `${q.q}q`,
        String(q.q),
        q.region,
        hubCity(q.region),
        codexCity(q),
        q.chip,
        q.vendor,
        q.tech,
        q.status,
        tzLabel(tzFromLon(q.lon))
      ].forEach((v) => {
        if (v) terms.add(String(v));
      });
    });
    return Array.from(terms).sort((a, b) => a.localeCompare(b));
  }

  function locationSummary() {
    const groups = buildLocationGroups(FLEET);
    return groups.map((g) => ({
      tz: g.tzLabel,
      hub: g.hub,
      hubCity: g.hubCity,
      codex: g.codexCities.length ? `{${g.codexCities.join(' · ')}}` : `{${g.hubCity}}`,
      totalQ: g.totalQ,
      count: g.units.length,
      lat: g.lat
    }));
  }

  function formatBackendDetail(name) {
    const q = getByName(name);
    if (!q) return '';
    const tz = tzLabel(tzFromLon(q.lon));
    const geo =
      q.lat && q.lon
        ? ` · ${Math.abs(q.lat).toFixed(1)}°${q.lat >= 0 ? 'N' : 'S'} ${Math.abs(q.lon).toFixed(1)}°${q.lon >= 0 ? 'E' : 'W'}`
        : '';
    return `${codexSlotLabel(q)} · ${q.region} · ${tz}${geo} · ${q.q}q · ${q.chip} · ${q.status}`;
  }

  function init(selectId, detailId) {
    const sel = document.getElementById(selectId || 'backend');
    populateSelect(sel);
    const updateDetail = () => {
      const d = document.getElementById(detailId || 'backend-detail');
      if (d) d.textContent = formatBackendDetail(sel.value);
      if (root.QbitPreflightLite) {
        root.QPUFleet._selected = sel.value;
      }
    };
    sel.addEventListener('change', updateDetail);
    updateDetail();
    return sel;
  }

  root.QPUFleet = {
    FLEET,
    LOCAL,
    CODEX_MAP_URL,
    IBM_CODEX_CITY,
    FLEET_ALL: [...FLEET, LOCAL],
    sortFleet,
    buildLocationGroups,
    backendsMap,
    getByName,
    optionLabel,
    optionShort,
    populateSelect,
    filterFleet,
    searchableText,
    searchSuggestions,
    locationSummary,
    formatBackendDetail,
    hubCity,
    codexCity,
    codexGlyph,
    codexSlotLabel,
    codexMapUrl,
    tzFromLon,
    tzLabel,
    init
  };
})(typeof window !== 'undefined' ? window : globalThis);
