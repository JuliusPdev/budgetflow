/* global React, MOCK, V6 */
// V6 — Synthesis. The proposed direction.
// Light cream + periwinkle (from V5). Modern sans only (no serif/italic).
// Cashflow chart kept from V5 (its strongest asset).
// Horizontal month-ledger from V3 (line items as rows, months as columns).
// Three big-number hero from V2 (clean, calm).
// Greeting strip from V4 (single line, no warm-fuzzy).
// Algorithm trace from V3 (small "under the hood" gimmick).
// Framing: planning-simulation first, "spending today" second.

const { T, fSans, fMono, fmt, fmtNs } = window.V6;

function V6Chip({ tone = 'dim', children, style }) {
  const map = {
    dim:    { bg: T.lineSoft,  fg: T.dim,     bd: T.line },
    peri:   { bg: T.periSoft,  fg: T.periStrong, bd: 'transparent' },
    green:  { bg: T.greenSoft, fg: T.greenInk, bd: 'transparent' },
    amber:  { bg: T.amberSoft, fg: T.amberInk, bd: 'transparent' },
    red:    { bg: T.redSoft,   fg: T.red,     bd: 'transparent' },
  };
  const m = map[tone] || map.dim;
  return (
    <span style={{ ...fMono, fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
      padding: '3px 8px', borderRadius: 4, background: m.bg, color: m.fg, border: '1px solid ' + m.bd,
      display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', flexShrink: 0, ...style }}>
      {children}
    </span>
  );
}

function V6Dot({ color = T.dim, size = 6 }) {
  return <span style={{ display: 'inline-block', width: size, height: size, borderRadius: 999, background: color }}/>;
}

// Smoothed Catmull-Rom path through points
function v6SmoothPath(pts) {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i-1)], p1 = pts[i], p2 = pts[i+1], p3 = pts[Math.min(pts.length-1, i+2)];
    const c1x = p1[0] + (p2[0]-p0[0])/6, c1y = p1[1] + (p2[1]-p0[1])/6;
    const c2x = p2[0] - (p3[0]-p1[0])/6, c2y = p2[1] - (p3[1]-p1[1])/6;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

// The hero cashflow chart — V5's chart, modernized type, slightly more data.
function V6CashflowChart() {
  const months = MOCK.months;
  const W = 1232, H = 280, PAD_L = 56, PAD_R = 28, PAD_T = 28, PAD_B = 56;
  const innerW = W - PAD_L - PAD_R, innerH = H - PAD_T - PAD_B;
  const pots = months.map(m => MOCK.monthData[m.key].pot);
  const maxPot = Math.max(...pots) * 1.2;
  const xs = months.map((_, i) => PAD_L + (i / (months.length - 1)) * innerW);
  const ys = pots.map(p => PAD_T + innerH - (p / maxPot) * innerH);
  const pts = xs.map((x, i) => [x, ys[i]]);
  const linePath = v6SmoothPath(pts);
  const areaPath = `${linePath} L${xs[xs.length-1]},${PAD_T+innerH} L${xs[0]},${PAD_T+innerH} Z`;
  const currentIdx = months.findIndex(m => m.state === 'current');

  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      <defs>
        <linearGradient id="v6grad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%"  stopColor={T.peri} stopOpacity="0.28"/>
          <stop offset="100%" stopColor={T.peri} stopOpacity="0"/>
        </linearGradient>
      </defs>

      {/* Y-axis grid */}
      {[0, 0.25, 0.5, 0.75, 1].map(t => (
        <line key={t} x1={PAD_L} x2={W-PAD_R} y1={PAD_T+innerH*t} y2={PAD_T+innerH*t}
              stroke={t===1 ? T.line : T.lineSoft} strokeDasharray={t===1?'0':'3 5'}/>
      ))}

      {/* Current month band */}
      {(() => {
        const left  = currentIdx === 0 ? xs[0] : (xs[currentIdx] + xs[currentIdx-1]) / 2;
        const right = (xs[currentIdx] + xs[currentIdx+1]) / 2;
        return <rect x={left} y={PAD_T} width={right-left} height={innerH} fill={T.periTint} opacity="0.7"/>;
      })()}

      {/* Past-vs-future divider */}
      <line x1={(xs[currentIdx-1] + xs[currentIdx])/2} x2={(xs[currentIdx-1] + xs[currentIdx])/2}
            y1={PAD_T} y2={PAD_T+innerH} stroke={T.subdim} strokeDasharray="2 4" opacity="0.7"/>

      {/* Area + line */}
      <path d={areaPath} fill="url(#v6grad)"/>
      <path d={linePath} fill="none" stroke={T.peri} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>

      {/* Planned expense markers */}
      {MOCK.planned.map(p => {
        const i = months.findIndex(m => m.key === p.month);
        if (i < 0) return null;
        const x = xs[i], y = ys[i];
        return (
          <g key={p.id}>
            <line x1={x} x2={x} y1={y+8} y2={PAD_T+innerH} stroke={T.amber} strokeDasharray="2 3" opacity="0.5"/>
            <circle cx={x} cy={y} r="6" fill={T.amber} stroke={T.surface} strokeWidth="2.5"/>
            <g transform={`translate(${x} ${y-14})`}>
              <rect x="-44" y="-26" width="88" height="22" rx="4" fill={T.surface} stroke={T.line} strokeWidth="1"/>
              <text x="0" y="-15" textAnchor="middle" style={fSans} fontSize="9" fontWeight="600" fill={T.ink}>{p.name}</text>
              <text x="0" y="-6"  textAnchor="middle" style={fMono} fontSize="10" fontWeight="600" fill={T.amber}>−{fmt(p.amount)}</text>
            </g>
          </g>
        );
      })}

      {/* Current point */}
      <circle cx={xs[currentIdx]} cy={ys[currentIdx]} r="8" fill={T.peri} stroke={T.surface} strokeWidth="3"/>
      <circle cx={xs[currentIdx]} cy={ys[currentIdx]} r="3" fill={T.surface}/>

      {/* X labels */}
      {months.map((m, i) => {
        const isCur = m.state === 'current';
        return (
          <g key={m.key}>
            <text x={xs[i]} y={H-30} textAnchor="middle" style={fSans} fontSize="11" fontWeight={isCur?700:500}
                  fill={isCur ? T.peri : (m.state==='past' ? T.subdim : T.dim)}>
              {m.label.toUpperCase()}
            </text>
            <text x={xs[i]} y={H-16} textAnchor="middle" style={fMono} fontSize="10" fill={m.state==='past' ? T.subdim : T.dim}>
              {fmt(pots[i])}
            </text>
          </g>
        );
      })}

      {/* Y axis labels */}
      {[0, 0.5, 1].map(t => (
        <text key={t} x={PAD_L-10} y={PAD_T+innerH*(1-t)+3} textAnchor="end" style={fMono} fontSize="10" fill={T.subdim}>
          {fmt(maxPot*t)}
        </text>
      ))}

      {/* "You are here" label */}
      <text x={xs[currentIdx]+14} y={ys[currentIdx]-12} style={fSans} fontSize="11" fontWeight="700" fill={T.peri}>
        Today
      </text>
    </svg>
  );
}

// Horizontal ledger — months as columns, lines as rows.
// This is the V3 move the user loved: every row's trajectory is left-to-right.
function V6HorizontalLedger() {
  const months = MOCK.months;

  const rows = [
    { kind: 'h',     label: 'Inflow' },
    { kind: 'val',   label: 'Income',                values: months.map(()=>3200),                                                 color: T.ink },
    { kind: 'h',     label: 'Outflow' },
    { kind: 'val',   label: 'Fixed expenses',        values: months.map(()=>-1910),                                                color: T.ink2, neg: true },
    { kind: 'val',   label: 'Savings (rainy day)',   values: months.map(()=>-200),                                                 color: T.ink2, neg: true },
    { kind: 'val',   label: 'Set-aside → pot',       values: months.map(m=>-MOCK.monthData[m.key].setAside),                       color: T.amber, neg: true, weight: 600 },
    { kind: 'planned' },
    { kind: 'sep' },
    { kind: 'val',   label: 'Free to spend',         values: months.map(m=>MOCK.monthData[m.key].freeBudget),                      color: T.peri, weight: 700, big: true, highlight: true },
    { kind: 'val',   label: 'Pot balance (end)',     values: months.map(m=>MOCK.monthData[m.key].pot),                             color: T.ink, weight: 600 },
  ];

  const colW = `repeat(${months.length}, minmax(0, 1fr))`;
  const gridTemplate = `200px ${colW}`;

  const Cell = ({ children, align='right', color, weight, size=12, isCurrent, isPast, bg }) => (
    <div style={{
      ...fMono, fontSize: size, padding: '8px 10px', textAlign: align,
      color: color || (isPast ? T.subdim : T.ink),
      fontWeight: weight || 400,
      background: bg || (isCurrent ? T.periTint : 'transparent'),
      borderLeft: isCurrent ? '2px solid ' + T.peri : '2px solid transparent',
      borderRight: '1px solid ' + T.lineSoft,
    }}>{children}</div>
  );

  return (
    <div style={{ borderTop: '1px solid ' + T.line, borderBottom: '1px solid ' + T.line }}>
      {/* Header row */}
      <div style={{ display: 'grid', gridTemplateColumns: gridTemplate, alignItems: 'stretch', background: T.surface2 }}>
        <div style={{ padding: '10px 12px', ...fMono, fontSize: 10, fontWeight: 600, letterSpacing: '0.12em',
                      textTransform: 'uppercase', color: T.dim }}>Line item</div>
        {months.map(m => {
          const isCur = m.state === 'current';
          return (
            <div key={m.key} style={{
              padding: '10px 8px', textAlign: 'right',
              borderLeft: isCur ? '2px solid ' + T.peri : '2px solid transparent',
              background: isCur ? T.periTint : 'transparent',
              borderRight: '1px solid ' + T.lineSoft,
            }}>
              <div style={{ ...fSans, fontSize: 12, fontWeight: 700, color: isCur ? T.peri : (m.state==='past' ? T.subdim : T.ink), letterSpacing: '-0.01em' }}>
                {m.label} <span style={{ ...fMono, fontSize: 9, color: T.subdim, fontWeight: 500 }}>'26</span>
              </div>
              <div style={{ ...fMono, fontSize: 9, color: T.subdim, marginTop: 2, letterSpacing: '0.08em' }}>
                {isCur ? 'NOW' : m.state === 'past' ? 'CLOSED' : 'PLANNED'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Body rows */}
      {rows.map((r, ri) => {
        if (r.kind === 'h') {
          return (
            <div key={ri} style={{ display: 'grid', gridTemplateColumns: gridTemplate, borderTop: '1px solid ' + T.lineSoft, background: T.surface2 + '88' }}>
              <div style={{ ...fMono, fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
                            color: T.dim, padding: '6px 12px' }}>{r.label}</div>
              {months.map(m => <div key={m.key} style={{ borderLeft: m.state==='current' ? '2px solid '+T.peri : '2px solid transparent', borderRight: '1px solid ' + T.lineSoft, background: m.state==='current' ? T.periTint : 'transparent' }}/>)}
            </div>
          );
        }
        if (r.kind === 'sep') {
          return <div key={ri} style={{ height: 1, background: T.ink, opacity: 0.12 }}/>;
        }
        if (r.kind === 'planned') {
          // One sub-row per planned expense — shows clearly when each lands.
          return (
            <React.Fragment key={ri}>
              {MOCK.planned.map(p => (
                <div key={p.id} style={{ display: 'grid', gridTemplateColumns: gridTemplate, borderTop: '1px solid ' + T.lineSoft }}>
                  <div style={{ ...fSans, fontSize: 12, padding: '8px 12px 8px 32px', color: T.dim, display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 18, top: '50%', width: 6, height: 1, background: T.line }}/>
                    <span style={{ width: 6, height: 6, borderRadius: 2, background: T.amber }}/>
                    <span>{p.name}</span>
                    <span style={{ ...fMono, fontSize: 10, color: T.subdim, marginLeft: 'auto' }}>{fmt(p.amount)}</span>
                  </div>
                  {months.map((m, mi) => {
                    const isCur = m.state === 'current';
                    const isPast = m.state === 'past';
                    const isHit = m.key === p.month;
                    // saving progress: distribute proportionally over months leading up to the hit (illustrative)
                    const startIdx = 0;
                    const hitIdx = months.findIndex(x => x.key === p.month);
                    const savingThis = (mi <= hitIdx && hitIdx > startIdx) ? Math.round(p.amount / (hitIdx + 1)) : 0;
                    return (
                      <div key={m.key} style={{
                        padding: '8px 10px', textAlign: 'right',
                        borderLeft: isCur ? '2px solid ' + T.peri : '2px solid transparent',
                        background: isCur ? T.periTint : 'transparent',
                        borderRight: '1px solid ' + T.lineSoft,
                      }}>
                        {isHit ? (
                          <span style={{ ...fMono, fontSize: 12, fontWeight: 700, color: T.amber }}>−{fmt(p.amount)}</span>
                        ) : mi <= hitIdx && savingThis > 0 ? (
                          <span style={{ ...fMono, fontSize: 11, color: isPast ? T.subdim : T.dim }}>·{fmtNs(savingThis)}</span>
                        ) : (
                          <span style={{ ...fMono, fontSize: 11, color: T.subdim }}>—</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </React.Fragment>
          );
        }
        return (
          <div key={ri} style={{
            display: 'grid', gridTemplateColumns: gridTemplate, borderTop: '1px solid ' + T.lineSoft,
            background: r.highlight ? T.periTint + '55' : 'transparent',
          }}>
            <div style={{
              ...fSans, fontSize: r.big ? 13 : 12, padding: '10px 12px',
              color: r.color, fontWeight: r.weight || 500,
              borderRight: '1px solid ' + T.lineSoft,
            }}>{r.label}</div>
            {months.map(m => {
              const v = r.values[months.indexOf(m)];
              const isCur = m.state === 'current';
              const isPast = m.state === 'past';
              return (
                <Cell key={m.key}
                  color={r.color}
                  weight={r.weight}
                  size={r.big ? 14 : 12}
                  isCurrent={isCur}
                  isPast={isPast}>
                  {r.neg && v < 0 ? '−' : ''}{fmtNs(Math.abs(v))}
                </Cell>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function V6PotCard() {
  return (
    <div style={{ background: T.surface, border: '1px solid '+T.line, borderRadius: 16, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div style={{ ...fMono, fontSize: 10, color: T.dim, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600 }}>The pot · 4 plans</div>
        <V6Chip tone="peri">DRAINS DEC</V6Chip>
      </div>
      <div style={{ ...fSans, fontSize: 44, fontWeight: 700, letterSpacing: '-0.04em', marginTop: 6, color: T.ink }}>€1,240</div>
      <div style={{ ...fSans, fontSize: 12, color: T.dim }}>holding €{MOCK.planned.reduce((s,p)=>s+p.current,0)} of €{MOCK.planned.reduce((s,p)=>s+p.target,0)} planned</div>

      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {MOCK.planned.map(p => {
          const pct = Math.round((p.current/p.target)*100);
          const tone = pct >= 65 ? T.green : pct >= 30 ? T.amber : T.red;
          const m = MOCK.months.find(x => x.key === p.month);
          return (
            <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ ...fSans, fontSize: 13, fontWeight: 500, color: T.ink }}>{p.name}</span>
                  <span style={{ ...fMono, fontSize: 9, color: T.subdim, letterSpacing: '0.08em' }}>{m.label.toUpperCase()}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <div style={{ flex: 1, height: 4, background: T.lineSoft, borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ width: pct + '%', height: '100%', background: tone }}/>
                  </div>
                  <span style={{ ...fMono, fontSize: 10, color: T.dim, minWidth: 28, textAlign: 'right' }}>{pct}%</span>
                </div>
              </div>
              <div style={{ ...fMono, fontSize: 12, color: T.ink, fontWeight: 500, alignSelf: 'center' }}>{fmt(p.amount)}</div>
            </div>
          );
        })}
      </div>

      <button style={{ ...fSans, marginTop: 16, width: '100%', padding: '10px', border: '1px dashed '+T.line, background: 'transparent',
        color: T.dim, fontSize: 12, fontWeight: 500, borderRadius: 10, cursor: 'pointer' }}>
        + Plan another expense
      </button>
    </div>
  );
}

function V6AlgoTrace() {
  return (
    <div style={{ background: T.ink, color: T.surface, borderRadius: 16, padding: 18, position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ ...fMono, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600, color: T.subdim }}>
          Under the hood
        </div>
        <div style={{ ...fMono, fontSize: 9, color: T.subdim, opacity: 0.6 }}>engine.smooth()</div>
      </div>
      <div style={{ ...fMono, fontSize: 11, lineHeight: 1.85 }}>
        <div><span style={{ color: T.peri }}>›</span> <span style={{ color: T.subdim }}>available</span> = 3,200 − 1,910 − 200</div>
        <div style={{ paddingLeft: 14 }}>= <span style={{ color: T.surface, fontWeight: 600 }}>1,090</span>/mo</div>
        <div style={{ marginTop: 6 }}><span style={{ color: T.peri }}>›</span> <span style={{ color: T.subdim }}>planned total</span> = 350 + 900 + 1,800 + 400</div>
        <div style={{ paddingLeft: 14 }}>= <span style={{ color: T.surface, fontWeight: 600 }}>3,450</span> over 8 mo</div>
        <div style={{ marginTop: 6 }}><span style={{ color: T.amber }}>›</span> <span style={{ color: T.subdim }}>binding constraint</span>: Jul · Car</div>
        <div style={{ paddingLeft: 14, color: T.subdim }}>need 520/mo to cover by deadline</div>
        <div style={{ marginTop: 6 }}><span style={{ color: T.peri }}>›</span> <span style={{ color: T.subdim }}>free</span> = 1,090 − 405 = <span style={{ color: '#A5F3B5', fontWeight: 700 }}>685</span></div>
      </div>
    </div>
  );
}

function V6Faithful() { return null; } // placeholder so old import doesn't break

function V6Synthesis() {
  return (
    <div style={{ height: '100%', background: T.bg, color: T.ink, ...fSans, padding: 24, overflow: 'auto', position: 'relative' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: T.peri, display: 'grid', placeItems: 'center', color: 'white', ...fSans, fontSize: 16, fontWeight: 800, letterSpacing: '-0.04em' }}>b</div>
          <div style={{ ...fSans, fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em' }}>BudgetFlow</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {['Plan', 'History', 'Goals', 'Settings'].map((t, i) => (
              <button key={t} style={{
                ...fSans, padding: '5px 12px', borderRadius: 999, border: 'none',
                background: i === 0 ? T.ink : 'transparent', color: i === 0 ? T.surface : T.dim,
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>{t}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ ...fSans, fontSize: 13, color: T.ink }}>
            <span style={{ color: T.dim }}>Mon · 11 May · </span>
            <span style={{ color: T.green, fontWeight: 600 }}>● On track for all 4 plans</span>
          </div>
          <button style={{ ...fSans, padding: '8px 14px', borderRadius: 999, border: '1px solid '+T.line, background: T.surface, fontSize: 12, fontWeight: 600, cursor: 'pointer', color: T.ink }}>
            ↑ Import CSV
          </button>
          <button style={{ ...fSans, padding: '8px 16px', borderRadius: 999, border: 'none', background: T.peri, color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            + Plan expense
          </button>
        </div>
      </div>

      {/* Hero: three big numbers, V2-clean */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div style={{ background: T.surface, border: '1px solid '+T.line, borderRadius: 16, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ ...fMono, fontSize: 10, color: T.dim, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600 }}>Free to spend · May</div>
            <V6Chip tone="green"><V6Dot color={T.green}/>ON TRACK</V6Chip>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 8 }}>
            <div style={{ ...fSans, fontSize: 64, fontWeight: 700, letterSpacing: '-0.045em', lineHeight: 1, color: T.ink }}>€685</div>
            <div style={{ ...fSans, fontSize: 12, color: T.dim }}>
              <div>€127 spent</div>
              <div>€558 left</div>
            </div>
          </div>
          <div style={{ marginTop: 14, height: 6, background: T.lineSoft, borderRadius: 999, overflow: 'hidden', display: 'flex' }}>
            <div style={{ width: '18.5%', background: T.ink }}/>
            <div style={{ width: '81.5%', background: T.peri, opacity: 0.4 }}/>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', ...fMono, fontSize: 9, color: T.subdim, marginTop: 6, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            <span>€127 spent</span><span>20 days to next paycheck</span>
          </div>
        </div>

        <div style={{ background: T.surface, border: '1px solid '+T.line, borderRadius: 16, padding: 20 }}>
          <div style={{ ...fMono, fontSize: 10, color: T.dim, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600 }}>Pot balance</div>
          <div style={{ ...fSans, fontSize: 48, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1, marginTop: 8, color: T.ink }}>€1,240</div>
          <div style={{ ...fSans, fontSize: 12, color: T.green, marginTop: 6, fontWeight: 500 }}>↗ +€295 since April</div>
          <div style={{ marginTop: 12, padding: '8px 10px', background: T.bg, borderRadius: 8, ...fMono, fontSize: 10, color: T.dim, lineHeight: 1.6 }}>
            <div>peaks Oct · €1,560</div>
            <div>drains Dec · €0</div>
          </div>
        </div>

        <div style={{ background: T.surface, border: '1px solid '+T.line, borderRadius: 16, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ ...fMono, fontSize: 10, color: T.dim, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600 }}>Set-aside · May</div>
            <V6Chip tone="amber">€170 to go</V6Chip>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8, whiteSpace: 'nowrap' }}>
            <span style={{ ...fSans, fontSize: 48, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1, color: T.ink }}>€350</span>
            <span style={{ ...fMono, fontSize: 16, color: T.dim, lineHeight: 1 }}>/ 520</span>
          </div>
          <div style={{ marginTop: 14, height: 6, background: T.lineSoft, borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ width: '67%', height: '100%', background: T.amber }}/>
          </div>
          <button style={{ ...fSans, marginTop: 10, width: '100%', padding: '7px', border: 'none', background: T.amber, color: 'white', fontSize: 12, fontWeight: 700, borderRadius: 8, cursor: 'pointer' }}>
            Lock in remaining €170
          </button>
        </div>
      </div>

      {/* Cashflow chart hero */}
      <div style={{ background: T.surface, border: '1px solid '+T.line, borderRadius: 16, padding: '18px 20px 8px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
          <div>
            <div style={{ ...fSans, fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em' }}>Pot trajectory · next 9 months</div>
            <div style={{ ...fSans, fontSize: 12, color: T.dim, marginTop: 2 }}>Engine-smoothed curve. Drop a planned expense onto any future month to simulate.</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, ...fMono, fontSize: 10, color: T.dim, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 16, height: 2, background: T.peri }}/>Pot</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, background: T.amber, borderRadius: 999 }}/>Planned hit</span>
            <div style={{ display: 'flex', gap: 2, padding: 3, background: T.bg, borderRadius: 999, border: '1px solid '+T.line, marginLeft: 8 }}>
              {['9 mo', '12 mo', '24 mo'].map((t,i) => (
                <button key={t} style={{ ...fSans, padding: '4px 10px', borderRadius: 999, border: 'none', background: i===0 ? T.ink : 'transparent', color: i===0 ? T.surface : T.dim, fontSize: 10, fontWeight: 600, cursor: 'pointer', textTransform: 'none', letterSpacing: 0 }}>{t}</button>
              ))}
            </div>
          </div>
        </div>
        <V6CashflowChart />
      </div>

      {/* Bottom: horizontal ledger + side rail */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 304px', gap: 16, alignItems: 'stretch' }}>
        <div style={{ background: T.surface, border: '1px solid '+T.line, borderRadius: 16, padding: '18px 0 0', overflow: 'hidden' }}>
          <div style={{ padding: '0 20px 14px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div>
              <div style={{ ...fSans, fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em' }}>Month-by-month ledger</div>
              <div style={{ ...fSans, fontSize: 12, color: T.dim, marginTop: 2 }}>Each row's trajectory left-to-right. Free-to-spend is the answer; everything else is how the engine gets there.</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={{ ...fMono, fontSize: 10, padding: '4px 10px', borderRadius: 999, border: '1px solid '+T.line, background: T.surface, color: T.dim, cursor: 'pointer', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>↓ Export</button>
              <button style={{ ...fMono, fontSize: 10, padding: '4px 10px', borderRadius: 999, border: '1px solid '+T.line, background: T.surface, color: T.dim, cursor: 'pointer', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>Compact</button>
            </div>
          </div>
          <V6HorizontalLedger />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <V6PotCard />
          <V6AlgoTrace />
        </div>
      </div>
    </div>
  );
}

window.V6Synthesis = V6Synthesis;
window.V6 = window.V6; // already set by tokens
window.V6Tokens = window.V6;
window.V6Chip = V6Chip;
window.V6Dot = V6Dot;
window.V6CashflowChart = V6CashflowChart;
window.v6SmoothPath = v6SmoothPath;
