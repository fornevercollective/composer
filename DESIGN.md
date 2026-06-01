# composer Design System & Principles

**Status**: Phase 0 foundation (tokens + dark + motion). Living document. Update after every surface addition.

## Core Identity (Fornevercollective Variation)

- **Quantum workbench, not generic SaaS**: Dense but calm. Monospace roots for code/QASM fidelity. Every pixel earns its place (preflight verdicts, error heat, Bloch tension, trajectory paths).
- **Offline-first soul**: Everything works with zero network after load. New features (ECharts, Grok stubs) are strictly optional and degrade gracefully.
- **Trajectory ethos**: Every interaction is a path — QASM edits, gate insertions, batch launches, Bloch evolutions. UI should make paths visible, scrubbable, forkable.
- **Our variation on IBM Composer + AITO**: Visual power and linked views of IBM, but the minimal elegant high-end feel, live "tethered" command surface, and premium micro-details of AITO. Anti-slop from taste-skill + impeccable.

## Design Tokens (Phase 0+)

Defined in `styles/composer.css` `:root`.

**Spacing**: `--space-1` (2px) → `--space-12` (24px). Use for gaps, padding, margins. Default rhythm 4/6/8/12px.

**Typography**: `--type-xs` (9px) → `--type-xl` (16px). Base 12px/1.45 monospace for UI. Tabular nums on metrics.

**Motion**: `--motion-fast` (0.12s), `--motion-med` (0.2s), `--motion-ease` (cubic-bezier(0.2,0,0,1)). Purposeful, never bouncy/elastic. rAF only for live quantum elements (Bloch spin, waveform, trajectory scrubbing).

**Color**:
- `--color-primary` (was hard #0969da) — use for accents, active states, primary actions.
- Semantic: success/warn/error already strong; extend for charts (error gradients green→red).
- Dark: Full palette override via `prefers-color-scheme` + `[data-theme="dark"]`.

**Radii & Shadows**: `--radius-*`, `--shadow-*`. Consistent 3/4/6/8px, subtle elevation only where it aids hierarchy (cards, popovers).

**Migration rule**: No new hard-coded #hex or px literals in new components. Replace high-frequency ones (#0969da x39, 4px/6px/8px padding/gap, button rules) opportunistically.

## Component Language (Extend, Don't Invent)

- **Cards**: `.qasm-card`, `.qasm-card-group` (border-left accent, subtle shadow, hover lift). Use for flight logs, chart controls, mission results.
- **Chips**: `.gutter-chip` (pill, colored prefix). Use for param tags, backend chips, sweep dimensions.
- **Buttons**: `#hdr button` + variants (`.cc-run` primary solid, muted, scroll affordances). Always 1px border or solid primary.
- **Grids & Layout**: `#app` show-* system (ViewerTabs). New surfaces (charts, batch) follow exact pattern.
- **Canvas Hosts**: Always DPR-aware, crisp, minimal chrome. Pair with ECharts canvas renderer when used.

**New surfaces must**:
- Live-update on `refreshAll` / QASM / backend change (hook the central pipeline).
- Participate in BroadcastChannel multi-surface sync.
- Export / import via extended mission bundles.
- Pass "no slop" check (see below).

## Anti-Slop Rules (taste-skill + impeccable)

- No nested cards inside cards.
- No gray text on colored backgrounds.
- No pure black/white in dark mode — always tinted neutrals.
- No bounce/elastic easings.
- No purple-to-blue gradients as default (use semantic + primary blue).
- Motion is purposeful (reveals state change or trajectory), never decorative.
- Perfect alignment & rhythm (tokens enforce).
- Every interactive element has clear affordance + immediate feedback.
- Quantum-specific: error color scale (green healthy → red critical) is sacred; reuse from lattice.

## Motion & Feel (Emil Influence)

- Micro: 120-200ms ease on state changes (tab, card open, cell hover, chart update).
- Live: rAF loops only for physics/trajectory (Bloch, waveform, future sweep scrubbing).
- Delight: Subtle ring on active Bloch point, tension color on trajectory, "launch" pulse on batch run (never overdone).

## Command / Launch Surface (AITO-inspired)

Natural language or chip-based entry that drives QASM mutations or batch launches. "sweep depth 4..12 on ibm_torino low-error" or "fork with error mitigation layer". Always falls back to explicit controls.

## Verification of New Work

Before marking a phase complete:
- All 15-step manual verification + regression checklist in the approved plan.
- New surface uses only tokens (or documents exceptions).
- Dark + light both beautiful.
- Zero network required for core experience.
- DESIGN.md updated with any new patterns/tokens.

## References (Internal North Star)

- AITO (fornevercollective): minimal elegant, AI command bar, PWA, live tether feel, film-accurate detail.
- taste-skill (leonxlnx): variance/motion/density dials, anti-generic, strong typography/spacing/motion.
- impeccable (pbakaus): tokens + 23 commands + anti-pattern detector + domain refs (typography, spatial, motion, color, interaction).
- Emil Kowalski repos: joyful micro-interactions, feel-first components.
- IBM Quantum Composer: visual circuit power + linked analysis + rich result viz (our variation, not copy).

Update this doc after every PR that touches UI. The surface must feel like the premium quantum design tool it is — calm, precise, trajectory-aware, and unmistakably ours.

---

*Phase 0 complete when tokens are in css, dark works, DESIGN.md exists, first 2-3 components migrated, and 4-6 transitions added.*