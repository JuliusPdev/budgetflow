// Shared V6 design tokens — the synthesis direction.
// Light cream surface, periwinkle accent, modern sans (no serif/italic),
// JetBrains Mono for numbers + algorithm traces, horizontal ledger feel.
window.V6 = (function () {
  const T = {
    // surfaces
    bg:        '#F4F1E9',  // canvas — warm cream, slightly more saturated than v5
    surface:   '#FFFFFF',
    surface2:  '#FAF8F2',  // raised-but-quiet (algo trace, csv preview rows)

    // ink
    ink:       '#161620',
    ink2:      '#2D2D3A',
    dim:       '#6E6C7A',
    subdim:    '#A09EAE',
    line:      '#E7E2D5',
    lineSoft:  '#F0ECDF',

    // signal
    peri:      '#5A5FD4',
    periStrong:'#4347C0',
    periSoft:  '#E8E8FA',
    periTint:  '#F1F1FB',

    green:     '#3F9263',
    greenSoft: '#E0EFE6',
    greenInk:  '#1F5E3B',

    amber:     '#C2792A',
    amberSoft: '#F4E7D2',
    amberInk:  '#7A4A12',

    red:       '#BC4438',
    redSoft:   '#F4DAD6',
  };

  const fSans = { fontFamily: "'DM Sans', system-ui, sans-serif" };
  const fMono = { fontFamily: "'JetBrains Mono', 'IBM Plex Mono', monospace", fontVariantNumeric: 'tabular-nums' };

  // Number formatting helpers
  const fmt   = (n) => '€' + Math.round(n).toLocaleString('en-US');
  const fmtNs = (n) => Math.round(n).toLocaleString('en-US');

  return { T, fSans, fMono, fmt, fmtNs };
})();
