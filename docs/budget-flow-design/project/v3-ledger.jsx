/* global React, MOCK */
// V3 — Ledger Pro. Linear/Bloomberg energy. Mono everywhere, dense table,
// comparison-first. Strict greyscale + one signal color (chartreuse).

const V3_BG = '#0B0B0B';
const V3_PANEL = '#121212';
const V3_LINE = '#1F1F1F';
const V3_INK = '#E8E8E8';
const V3_DIM = '#7A7A7A';
const V3_MUTED = '#4A4A4A';
const V3_GREEN = '#C6FF3D';
const V3_RED = '#FF5C5C';
const V3_AMBER = '#FFB020';

const v3mono = { fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums' };

function V3Cell({ children, align = 'right', color, weight, size = 12 }) {
  return <td style={{ ...v3mono, padding: '7px 10px', textAlign: align, color: color || V3_INK, fontWeight: weight || 400, fontSize: size, borderBottom: '1px solid '+V3_LINE, whiteSpace: 'nowrap' }}>{children}</td>;
}

function V3Ledger() {
  const months = MOCK.months;
  const rows = [
    { label: 'Income',           values: months.map(() => 3200), color: V3_INK },
    { label: 'Fixed expenses',   values: months.map(() => -1910), color: V3_RED, sub: true },
    { label: 'Savings (Mode B)', values: months.map(() => -200), color: V3_RED, sub: true },
    { label: 'Set-aside',        values: months.map(m => -MOCK.monthData[m.key].setAside), color: V3_AMBER, sub: true },
    { label: 'Planned outflow',  values: months.map(m => -(MOCK.plannedByMonth[m.key]?.reduce((s,e)=>s+e.amount,0) || 0)), color: V3_AMBER, sub: true },
    { label: 'Free budget',      values: months.map(m => MOCK.monthData[m.key].freeBudget), color: V3_GREEN, bold: true },
    { label: 'Pot balance',      values: months.map(m => MOCK.monthData[m.key].pot), color: V3_INK },
  ];

  return (
    <div style={{ height: '100%', background: V3_BG, color: V3_INK, fontFamily: "'JetBrains Mono', monospace", padding: 0, display: 'flex', flexDirection: 'column' }}>
      {/* Top status bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', borderBottom: '1px solid '+V3_LINE, fontSize: 11 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <span style={{ fontWeight: 700, letterSpacing: '0.2em' }}>BUDGETFLOW</span>
          <span style={{ color: V3_DIM }}>WORKSPACE / MAY 2026 / 9-MONTH HORIZON</span>
        </div>
        <div style={{ display: 'flex', gap: 18, color: V3_DIM }}>
          <span>FREE <span style={{ color: V3_GREEN }}>€685</span></span>
          <span>POT <span style={{ color: V3_INK }}>€1,240</span></span>
          <span>SET-ASIDE <span style={{ color: V3_AMBER }}>€350 / 520</span></span>
          <span>NEXT EXP <span style={{ color: V3_INK }}>Car · Jul</span></span>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 1, background: V3_LINE, borderBottom: '1px solid '+V3_LINE }}>
        {[
          { k: 'FREE BUDGET',    v: '€685',    s: '+11.9% vs Apr', c: V3_GREEN },
          { k: 'POT TRAJECTORY', v: '€0 → Dec', s: 'fully drains by deadline', c: V3_INK },
          { k: 'ON-TRACK ITEMS', v: '3 / 4',   s: 'Lisbon trip at 35%',        c: V3_AMBER },
          { k: 'LOCK STATUS',    v: '€170 short', s: 'finish lock by 25 May', c: V3_AMBER },
          { k: 'RUNWAY',         v: '7.2 mo',  s: 'at current free-rate',     c: V3_INK },
        ].map((kpi, i) => (
          <div key={i} style={{ background: V3_BG, padding: '14px 16px' }}>
            <div style={{ fontSize: 10, letterSpacing: '0.16em', color: V3_DIM }}>{kpi.k}</div>
            <div style={{ fontSize: 22, marginTop: 4, color: kpi.c, fontWeight: 600 }}>{kpi.v}</div>
            <div style={{ fontSize: 10, color: V3_DIM, marginTop: 4 }}>{kpi.s}</div>
          </div>
        ))}
      </div>

      {/* Main grid: ledger table + side rail */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', flex: 1, minHeight: 0 }}>
        {/* Ledger */}
        <div style={{ borderRight: '1px solid '+V3_LINE, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: V3_PANEL }}>
                <th style={{ ...v3mono, textAlign: 'left', padding: '10px 16px', fontSize: 10, letterSpacing: '0.16em', color: V3_DIM, fontWeight: 500, borderBottom: '1px solid '+V3_LINE }}>LINE ITEM</th>
                {months.map(m => (
                  <th key={m.key} style={{ ...v3mono, textAlign: 'right', padding: '10px', fontSize: 10, letterSpacing: '0.16em', color: m.state === 'current' ? V3_GREEN : m.state === 'past' ? V3_MUTED : V3_DIM, fontWeight: 500, borderBottom: '1px solid '+V3_LINE, borderLeft: m.state === 'current' ? '1px solid '+V3_GREEN : 'none' }}>
                    {m.label.toUpperCase()}<br/><span style={{ fontSize: 9, fontWeight: 400 }}>26</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} style={{ background: r.bold ? '#0F1A0A' : 'transparent' }}>
                  <td style={{ ...v3mono, padding: '7px 16px', fontSize: 11, color: r.sub ? V3_DIM : V3_INK, fontWeight: r.bold ? 600 : 400, borderBottom: '1px solid '+V3_LINE, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {r.sub && <span style={{ color: V3_MUTED, marginRight: 6 }}>└</span>}
                    {r.label}
                  </td>
                  {r.values.map((v, vi) => (
                    <V3Cell key={vi} color={r.color} weight={r.bold ? 700 : 400} size={r.bold ? 13 : 12}>
                      {v < 0 ? '−' : ''}{MOCK.fmt(Math.abs(v))}
                    </V3Cell>
                  ))}
                </tr>
              ))}
              {/* Planned items as sub-rows */}
              <tr><td colSpan={months.length+1} style={{ padding: '12px 16px', fontSize: 10, letterSpacing: '0.16em', color: V3_DIM, borderBottom: '1px solid '+V3_LINE }}>── PLANNED EXPENSES</td></tr>
              {MOCK.planned.map(p => (
                <tr key={p.id}>
                  <td style={{ ...v3mono, padding: '7px 16px', fontSize: 11, color: V3_INK, borderBottom: '1px solid '+V3_LINE }}>{p.name}</td>
                  {months.map(m => (
                    <V3Cell key={m.key} color={m.key === p.month ? V3_AMBER : V3_MUTED}>
                      {m.key === p.month ? '−' + MOCK.fmt(p.amount) : '·'}
                    </V3Cell>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Side rail */}
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16, overflow: 'auto' }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: '0.16em', color: V3_DIM, marginBottom: 8 }}>QUICK ACTIONS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button style={{ padding: '10px 12px', background: V3_GREEN, color: '#0B0B0B', border: 'none', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textAlign: 'left', cursor: 'pointer' }}>⌘L · LOCK €170</button>
              <button style={{ padding: '10px 12px', background: V3_PANEL, color: V3_INK, border: '1px solid '+V3_LINE, fontFamily: 'inherit', fontSize: 12, letterSpacing: '0.06em', textAlign: 'left', cursor: 'pointer' }}>⌘N · NEW PLANNED EXPENSE</button>
              <button style={{ padding: '10px 12px', background: V3_PANEL, color: V3_INK, border: '1px solid '+V3_LINE, fontFamily: 'inherit', fontSize: 12, letterSpacing: '0.06em', textAlign: 'left', cursor: 'pointer' }}>⌘S · SETTLE ENVELOPE</button>
              <button style={{ padding: '10px 12px', background: V3_PANEL, color: V3_INK, border: '1px solid '+V3_LINE, fontFamily: 'inherit', fontSize: 12, letterSpacing: '0.06em', textAlign: 'left', cursor: 'pointer' }}>⌘E · LOG SPENDING</button>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 10, letterSpacing: '0.16em', color: V3_DIM, marginBottom: 8 }}>ALGORITHM TRACE</div>
            <div style={{ ...v3mono, fontSize: 11, lineHeight: 1.7, color: V3_DIM }}>
              <div><span style={{ color: V3_GREEN }}>›</span> avail/mo = 3200 − 1910 − 200</div>
              <div style={{ marginLeft: 12 }}>= <span style={{ color: V3_INK }}>1090</span></div>
              <div><span style={{ color: V3_GREEN }}>›</span> set-aside rate = Σ(planned)/9</div>
              <div style={{ marginLeft: 12 }}>= 3450 / 9 = <span style={{ color: V3_INK }}>383</span></div>
              <div><span style={{ color: V3_AMBER }}>›</span> binding: Jul (car)</div>
              <div><span style={{ color: V3_GREEN }}>›</span> seg1 rate = <span style={{ color: V3_INK }}>520</span></div>
              <div><span style={{ color: V3_GREEN }}>›</span> free = 1090 − 405 = <span style={{ color: V3_GREEN }}>685</span></div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 10, letterSpacing: '0.16em', color: V3_DIM, marginBottom: 8 }}>DEADLINES</div>
            <div style={{ ...v3mono, fontSize: 11, lineHeight: 1.9 }}>
              {MOCK.planned.map(p => {
                const pct = Math.round((p.current/p.target)*100);
                return (
                  <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '52px 1fr 38px', gap: 6, color: V3_INK, padding: '4px 0', borderBottom: '1px solid '+V3_LINE }}>
                    <span style={{ color: V3_DIM }}>{MOCK.months.find(m=>m.key===p.month).label.toUpperCase()}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                    <span style={{ color: pct >= 65 ? V3_GREEN : pct >= 30 ? V3_AMBER : V3_RED, textAlign: 'right' }}>{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.V3Ledger = V3Ledger;
