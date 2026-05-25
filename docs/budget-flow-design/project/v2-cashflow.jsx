/* global React, MOCK */
// V2 — Cashflow Hero. The pot/cashflow curve is the page.
// Aesthetic: deep navy + electric teal accent, generous space, big chart.

const V2_BG = '#0E1525';
const V2_INK = '#E6EAF5';
const V2_DIM = '#7B86A8';
const V2_LINE = '#1A2238';
const V2_TEAL = '#5EEAD4';
const V2_AMBER = '#FBBF24';
const V2_PINK = '#F472B6';

const v2num = { fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums' };

function V2Cashflow() {
  const months = MOCK.months;
  // Build chart paths
  const W = 880, H = 280, P = 32;
  const pots = months.map(m => MOCK.monthData[m.key].pot);
  const fbs  = months.map(m => MOCK.monthData[m.key].freeBudget);
  const maxPot = Math.max(...pots, 1800);
  const x = i => P + (i / (months.length - 1)) * (W - 2*P);
  const yPot = v => H - P - (v / maxPot) * (H - 2*P);
  const yFB  = v => H - P - (v / 1000) * (H - 2*P) * 0.55;
  const potPath = pots.map((v,i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + yPot(v).toFixed(1)).join(' ');
  const potArea = potPath + ` L${x(months.length-1).toFixed(1)} ${H-P} L${x(0).toFixed(1)} ${H-P} Z`;
  const fbPath  = fbs.map((v,i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + yFB(v).toFixed(1)).join(' ');
  const currentIdx = months.findIndex(m => m.state === 'current');

  return (
    <div style={{ height: '100%', background: V2_BG, color: V2_INK, fontFamily: "'DM Sans', sans-serif", padding: 32, display: 'flex', flexDirection: 'column', gap: 24, position: 'relative', overflow: 'hidden' }}>
      {/* ambient glow */}
      <div style={{ position: 'absolute', top: -200, left: -200, width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(94,234,212,.12), transparent)', pointerEvents: 'none' }}/>

      {/* topbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 26, height: 26, borderRadius: 8, background: 'conic-gradient(from 180deg, '+V2_TEAL+', '+V2_PINK+', '+V2_AMBER+', '+V2_TEAL+')' }}/>
          <span style={{ fontWeight: 700, letterSpacing: '-0.4px', fontSize: 17 }}>BudgetFlow</span>
          <span style={{ ...v2num, fontSize: 11, color: V2_DIM, padding: '2px 8px', border: '1px solid '+V2_LINE, borderRadius: 99 }}>MAY · 2026</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ padding: '8px 14px', border: '1px solid '+V2_LINE, background: 'transparent', color: V2_DIM, borderRadius: 10, fontSize: 13, cursor: 'pointer' }}>Plan an expense</button>
          <button style={{ padding: '8px 14px', border: 'none', background: V2_TEAL, color: '#06281f', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Lock in €170</button>
        </div>
      </div>

      {/* Hero numbers row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 16 }}>
        <div style={{ border: '1px solid '+V2_LINE, borderRadius: 18, padding: 22, background: 'linear-gradient(160deg, rgba(94,234,212,.08), transparent 60%)' }}>
          <div style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: V2_DIM }}>Free to spend · May</div>
          <div style={{ ...v2num, fontSize: 64, fontWeight: 700, letterSpacing: '-2px', lineHeight: 1, marginTop: 6, color: V2_TEAL }}>€685</div>
          <div style={{ fontSize: 13, color: V2_DIM, marginTop: 10 }}>after fixed, set-aside &amp; planned · <span style={{ color: V2_INK }}>€127 spent</span> of this</div>
        </div>
        <div style={{ border: '1px solid '+V2_LINE, borderRadius: 18, padding: 22 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: V2_DIM }}>Pot balance</div>
          <div style={{ ...v2num, fontSize: 40, fontWeight: 600, letterSpacing: '-1px', marginTop: 6 }}>€1,240</div>
          <div style={{ fontSize: 12, color: V2_AMBER, marginTop: 8 }}>↗ +€295 vs last month</div>
        </div>
        <div style={{ border: '1px solid '+V2_LINE, borderRadius: 18, padding: 22 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: V2_DIM }}>Set-aside · this month</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
            <span style={{ ...v2num, fontSize: 40, fontWeight: 600, letterSpacing: '-1px' }}>€350</span>
            <span style={{ ...v2num, fontSize: 16, color: V2_DIM }}>/ €520</span>
          </div>
          <div style={{ height: 6, background: V2_LINE, borderRadius: 99, marginTop: 10, overflow: 'hidden' }}>
            <div style={{ width: '67%', height: '100%', background: V2_AMBER }}/>
          </div>
          <div style={{ fontSize: 12, color: V2_AMBER, marginTop: 8 }}>€170 still to lock</div>
        </div>
      </div>

      {/* Cashflow chart hero */}
      <div style={{ border: '1px solid '+V2_LINE, borderRadius: 22, padding: 22, background: 'linear-gradient(180deg, rgba(94,234,212,.04), transparent 70%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Cashflow · next 9 months</span>
            <span style={{ fontSize: 12, color: V2_DIM }}>pot trajectory · free-budget envelope · planned dips</span>
          </div>
          <div style={{ display: 'flex', gap: 14, fontSize: 12, color: V2_DIM }}>
            <span><span style={{ display: 'inline-block', width: 10, height: 2, background: V2_TEAL, marginRight: 6, verticalAlign: 'middle' }}/>Pot</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 2, background: V2_PINK, marginRight: 6, verticalAlign: 'middle' }}/>Free budget</span>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, background: V2_AMBER, marginRight: 6, verticalAlign: 'middle', borderRadius: 4 }}/>Planned</span>
          </div>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 280 }}>
          <defs>
            <linearGradient id="potGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={V2_TEAL} stopOpacity="0.35"/>
              <stop offset="100%" stopColor={V2_TEAL} stopOpacity="0"/>
            </linearGradient>
          </defs>
          {/* grid */}
          {[0,1,2,3].map(i => (
            <line key={i} x1={P} x2={W-P} y1={P + i*(H-2*P)/3} y2={P + i*(H-2*P)/3} stroke={V2_LINE} strokeDasharray="2 4"/>
          ))}
          {/* current month vertical */}
          <line x1={x(currentIdx)} x2={x(currentIdx)} y1={P-6} y2={H-P} stroke={V2_PINK} strokeOpacity="0.5" strokeDasharray="3 3"/>
          <text x={x(currentIdx)+6} y={P+8} fill={V2_PINK} fontSize="10" fontFamily="'JetBrains Mono', monospace">NOW</text>
          {/* pot area & line */}
          <path d={potArea} fill="url(#potGrad)"/>
          <path d={potPath} stroke={V2_TEAL} strokeWidth="2.5" fill="none"/>
          {/* free budget line */}
          <path d={fbPath} stroke={V2_PINK} strokeWidth="1.5" fill="none" strokeDasharray="3 3" opacity="0.7"/>
          {/* planned markers */}
          {months.map((m, i) => {
            const p = MOCK.plannedByMonth[m.key];
            if (!p) return null;
            const amt = p.reduce((s,e)=>s+e.amount,0);
            return (
              <g key={m.key} transform={`translate(${x(i)} ${yPot(MOCK.monthData[m.key].pot)})`}>
                <circle r="6" fill={V2_AMBER} stroke={V2_BG} strokeWidth="2"/>
                <text x="0" y="-14" textAnchor="middle" fill={V2_AMBER} fontSize="10" fontFamily="'JetBrains Mono', monospace">−{MOCK.fmt(amt)}</text>
              </g>
            );
          })}
          {/* labels */}
          {months.map((m, i) => (
            <text key={m.key} x={x(i)} y={H-P+18} textAnchor="middle" fill={m.state === 'current' ? V2_INK : V2_DIM} fontSize="11" fontFamily="'JetBrains Mono', monospace">{m.label}</text>
          ))}
        </svg>
      </div>

      {/* Future expenses + this-month actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16, flex: 1, minHeight: 0 }}>
        <div style={{ border: '1px solid '+V2_LINE, borderRadius: 18, padding: 18 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: V2_DIM, marginBottom: 12 }}>On track for</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {MOCK.planned.map((p, i) => {
              const pct = Math.round((p.current / p.target) * 100);
              const status = pct >= 65 ? 'On track' : pct >= 30 ? 'Tight' : 'Falling behind';
              const sc = pct >= 65 ? V2_TEAL : pct >= 30 ? V2_AMBER : V2_PINK;
              return (
                <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1.4fr 80px 1fr 80px 80px', alignItems: 'center', gap: 16, padding: '10px 4px', borderTop: i ? '1px solid '+V2_LINE : 'none' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: V2_DIM, marginTop: 2 }}>{MOCK.months.find(m => m.key === p.month).long}</div>
                  </div>
                  <div style={{ ...v2num, fontSize: 13 }}>{MOCK.fmt(p.amount)}</div>
                  <div style={{ height: 6, background: V2_LINE, borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ width: pct + '%', height: '100%', background: sc }}/>
                  </div>
                  <div style={{ ...v2num, fontSize: 12, color: sc, textAlign: 'right' }}>{pct}%</div>
                  <div style={{ fontSize: 11, color: sc, textAlign: 'right' }}>{status}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ border: '1px solid '+V2_LINE, borderRadius: 18, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: V2_DIM }}>This week</div>
          <div style={{ padding: 12, borderRadius: 12, background: 'rgba(251,191,36,.08)', border: '1px solid rgba(251,191,36,.25)' }}>
            <div style={{ fontSize: 13, color: V2_AMBER, fontWeight: 600 }}>Lock €170</div>
            <div style={{ fontSize: 12, color: V2_DIM, marginTop: 4 }}>to finish May's set-aside</div>
          </div>
          <div style={{ padding: 12, borderRadius: 12, background: 'rgba(94,234,212,.05)', border: '1px solid '+V2_LINE }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Settle Groceries envelope</div>
            <div style={{ fontSize: 12, color: V2_DIM, marginTop: 4 }}>budgeted €450</div>
          </div>
          <div style={{ padding: 12, borderRadius: 12, border: '1px dashed '+V2_LINE, color: V2_DIM, fontSize: 13, textAlign: 'center', cursor: 'pointer' }}>
            + Plan future expense
          </div>
        </div>
      </div>
    </div>
  );
}

window.V2Cashflow = V2Cashflow;
