/**
 * Precision crosshair cursor for the entire composer work surface.
 * Inspired by high-precision pointing in https://mueee.qbitos.ai/go-ugrad.html (Go board intersection clicking).
 * Subtle, performant, respects interactive elements and existing canvas dragging.
 * Uses design tokens from Phase 0.
 */
(function (root) {
  'use strict';

  const ID = 'precision-crosshair';
  let container = null;
  let hLine = null;
  let vLine = null;
  let centerDot = null;
  let enabled = true;
  let raf = null;

  function create() {
    if (container) return;

    container = root.document.createElement('div');
    container.id = ID;
    container.style.cssText = `
      position:fixed;top:0;left:0;width:100%;height:100%;
      pointer-events:none;z-index:99999;opacity:0.65;
      display:none;
    `;

    const color = 'var(--color-primary, #0969da)';
    const thickness = '1px';

    hLine = root.document.createElement('div');
    hLine.style.cssText = `
      position:absolute;left:0;right:0;height:${thickness};
      background:${color};box-shadow:0 0 1px rgba(0,0,0,0.3);
      transform:translateY(-50%);
    `;

    vLine = root.document.createElement('div');
    vLine.style.cssText = `
      position:absolute;top:0;bottom:0;width:${thickness};
      background:${color};box-shadow:0 0 1px rgba(0,0,0,0.3);
      transform:translateX(-50%);
    `;

    // Small center gap / precision dot (classic CAD / design tool look)
    centerDot = root.document.createElement('div');
    centerDot.style.cssText = `
      position:absolute;width:5px;height:5px;border:1px solid ${color};
      border-radius:50%;background:transparent;
      transform:translate(-50%, -50%);box-shadow:0 0 2px rgba(255,255,255,0.6);
      left:0;top:0;
    `;

    container.appendChild(hLine);
    container.appendChild(vLine);
    container.appendChild(centerDot);
    root.document.body.appendChild(container);

    // Hide on interactive elements that need normal cursor
    const interactiveSelector = 'button, input, select, textarea, a, .cc-cell, .cc-op, .lat-cal-load, .view-tab, .qasm-card, .gutter-chip, canvas';

    root.document.addEventListener('mousemove', (e) => {
      if (!enabled || !container) return;

      const target = e.target;
      const overInteractive = target.closest(interactiveSelector) ||
                              target.tagName === 'CANVAS' && target.id !== 'cv-bloch-panel'; // allow on main Bloch for precision

      if (overInteractive) {
        container.style.display = 'none';
        return;
      }

      container.style.display = 'block';

      const x = e.clientX;
      const y = e.clientY;

      // Use transform for performance
      hLine.style.top = `${y}px`;
      vLine.style.left = `${x}px`;
      centerDot.style.left = `${x}px`;
      centerDot.style.top = `${y}px`;
    }, { passive: true });

    root.document.addEventListener('mouseleave', () => {
      if (container) container.style.display = 'none';
    });

    // Hide when precision mode not desired (e.g. during Bloch drag)
    root.document.addEventListener('mousedown', (e) => {
      if (container && e.target.closest('canvas')) {
        container.style.display = 'none';
      }
    });

    root.document.addEventListener('mouseup', () => {
      if (container && enabled) container.style.display = 'block';
    });

    // Keyboard toggle: Shift + C
    root.document.addEventListener('keydown', (e) => {
      if (e.shiftKey && (e.key.toLowerCase() === 'c' || e.key === 'C')) {
        enabled = !enabled;
        if (container) container.style.display = enabled ? 'block' : 'none';
        e.preventDefault();
      }
    });

    // Initial hide until first move
    container.style.display = 'none';
  }

  function enable() {
    enabled = true;
    if (container) container.style.display = 'block';
  }

  function disable() {
    enabled = false;
    if (container) container.style.display = 'none';
  }

  function toggle() {
    if (enabled) disable(); else enable();
  }

  // Public API
  root.PrecisionCursor = {
    init: create,
    enable,
    disable,
    toggle,
    isEnabled: () => enabled
  };

  // Auto-init on load (design surface feel)
  if (root.document.readyState === 'loading') {
    root.document.addEventListener('DOMContentLoaded', create);
  } else {
    create();
  }
})(typeof window !== 'undefined' ? window : globalThis);