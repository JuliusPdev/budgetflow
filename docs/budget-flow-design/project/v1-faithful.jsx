/* global React, MOCK */
const { useState } = React;

// V1 — Pixel-faithful recreation of the current BudgetFlow app.
// Inline CSS variables match the live app's tokens exactly.

const V1_TOKENS = {
  '--v1-accent': '#6B6FD4',
  '--v1-accent-light': '#B8C0FF',
  '--v1-accent-dark': '#4A4D9E',
  '--v1-bg': '#F4F5FF',
  '--v1-bg-subtle': '#F0F1FF',
  '--v1-bg-card': '#FFFFFF',
  '--v1-border': '#F0F0F0',
  '--v1-text': '#111111',
  '--v1-text-sec': '#6B7280',
  '--v1-text-muted': '#9CA3AF',
  '--v1-healthy': '#15803d',
  '--v1-tight': '#a16207',
  '--v1-critical': '#dc2626',
  '--v1-savings': '#6d28d9',
  '--v1-irregular': '#b45309',
  fontFamily: "'DM Sans', system-ui, sans-serif",
  height: '100%',
  background: 'var(--v1-bg)',
  color: 'var(--v1-text)',
  fontSize: 15,
  lineHeight: 1.5
};

const v1 = {
  num: { fontFamily: "'IBM Plex Mono', monospace", fontVariantNumeric: 'tabular-nums' }
};

function V1Header() {
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 5,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 16px', height: 52,
      background: 'var(--v1-bg)', borderBottom: '1px solid var(--v1-border)'
    }}>
      <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.4px' }}>BudgetFlow</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', borderRadius: 12,
          border: '1px solid var(--v1-border)', background: 'transparent',
          color: 'var(--v1-text-sec)', fontSize: 14, fontWeight: 500, cursor: 'pointer'
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-15-6.7L3 13" /></svg>
          Undo
        </button>
        <button style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 36, height: 36, borderRadius: 12,
          border: '1px solid var(--v1-border)', background: 'transparent',
          color: 'var(--v1-text-sec)', cursor: 'pointer'
        }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
        </button>
      </div>
    </header>);

}

function V1Briefing() {
  return (
    <div style={{
      background: 'var(--v1-accent-light)',
      borderRadius: 24, padding: 24,
      display: 'flex', flexDirection: 'column', gap: 16, backgroundColor: "rgb(255, 255, 255)"
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--v1-text-muted)' }}>
          Free budget this month
        </span>
        <span style={{ ...v1.num, fontSize: 48, fontWeight: 700, letterSpacing: '-1.5px', lineHeight: 1, color: 'var(--v1-accent)' }}>
          €685
        </span>
      </div>

      <hr style={{ height: 1, background: 'rgba(0,0,0,.08)', border: 'none', margin: '4px 0' }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--v1-text-muted)' }}>
          Currently saving for
        </span>
        {MOCK.planned.map((p, i) => {
          const pct = Math.round(p.current / p.target * 100);
          const dot = i === 0 ? '#dc2626' : i === 1 ? '#a16207' : '#15803d';
          return (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: dot, flexShrink: 0 }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{p.name}</span>
                <span style={{ fontSize: 12, color: 'var(--v1-text-muted)' }}>
                  {MOCK.months.find((m) => m.key === p.month).long} · {MOCK.fmt(p.amount)}
                </span>
              </div>
              <div style={{ width: 64, height: 6, borderRadius: 99, background: '#E5E7EB', overflow: 'hidden' }}>
                <div style={{ width: pct + '%', height: '100%', background: 'var(--v1-accent)' }} />
              </div>
            </div>);

        })}
      </div>

      <hr style={{ height: 1, background: 'rgba(0,0,0,.08)', border: 'none', margin: '4px 0' }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--v1-text-muted)' }}>
          Savings goals
        </span>
        {MOCK.savingsGoals.map((g) => {
          if (g.mode === 'monthly') {
            return (
              <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span>{g.name}</span>
                <span style={{ color: 'var(--v1-savings)' }}>{MOCK.fmt(g.monthlyAmount)}/mo</span>
              </div>);

          }
          const pct = Math.round(g.current / g.target * 100);
          return (
            <div key={g.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, alignItems: 'baseline' }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{g.name}</span>
                <span style={{ fontSize: 13, color: 'var(--v1-text-sec)' }}>
                  {MOCK.fmt(g.current)} / {MOCK.fmt(g.target)} · {g.deadline}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ flex: 1, height: 6, borderRadius: 99, background: '#E5E7EB', overflow: 'hidden' }}>
                  <div style={{ width: pct + '%', height: '100%', background: 'var(--v1-savings)' }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--v1-savings)' }}>{pct}%</span>
              </div>
            </div>);

        })}
      </div>

      <hr style={{ height: 1, background: 'rgba(0,0,0,.08)', border: 'none', margin: '4px 0' }} />

      <p style={{ margin: 0, fontSize: 13, color: 'var(--v1-text-sec)' }}>
        Set aside an additional <strong>€170</strong> this month.
      </p>
    </div>);

}

function V1CurrentMonth() {
  return (
    <div style={{
      background: '#fff',
      borderLeft: '4px solid var(--v1-accent)',
      borderRadius: 20, padding: 24,
      display: 'flex', flexDirection: 'column', gap: 16,
      boxShadow: '0 2px 12px rgba(0,0,0,0.06)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.3px' }}>May 2026</span>
        <span style={{
          fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px',
          padding: '3px 10px', borderRadius: 99,
          background: 'var(--v1-accent-light)', color: 'var(--v1-accent-dark)'
        }}>Current Month</span>
      </div>
      <hr style={{ height: 1, background: 'var(--v1-border)', border: 'none', margin: 0 }} />

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 14, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--v1-text-sec)' }}>Income</span>
        <span style={{ ...v1.num, fontSize: 14, fontWeight: 600 }}>€3,200</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0, fontSize: 14, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--v1-text-sec)', cursor: 'pointer' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
          Fixed expenses
        </button>
        <span style={{ ...v1.num, fontSize: 14, fontWeight: 600 }}>− €1,910</span>
      </div>
      <hr style={{ height: 1, background: 'var(--v1-border)', border: 'none', margin: 0 }} />

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <button style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0, fontSize: 14, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--v1-text-sec)', cursor: 'pointer' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
            Spent this month
          </button>
          <span style={{ ...v1.num, fontSize: 14, fontWeight: 600, color: '#111' }}>− €127</span>
        </div>
        {MOCK.spentThisMonth.map((s) =>
        <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 8px', fontSize: 13, color: 'var(--v1-text-sec)' }}>
            <span>{s.name}</span>
            <span style={{ ...v1.num, color: '#111' }}>{MOCK.fmt(s.amount)}</span>
          </div>
        )}
        <button style={{
          width: '100%', marginTop: 4, padding: 7,
          background: 'none', border: '1px dashed var(--v1-border)', borderRadius: 8,
          color: 'var(--v1-text-muted)', fontSize: 13, cursor: 'pointer'
        }}>+ Add expense</button>
      </div>
      <hr style={{ height: 1, background: 'var(--v1-border)', border: 'none', margin: 0 }} />

      <div style={{ background: 'var(--v1-bg-subtle)', border: '1px solid var(--v1-border)', borderRadius: 8, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0, fontSize: 14, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--v1-text-sec)', cursor: 'pointer' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
            Set aside this month
          </button>
          <span style={{ ...v1.num, fontSize: 14, fontWeight: 600 }}>€350</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 15 }}>Locked</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={v1.num}>€350</span>
            <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 99, background: '#FEFCE8', color: '#CA8A04', border: '1px solid #FDE68A' }}>Additional needed</span>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 15, color: 'var(--v1-tight)' }}>Still need</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ ...v1.num, color: 'var(--v1-tight)' }}>€170.00</span>
            <button style={{
              padding: '6px 12px', borderRadius: 12,
              background: 'transparent', color: 'var(--v1-accent)',
              border: '1.5px solid var(--v1-accent)', fontSize: 13, fontWeight: 500, cursor: 'pointer'
            }}>Lock additional</button>
          </div>
        </div>
      </div>

      <hr style={{ height: 1, background: 'var(--v1-border)', border: 'none', margin: 0 }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--v1-border)' }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--v1-text-sec)' }}>Pot</span>
        <span style={{ ...v1.num, fontSize: 13, fontWeight: 600, color: 'var(--v1-text-sec)' }}>€1,240</span>
      </div>
    </div>);

}

function V1MonthCard({ m, idx }) {
  const isPast = m.state === 'past';
  const isCurrent = m.state === 'current';
  const data = MOCK.monthData[m.key];
  const planned = MOCK.plannedByMonth[m.key] || [];
  const fbColor = data.freeBudget > 300 ? '#111' : data.freeBudget > 150 ? '#a16207' : '#dc2626';
  const opacity = isPast ? 0.7 : 1;
  return (
    <div style={{
      flexShrink: 0, width: 260,
      background: isPast ? '#F8F8F8' : '#fff',
      border: isCurrent ? '1px solid var(--v1-accent-light)' : 'none',
      borderRadius: 20, padding: 16,
      display: 'flex', flexDirection: 'column', gap: 12,
      boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
      opacity
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{m.long}</span>
        {isCurrent && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: 'var(--v1-accent-light)', color: 'var(--v1-accent-dark)' }}>NOW</span>}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
        <span style={{ color: 'var(--v1-text-sec)' }}>Income</span>
        <span style={v1.num}>€3,200</span>
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: 14, textTransform: 'uppercase', color: 'var(--v1-text-sec)' }}>
          <span>Fixed</span>
          <span style={{ ...v1.num, color: '#111' }}>− €1,910</span>
        </div>
      </div>

      {planned.length > 0 &&
      <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: 14, textTransform: 'uppercase', color: 'var(--v1-text-sec)' }}>
            <span>Planned</span>
            <span style={{ ...v1.num, color: 'var(--v1-irregular)' }}>− {MOCK.fmt(planned.reduce((s, e) => s + e.amount, 0))}</span>
          </div>
          {planned.map((e) =>
        <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 8px', fontSize: 13, color: 'var(--v1-text-sec)' }}>
              <span>{e.name}</span>
              <span style={{ ...v1.num, color: 'var(--v1-irregular)' }}>{MOCK.fmt(e.amount)}</span>
            </div>
        )}
        </div>
      }

      {(isCurrent || isPast) &&
      <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: 14, textTransform: 'uppercase', color: 'var(--v1-text-sec)' }}>
            <span>Spent</span>
            <span style={v1.num}>{data.unplannedTotal > 0 ? '− ' + MOCK.fmt(data.unplannedTotal) : '—'}</span>
          </div>
        </div>
      }

      {data.setAside > 0 &&
      <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: 14, textTransform: 'uppercase', color: 'var(--v1-text-sec)' }}>
            <span>Set aside</span>
            <span style={v1.num}>{MOCK.fmt(data.setAside)}</span>
          </div>
        </div>
      }

      <div style={{ paddingTop: 8, marginTop: 'auto', borderTop: '1px solid var(--v1-border)', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--v1-text-sec)' }}>Free budget</span>
        <span style={{ ...v1.num, fontSize: 28, fontWeight: 700, letterSpacing: '-0.8px', color: fbColor }}>{MOCK.fmt(data.freeBudget)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--v1-text-sec)' }}>Pot</span>
        <span style={{ ...v1.num, fontSize: 13, fontWeight: 600, color: 'var(--v1-text-sec)' }}>{MOCK.fmt(data.pot)}</span>
      </div>
    </div>);

}

function V1Faithful() {
  return (
    <div style={V1_TOKENS}>
      <V1Header />
      <main style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
          <V1Briefing />
          <V1CurrentMonth />
        </div>
        <div style={{ margin: '0 -16px', position: 'relative' }}>
          <div style={{ display: 'flex', gap: 16, overflow: 'hidden', padding: '4px 16px 16px' }}>
            {MOCK.months.map((m, i) => <V1MonthCard key={m.key} m={m} idx={i} />)}
          </div>
          <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 48, background: 'linear-gradient(to right, transparent, var(--v1-bg))', pointerEvents: 'none' }} />
        </div>
      </main>
      <button style={{
        position: 'absolute', bottom: 24, right: 24,
        width: 56, height: 56, borderRadius: 28,
        background: 'var(--v1-accent)', color: '#fff', border: 'none',
        boxShadow: '0 4px 16px rgba(107,111,212,0.4)', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
      </button>
    </div>);

}

window.V1Faithful = V1Faithful;