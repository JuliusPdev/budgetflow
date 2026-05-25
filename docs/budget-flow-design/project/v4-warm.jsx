/* global React, MOCK */
// V4 — Warm Editorial. Playful, friendly, cream + ink + tomato accent.
// Fraunces serif for hero numbers, DM Sans for body, mono for ledger details.
// Micro-illustrations as simple geometric coins/jars.

const V4_CREAM = '#F5EFE4';
const V4_PAPER = '#FBF7EE';
const V4_INK = '#1B1A17';
const V4_DIM = '#6E6A60';
const V4_LINE = '#E4DDCD';
const V4_TOMATO = '#D9543B';
const V4_OLIVE = '#7A8B3F';
const V4_NAVY = '#2A3D5C';
const V4_BUTTER = '#F0C868';

const v4serif = { fontFamily: "'Fraunces', serif" };
const v4sans = { fontFamily: "'DM Sans', sans-serif" };
const v4mono = { fontFamily: "'IBM Plex Mono', monospace", fontVariantNumeric: 'tabular-nums' };

// Tiny SVG illustrations
const Coin = ({ size = 22, fill = V4_BUTTER }) => (
  <svg width={size} height={size} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill={fill} stroke={V4_INK} strokeWidth="1.5"/><circle cx="12" cy="12" r="6" fill="none" stroke={V4_INK} strokeWidth="1"/><text x="12" y="15" textAnchor="middle" fontSize="7" fontWeight="700" fill={V4_INK} fontFamily="Fraunces">€</text></svg>
);
const Jar = ({ fill = 0.7 }) => (
  <svg width="44" height="56" viewBox="0 0 44 56"><rect x="6" y="14" width="32" height="38" rx="4" fill={V4_PAPER} stroke={V4_INK} strokeWidth="1.5"/><rect x="6" y={14 + 38*(1-fill)} width="32" height={38*fill} rx="0" fill={V4_TOMATO} opacity="0.85"/><rect x="6" y="14" width="32" height="38" rx="4" fill="none" stroke={V4_INK} strokeWidth="1.5"/><rect x="10" y="8" width="24" height="8" rx="2" fill={V4_INK}/><line x1="6" y1="22" x2="38" y2="22" stroke={V4_INK} strokeWidth="0.8" opacity="0.3"/></svg>
);

function V4Warm() {
  const months = MOCK.months;
  // Build the smoothed curve
  const W = 1180, H = 240, PAD_L = 60, PAD_R = 60, PAD_T = 30, PAD_B = 50;
  const innerW = W - PAD_L - PAD_R, innerH = H - PAD_T - PAD_B;
  const pots = months.map(m => MOCK.monthData[m.key].pot);
  const maxPot = Math.max(...pots) * 1.15;
  const xs = months.map((_, i) => PAD_L + (i / (months.length - 1)) * innerW);
  const ys = pots.map(p => PAD_T + innerH - (p / maxPot) * innerH);
  const linePath = xs.map((x, i) => `${i ? 'L' : 'M'}${x},${ys[i]}`).join(' ');
  const areaPath = `${linePath} L${xs[xs.length-1]},${PAD_T+innerH} L${xs[0]},${PAD_T+innerH} Z`;

  return (
    <div style={{ height: '100%', background: V4_CREAM, color: V4_INK, ...v4sans, padding: 32, overflow: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ ...v4mono, fontSize: 11, letterSpacing: '0.18em', color: V4_DIM, textTransform: 'uppercase' }}>Monday, 11 May 2026 · 20 days until next paycheck</div>
          <h1 style={{ ...v4serif, fontSize: 42, fontWeight: 500, margin: '6px 0 0', letterSpacing: '-0.02em' }}>Good morning, <em style={{ color: V4_TOMATO }}>Alex</em>.</h1>
          <div style={{ ...v4serif, fontSize: 22, fontStyle: 'italic', color: V4_DIM, marginTop: 2 }}>You're on track — and there's a little story to tell.</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button style={{ ...v4sans, padding: '10px 16px', borderRadius: 999, border: '1.5px solid '+V4_INK, background: 'transparent', color: V4_INK, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Plan an expense</button>
          <button style={{ ...v4sans, padding: '10px 18px', borderRadius: 999, border: '1.5px solid '+V4_INK, background: V4_INK, color: V4_CREAM, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>+ Quick log</button>
        </div>
      </div>

      {/* Hero card */}
      <div style={{ background: V4_PAPER, border: '1.5px solid '+V4_INK, borderRadius: 24, padding: 28, marginBottom: 20, position: 'relative' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr', gap: 32, alignItems: 'start' }}>
          <div>
            <div style={{ ...v4sans, fontSize: 12, fontWeight: 600, color: V4_DIM, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Free to spend in May</div>
            <div style={{ ...v4serif, fontSize: 96, fontWeight: 500, lineHeight: 1, letterSpacing: '-0.04em', marginTop: 8 }}>€685</div>
            <div style={{ ...v4serif, fontSize: 17, fontStyle: 'italic', color: V4_DIM, marginTop: 6 }}>after €350 set aside, €127 already spent</div>
            <div style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 999, background: V4_OLIVE + '22', color: V4_OLIVE, fontSize: 12, fontWeight: 600 }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: V4_OLIVE }}></span>
              On pace — comfortably ahead of your spending norm
            </div>
          </div>
          <div style={{ borderLeft: '1px solid '+V4_LINE, paddingLeft: 28 }}>
            <div style={{ ...v4sans, fontSize: 12, fontWeight: 600, color: V4_DIM, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Still to lock in</div>
            <div style={{ ...v4serif, fontSize: 56, fontWeight: 500, lineHeight: 1, marginTop: 8, color: V4_TOMATO }}>€170</div>
            <div style={{ ...v4serif, fontSize: 15, fontStyle: 'italic', color: V4_DIM, marginTop: 6 }}>to fully cover this month's set-aside of €520</div>
            <button style={{ ...v4sans, marginTop: 14, padding: '10px 16px', borderRadius: 999, border: 'none', background: V4_TOMATO, color: V4_CREAM, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Lock in €170 →</button>
          </div>
          <div style={{ borderLeft: '1px solid '+V4_LINE, paddingLeft: 28 }}>
            <div style={{ ...v4sans, fontSize: 12, fontWeight: 600, color: V4_DIM, textTransform: 'uppercase', letterSpacing: '0.1em' }}>The pot</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 8 }}>
              <Jar fill={0.62} />
              <div>
                <div style={{ ...v4serif, fontSize: 40, fontWeight: 500, lineHeight: 1 }}>€1,240</div>
                <div style={{ ...v4serif, fontSize: 14, fontStyle: 'italic', color: V4_DIM, marginTop: 4 }}>holding next 4 plans</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4, marginTop: 14 }}>
              {[Coin, Coin, Coin, Coin].map((C, i) => <C key={i} fill={i < 3 ? V4_BUTTER : V4_LINE} />)}
            </div>
          </div>
        </div>
      </div>

      {/* Hero cashflow chart */}
      <div style={{ background: V4_PAPER, border: '1.5px solid '+V4_INK, borderRadius: 24, padding: '24px 8px 8px 8px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '0 24px 16px' }}>
          <div>
            <div style={{ ...v4serif, fontSize: 22, fontWeight: 500, fontStyle: 'italic' }}>Your money, smoothed across the months</div>
            <div style={{ ...v4sans, fontSize: 13, color: V4_DIM, marginTop: 2 }}>The pot fills up, then deflates as planned expenses come due. Hover any month to see the breakdown.</div>
          </div>
          <div style={{ display: 'flex', gap: 14, ...v4mono, fontSize: 11, color: V4_DIM, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 16, height: 2, background: V4_TOMATO }}></span> Pot</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 16, height: 2, background: V4_NAVY }}></span> Free budget</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, background: V4_BUTTER, border: '1px solid '+V4_INK }}></span> Planned exp.</span>
          </div>
        </div>
        <svg width={W} height={H} style={{ display: 'block' }}>
          {/* gridlines */}
          {[0, 0.25, 0.5, 0.75, 1].map(t => (
            <line key={t} x1={PAD_L} x2={W-PAD_R} y1={PAD_T + innerH * t} y2={PAD_T + innerH * t} stroke={V4_LINE} strokeWidth="1" strokeDasharray={t === 1 ? '0' : '2 4'} />
          ))}
          <path d={areaPath} fill={V4_TOMATO} fillOpacity="0.12" />
          <path d={linePath} fill="none" stroke={V4_TOMATO} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          {/* Planned expense markers */}
          {MOCK.planned.map(p => {
            const i = months.findIndex(m => m.key === p.month);
            if (i < 0) return null;
            return (
              <g key={p.id}>
                <line x1={xs[i]} x2={xs[i]} y1={ys[i]} y2={PAD_T+innerH} stroke={V4_INK} strokeWidth="0.6" strokeDasharray="2 3"/>
                <rect x={xs[i]-7} y={ys[i]-7} width="14" height="14" fill={V4_BUTTER} stroke={V4_INK} strokeWidth="1.5"/>
                <text x={xs[i]} y={ys[i]-14} textAnchor="middle" style={v4mono} fontSize="9" fill={V4_INK}>−€{p.amount}</text>
              </g>
            );
          })}
          {/* Current month marker */}
          {(() => { const i = months.findIndex(m => m.state === 'current'); return (
            <g>
              <line x1={xs[i]} x2={xs[i]} y1={PAD_T} y2={PAD_T+innerH} stroke={V4_INK} strokeWidth="1"/>
              <circle cx={xs[i]} cy={ys[i]} r="6" fill={V4_CREAM} stroke={V4_INK} strokeWidth="2"/>
              <text x={xs[i]+10} y={ys[i]-8} style={v4serif} fontSize="13" fontStyle="italic" fill={V4_INK}>You are here</text>
            </g>
          ); })()}
          {/* X axis labels */}
          {months.map((m, i) => (
            <text key={m.key} x={xs[i]} y={H-20} textAnchor="middle" style={v4mono} fontSize="11" fill={m.state === 'current' ? V4_INK : V4_DIM} fontWeight={m.state === 'current' ? 600 : 400}>
              {m.label}
            </text>
          ))}
          {/* Y axis labels */}
          {[0, 0.5, 1].map(t => (
            <text key={t} x={PAD_L - 8} y={PAD_T + innerH * (1-t) + 4} textAnchor="end" style={v4mono} fontSize="10" fill={V4_DIM}>
              €{Math.round(maxPot * t)}
            </text>
          ))}
        </svg>
      </div>

      {/* Bottom row: future plans + this month */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 20 }}>
        <div style={{ background: V4_PAPER, border: '1.5px solid '+V4_INK, borderRadius: 24, padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18 }}>
            <div style={{ ...v4serif, fontSize: 22, fontWeight: 500, fontStyle: 'italic' }}>What's coming up</div>
            <button style={{ ...v4sans, fontSize: 12, color: V4_DIM, border: 'none', background: 'none', cursor: 'pointer' }}>+ add plan</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {MOCK.planned.map(p => {
              const pct = Math.round((p.current/p.target)*100);
              const m = months.find(x => x.key === p.month);
              return (
                <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '52px 1fr auto', gap: 16, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid '+V4_LINE }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ ...v4mono, fontSize: 9, color: V4_DIM, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{m.label}</div>
                    <div style={{ ...v4serif, fontSize: 26, fontWeight: 500, lineHeight: 1 }}>{p.month.slice(-2)}</div>
                  </div>
                  <div>
                    <div style={{ ...v4sans, fontSize: 15, fontWeight: 600 }}>{p.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      <div style={{ flex: 1, height: 6, background: V4_LINE, borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ width: pct+'%', height: '100%', background: pct >= 65 ? V4_OLIVE : pct >= 30 ? V4_BUTTER : V4_TOMATO }}></div>
                      </div>
                      <span style={{ ...v4mono, fontSize: 11, color: V4_DIM }}>€{p.current}/€{p.target}</span>
                    </div>
                  </div>
                  <div style={{ ...v4serif, fontSize: 22, fontWeight: 500 }}>€{p.amount}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ background: V4_INK, color: V4_CREAM, borderRadius: 24, padding: 24, position: 'relative', overflow: 'hidden' }}>
          <div style={{ ...v4sans, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.6 }}>Spent in May so far</div>
          <div style={{ ...v4serif, fontSize: 54, fontWeight: 500, lineHeight: 1, marginTop: 6 }}>€127</div>
          <div style={{ ...v4serif, fontSize: 15, fontStyle: 'italic', opacity: 0.7, marginTop: 4 }}>about 18% of your free budget</div>
          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {MOCK.spentThisMonth.map(s => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(245,239,228,0.15)' }}>
                <span style={{ ...v4sans, fontSize: 13 }}>{s.name}</span>
                <span style={{ ...v4mono, fontSize: 13 }}>−€{s.amount}</span>
              </div>
            ))}
          </div>
          <div style={{ position: 'absolute', right: -20, bottom: -20, opacity: 0.08 }}>
            <Coin size={140} fill={V4_BUTTER} />
          </div>
        </div>
      </div>
    </div>
  );
}

window.V4Warm = V4Warm;
