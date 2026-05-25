/* global React, MOCK */
// V5 — Hybrid. The proposed direction: bridges spreadsheet rigor with modern,
// delightful UI. Light, warm-neutral surface; signal color = periwinkle (kept from original);
// dataviz as hero; dense ledger as supporting section; type pairing Fraunces + DM Sans + IBM Plex Mono.
// Three-row layout: hero (where am I + what to do) / cashflow viz / monthly ledger.

const C = {
  bg: '#F6F4EE', surface: '#FFFFFF', ink: '#181822', dim: '#6F6D7A', line: '#E9E5DA',
  peri: '#6B6FD4', periSoft: '#E8E8F8',
  green: '#46A06A', greenSoft: '#E2F1E8',
  amber: '#C97A2A', amberSoft: '#F6E9D8',
  red: '#C0463B',
};

const fSerif = { fontFamily: "'Fraunces', serif" };
const fSans = { fontFamily: "'DM Sans', sans-serif" };
const fMono = { fontFamily: "'IBM Plex Mono', monospace", fontVariantNumeric: 'tabular-nums' };

function Kbd({ children }) {
  return <span style={{ ...fMono, display: 'inline-block', padding: '1px 6px', border: '1px solid '+C.line, borderRadius: 4, fontSize: 10, color: C.dim, background: '#FAF8F2' }}>{children}</span>;
}

function V5Hybrid() {
  const months = MOCK.months;
  const W = 1216, H = 220, PAD_L = 56, PAD_R = 24, PAD_T = 24, PAD_B = 36;
  const innerW = W - PAD_L - PAD_R, innerH = H - PAD_T - PAD_B;
  const pots = months.map(m => MOCK.monthData[m.key].pot);
  const maxPot = Math.max(...pots) * 1.15;
  const xs = months.map((_, i) => PAD_L + (i / (months.length - 1)) * innerW);
  const ys = pots.map(p => PAD_T + innerH - (p / maxPot) * innerH);
  // Smooth via simple Catmull-Rom -> bezier
  function smoothPath(pts) {
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
  const pts = xs.map((x, i) => [x, ys[i]]);
  const linePath = smoothPath(pts);
  const areaPath = `${linePath} L${xs[xs.length-1]},${PAD_T+innerH} L${xs[0]},${PAD_T+innerH} Z`;
  const currentIdx = months.findIndex(m => m.state === 'current');

  return (
    <div style={{ height: '100%', background: C.bg, color: C.ink, ...fSans, padding: 24, overflow: 'auto' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: C.peri, display: 'grid', placeItems: 'center', color: 'white', ...fSerif, fontWeight: 700, fontStyle: 'italic' }}>b</div>
          <div>
            <div style={{ ...fSerif, fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em' }}>BudgetFlow</div>
          </div>
          <div style={{ display: 'flex', gap: 4, marginLeft: 20 }}>
            {['Overview', 'Plan', 'Pots & goals', 'History'].map((t,i) => (
              <button key={t} style={{ ...fSans, padding: '6px 12px', borderRadius: 999, border: 'none', background: i===0 ? C.ink : 'transparent', color: i===0 ? C.bg : C.dim, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>{t}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ ...fMono, fontSize: 11, color: C.dim }}>⌘K to jump anywhere</div>
          <button style={{ ...fSans, padding: '8px 14px', borderRadius: 999, border: '1px solid '+C.line, background: C.surface, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Quick log</button>
          <button style={{ ...fSans, padding: '8px 16px', borderRadius: 999, border: 'none', background: C.peri, color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Plan expense</button>
        </div>
      </div>

      {/* Hero row: where am I + what to do */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Main answer */}
        <div style={{ background: C.surface, border: '1px solid '+C.line, borderRadius: 20, padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={{ ...fMono, fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.12em' }}>May 2026 · free to spend</div>
            <div style={{ ...fMono, fontSize: 11, color: C.green, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: C.green }}></span>ON TRACK
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 10 }}>
            <div style={{ ...fSerif, fontSize: 84, fontWeight: 500, lineHeight: 1, letterSpacing: '-0.04em' }}>€685</div>
            <div style={{ ...fSans, fontSize: 13, color: C.dim }}>
              <div>of €812 unrestricted</div>
              <div>after €127 spent</div>
            </div>
          </div>
          {/* Progress segments */}
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', background: C.line }}>
              <div style={{ width: '15.6%', background: C.peri }}></div>
              <div style={{ width: '84.4%', background: C.greenSoft, borderLeft: '1px solid '+C.line }}></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, ...fMono, fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              <span>Spent €127</span>
              <span>Remaining €685</span>
            </div>
          </div>
          {/* Algorithm trace */}
          <div style={{ marginTop: 18, padding: 14, background: C.bg, borderRadius: 12, ...fMono, fontSize: 11, color: C.dim, lineHeight: 1.7 }}>
            <span style={{ color: C.ink }}>€3,200</span> income − <span style={{ color: C.ink }}>€1,910</span> fixed − <span style={{ color: C.ink }}>€200</span> savings − <span style={{ color: C.ink }}>€405</span> set-aside = <span style={{ color: C.peri, fontWeight: 600 }}>€685</span>
          </div>
        </div>

        {/* Lock in card */}
        <div style={{ background: C.peri, color: 'white', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ ...fMono, fontSize: 11, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Action for this week</div>
            <div style={{ ...fSerif, fontSize: 26, fontWeight: 500, fontStyle: 'italic', lineHeight: 1.15, marginTop: 8 }}>Lock in €170 to fully cover May's set-aside</div>
            <div style={{ ...fSans, fontSize: 13, opacity: 0.85, marginTop: 8 }}>You've locked €350 of €520. Otherwise July's car service eats into next month's free budget.</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18 }}>
            <button style={{ ...fSans, padding: '10px 16px', borderRadius: 999, border: 'none', background: 'white', color: C.peri, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Lock €170 →</button>
            <button style={{ ...fSans, padding: '10px 14px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.4)', background: 'transparent', color: 'white', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Defer</button>
          </div>
        </div>

        {/* Pot card */}
        <div style={{ background: C.surface, border: '1px solid '+C.line, borderRadius: 20, padding: 24 }}>
          <div style={{ ...fMono, fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.12em' }}>The pot · holding 4 plans</div>
          <div style={{ ...fSerif, fontSize: 48, fontWeight: 500, lineHeight: 1, letterSpacing: '-0.03em', marginTop: 8 }}>€1,240</div>
          <div style={{ ...fSans, fontSize: 12, color: C.dim, marginTop: 4 }}>fully drains by Dec — that's by design</div>
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {MOCK.planned.map(p => {
              const pct = Math.round((p.current/p.target)*100);
              return (
                <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
                  <div>
                    <div style={{ ...fSans, fontSize: 12, fontWeight: 500 }}>{p.name}</div>
                    <div style={{ height: 4, marginTop: 4, background: C.line, borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ width: pct+'%', height: '100%', background: pct >= 65 ? C.green : pct >= 30 ? C.amber : C.red }}></div>
                    </div>
                  </div>
                  <div style={{ ...fMono, fontSize: 10, color: C.dim }}>{months.find(m=>m.key===p.month).label.toUpperCase()}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Cashflow hero chart */}
      <div style={{ background: C.surface, border: '1px solid '+C.line, borderRadius: 20, padding: 24, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ ...fSerif, fontSize: 22, fontWeight: 500, fontStyle: 'italic' }}>Pot trajectory · next 9 months</div>
            <div style={{ ...fSans, fontSize: 13, color: C.dim, marginTop: 2 }}>Curve smoothed by the engine. Markers show planned expense hits. <Kbd>drag</Kbd> to reschedule.</div>
          </div>
          <div style={{ display: 'flex', gap: 4, padding: 4, background: C.bg, borderRadius: 999, border: '1px solid '+C.line }}>
            {['9 mo', '12 mo', '24 mo'].map((t,i) => (
              <button key={t} style={{ ...fSans, padding: '4px 12px', borderRadius: 999, border: 'none', background: i===0 ? C.ink : 'transparent', color: i===0 ? C.bg : C.dim, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>{t}</button>
            ))}
          </div>
        </div>
        <svg width={W} height={H} style={{ display: 'block' }}>
          <defs>
            <linearGradient id="v5grad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={C.peri} stopOpacity="0.25"/>
              <stop offset="100%" stopColor={C.peri} stopOpacity="0"/>
            </linearGradient>
          </defs>
          {[0,0.25,0.5,0.75,1].map(t => (
            <line key={t} x1={PAD_L} x2={W-PAD_R} y1={PAD_T+innerH*t} y2={PAD_T+innerH*t} stroke={C.line} strokeDasharray={t===1?'0':'2 4'}/>
          ))}
          {/* Highlight current month band */}
          {(() => {
            const left = currentIdx === 0 ? xs[0] : (xs[currentIdx] + xs[currentIdx-1])/2;
            const right = (xs[currentIdx] + xs[currentIdx+1])/2;
            return <rect x={left} y={PAD_T} width={right-left} height={innerH} fill={C.periSoft} opacity="0.5"/>;
          })()}
          <path d={areaPath} fill="url(#v5grad)"/>
          <path d={linePath} fill="none" stroke={C.peri} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
          {/* Planned expense markers */}
          {MOCK.planned.map(p => {
            const i = months.findIndex(m => m.key === p.month);
            if (i < 0) return null;
            return (
              <g key={p.id}>
                <circle cx={xs[i]} cy={ys[i]} r="5" fill={C.amber} stroke={C.surface} strokeWidth="2"/>
                <text x={xs[i]} y={ys[i]-12} textAnchor="middle" style={fMono} fontSize="10" fill={C.ink}>−€{p.amount}</text>
                <text x={xs[i]} y={ys[i]-24} textAnchor="middle" style={fSans} fontSize="10" fill={C.dim}>{p.name}</text>
              </g>
            );
          })}
          {/* Current point */}
          <circle cx={xs[currentIdx]} cy={ys[currentIdx]} r="7" fill={C.peri} stroke="white" strokeWidth="3"/>
          {/* Labels */}
          {months.map((m, i) => (
            <text key={m.key} x={xs[i]} y={H-14} textAnchor="middle" style={fMono} fontSize="10" fill={m.state==='current'?C.peri:C.dim} fontWeight={m.state==='current'?600:400}>
              {m.label.toUpperCase()}
            </text>
          ))}
          {[0,0.5,1].map(t => (
            <text key={t} x={PAD_L-8} y={PAD_T+innerH*(1-t)+3} textAnchor="end" style={fMono} fontSize="10" fill={C.dim}>€{Math.round(maxPot*t)}</text>
          ))}
        </svg>
      </div>

      {/* Ledger row */}
      <div style={{ background: C.surface, border: '1px solid '+C.line, borderRadius: 20, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ ...fSerif, fontSize: 20, fontWeight: 500, fontStyle: 'italic' }}>Month-by-month detail</div>
          <div style={{ display: 'flex', gap: 12, ...fMono, fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, background: C.peri, borderRadius: 2 }}></span>Free</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, background: C.amberSoft, border: '1px solid '+C.amber, borderRadius: 2 }}></span>Set-aside</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, background: C.line, borderRadius: 2 }}></span>Pot end</span>
          </div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...fMono, textAlign: 'left', padding: '10px 12px', fontSize: 10, color: C.dim, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', borderBottom: '1px solid '+C.line }}>Month</th>
              <th style={{ ...fMono, textAlign: 'right', padding: '10px 12px', fontSize: 10, color: C.dim, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', borderBottom: '1px solid '+C.line }}>Free budget</th>
              <th style={{ ...fMono, textAlign: 'right', padding: '10px 12px', fontSize: 10, color: C.dim, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', borderBottom: '1px solid '+C.line }}>Set-aside</th>
              <th style={{ ...fMono, textAlign: 'left', padding: '10px 12px', fontSize: 10, color: C.dim, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', borderBottom: '1px solid '+C.line }}>Planned</th>
              <th style={{ ...fMono, textAlign: 'right', padding: '10px 12px', fontSize: 10, color: C.dim, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', borderBottom: '1px solid '+C.line }}>Pot end</th>
              <th style={{ padding: '10px 12px', borderBottom: '1px solid '+C.line }}></th>
            </tr>
          </thead>
          <tbody>
            {months.map(m => {
              const d = MOCK.monthData[m.key];
              const planned = MOCK.plannedByMonth[m.key] || [];
              const isCur = m.state === 'current';
              return (
                <tr key={m.key} style={{ background: isCur ? C.periSoft + '55' : 'transparent' }}>
                  <td style={{ ...fSans, padding: '10px 12px', fontSize: 13, fontWeight: isCur ? 600 : 500, borderBottom: '1px solid '+C.line, color: m.state === 'past' ? C.dim : C.ink }}>
                    {m.long} {isCur && <span style={{ ...fMono, fontSize: 9, color: C.peri, marginLeft: 8, padding: '2px 6px', background: 'white', border: '1px solid '+C.peri, borderRadius: 4 }}>NOW</span>}
                  </td>
                  <td style={{ ...fMono, padding: '10px 12px', textAlign: 'right', fontSize: 14, fontWeight: 600, color: C.peri, borderBottom: '1px solid '+C.line }}>{MOCK.fmt(d.freeBudget)}</td>
                  <td style={{ ...fMono, padding: '10px 12px', textAlign: 'right', fontSize: 13, color: C.amber, borderBottom: '1px solid '+C.line }}>{MOCK.fmt(d.setAside)}</td>
                  <td style={{ ...fSans, padding: '10px 12px', fontSize: 12, color: C.dim, borderBottom: '1px solid '+C.line }}>
                    {planned.length === 0 ? <span style={{ color: C.dim+'88' }}>—</span> : planned.map(p => (
                      <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 8px', background: C.amberSoft, color: C.amber, borderRadius: 999, fontSize: 11, fontWeight: 500, marginRight: 6 }}>
                        {p.name} · {MOCK.fmt(p.amount)}
                      </span>
                    ))}
                  </td>
                  <td style={{ ...fMono, padding: '10px 12px', textAlign: 'right', fontSize: 13, color: d.pot === 0 ? C.dim : C.ink, borderBottom: '1px solid '+C.line }}>{MOCK.fmt(d.pot)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', borderBottom: '1px solid '+C.line }}>
                    <button style={{ ...fSans, padding: '4px 10px', borderRadius: 999, border: '1px solid '+C.line, background: 'transparent', fontSize: 11, color: C.dim, cursor: 'pointer' }}>Open</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

    </div>
  );
}

window.V5Hybrid = V5Hybrid;
