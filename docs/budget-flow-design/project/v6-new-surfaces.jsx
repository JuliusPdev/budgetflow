/* global React, MOCK, V6 */
// V6 new surfaces — lock-state comparison, mid-month funding modal (×2),
// CSV import wizard (4 key steps). All in the V6 visual language.

const { T: vT, fSans: vS, fMono: vM, fmt: vFmt, fmtNs: vFmtNs } = window.V6;

// ─────────────────────────────────────────────────────────────
// 1) LOCK STATES — three side-by-side current-month cards
//    Empty · Planned · Confirmed
// ─────────────────────────────────────────────────────────────

function LockStatesShowcase() {
  return (
    <div style={{ height: '100%', background: vT.bg, padding: 32, ...vS, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div style={{ ...vS, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: vT.ink }}>Lock-in states — Planned vs Confirmed</div>
          <div style={{ ...vS, fontSize: 12, color: vT.dim, marginTop: 2 }}>
            <strong>Planned</strong>: user clicked "Lock in" in-app · <strong>Confirmed</strong>: verified by CSV import.
            Same data shape, different evidence — visually distinct but quiet.
          </div>
        </div>
        <div style={{ ...vM, fontSize: 10, color: vT.subdim, letterSpacing: '0.12em', textTransform: 'uppercase' }}>3 states · 1 component</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
        <LockStateCard state="empty"/>
        <LockStateCard state="planned"/>
        <LockStateCard state="confirmed"/>
      </div>

      {/* Anatomy strip */}
      <div style={{ marginTop: 24, padding: 18, background: vT.surface, border: '1px solid '+vT.line, borderRadius: 14 }}>
        <div style={{ ...vM, fontSize: 10, color: vT.dim, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600, marginBottom: 12 }}>Anatomy of the difference</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, ...vS, fontSize: 12, color: vT.ink, lineHeight: 1.55 }}>
          <div>
            <div style={{ ...vM, fontSize: 10, color: vT.subdim, marginBottom: 6, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Empty</div>
            <div>Set-aside row is muted; the &quot;Lock in&quot; CTA is the loudest thing on the card. No badge.</div>
          </div>
          <div>
            <div style={{ ...vM, fontSize: 10, color: vT.amberInk, marginBottom: 6, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Planned</div>
            <div>Amount in amber. Chip reads <em>(planned)</em> with a dotted underline. The CTA shifts to &quot;Mark confirmed&quot; or sits silent — user already made the call.</div>
          </div>
          <div>
            <div style={{ ...vM, fontSize: 10, color: vT.greenInk, marginBottom: 6, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Confirmed</div>
            <div>Amount in green. Chip with <strong>✓</strong> and a solid background. CTA replaced by a small &quot;Verified from CSV · 8 May&quot; line.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LockStateCard({ state }) {
  // shared content
  const target = 520;
  const locked = state === 'empty' ? 0 : 350;
  const pct = Math.round(locked / target * 100);

  const tone = state === 'confirmed' ? vT.green : state === 'planned' ? vT.amber : vT.dim;
  const toneSoft = state === 'confirmed' ? vT.greenSoft : state === 'planned' ? vT.amberSoft : vT.lineSoft;
  const toneInk = state === 'confirmed' ? vT.greenInk : state === 'planned' ? vT.amberInk : vT.dim;

  return (
    <div style={{ background: vT.surface, border: '1px solid '+vT.line, borderRadius: 16, padding: 20, position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ ...vM, fontSize: 10, color: vT.dim, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600, whiteSpace: 'nowrap' }}>May · Set-aside</div>
        {state === 'empty' && (
          <span style={{ ...vM, fontSize: 9, color: vT.subdim, letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap', flexShrink: 0 }}>UNLOCKED</span>
        )}
        {state === 'planned' && (
          <span style={{ ...vM, fontSize: 10, fontWeight: 600, color: vT.amberInk, padding: '3px 8px', background: vT.amberSoft, borderRadius: 4, letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: '1px dashed '+vT.amber, whiteSpace: 'nowrap', flexShrink: 0 }}>
            planned
          </span>
        )}
        {state === 'confirmed' && (
          <span style={{ ...vM, fontSize: 10, fontWeight: 700, color: vT.surface, padding: '3px 8px', background: vT.green, borderRadius: 4, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', flexShrink: 0 }}>
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M1.5 4.5l2 2 4-4" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
            confirmed
          </span>
        )}
      </div>

      {/* big number — use a baseline-aligned row with explicit line-heights so the denominator can't crash into the description below */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 12, whiteSpace: 'nowrap' }}>
        <span style={{ ...vS, fontSize: 48, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1,
                       color: state === 'empty' ? vT.subdim : (state === 'confirmed' ? vT.greenInk : vT.ink) }}>
          €{locked}
        </span>
        <span style={{ ...vM, fontSize: 15, color: vT.dim, lineHeight: 1, fontWeight: 500 }}>/ {target}</span>
      </div>
      <div style={{ ...vS, fontSize: 12, color: vT.dim, marginTop: 10, lineHeight: 1.4 }}>
        {state === 'empty'     && 'Nothing transferred yet this month.'}
        {state === 'planned'   && 'You said you transferred €350. Engine treats this as the locked reality.'}
        {state === 'confirmed' && '€350 found in May CSV. Bank statement matches the app.'}
      </div>

      {/* progress */}
      <div style={{ marginTop: 14, height: 8, borderRadius: 999, background: vT.lineSoft, overflow: 'hidden', display: 'flex',
        border: state === 'confirmed' ? '1px solid '+vT.green : 'none', boxSizing: 'border-box' }}>
        <div style={{ width: pct + '%', background: tone, position: 'relative',
          backgroundImage: state === 'planned' ? `repeating-linear-gradient(45deg, ${vT.amber} 0 4px, ${vT.amberInk}33 4px 8px)` : undefined,
        }}/>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', ...vM, fontSize: 9, color: vT.subdim, marginTop: 6, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        <span style={{ whiteSpace: 'nowrap' }}>€{locked} of €{target}</span>
        <span style={{ whiteSpace: 'nowrap' }}>€{target - locked} remaining</span>
      </div>

      {/* footer line */}
      <div style={{ marginTop: 16, borderTop: '1px solid '+vT.lineSoft, paddingTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        {state === 'empty' && (
          <>
            <span style={{ ...vS, fontSize: 12, color: vT.dim, lineHeight: 1.3 }}>Recommended<br/>€520 to fully cover</span>
            <button style={{ ...vS, padding: '8px 14px', borderRadius: 999, border: 'none', background: vT.peri, color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
              Lock €520
            </button>
          </>
        )}
        {state === 'planned' && (
          <>
            <span style={{ ...vS, fontSize: 12, color: vT.dim, whiteSpace: 'nowrap' }}>Import CSV to confirm</span>
            <button style={{ ...vS, padding: '8px 14px', borderRadius: 999, border: '1px solid '+vT.line, background: vT.surface, color: vT.ink, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
              Edit €350
            </button>
          </>
        )}
        {state === 'confirmed' && (
          <span style={{ ...vS, fontSize: 12, color: vT.greenInk, display: 'inline-flex', alignItems: 'center', gap: 6, lineHeight: 1.3 }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}><path d="M2 6.5l2.5 2.5L10 3" stroke={vT.green} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span>Verified from CSV<br/>imported 8 May 2026</span>
          </span>
        )}
      </div>
    </div>
  );
}

window.LockStatesShowcase = LockStatesShowcase;

// ─────────────────────────────────────────────────────────────
// 2) MID-MONTH MODAL — variations A and B
//    Triggered: planned expense added after current month already has a lock-in.
// ─────────────────────────────────────────────────────────────

const MODAL_CTX = {
  expense:        { name: 'Trip to Lisbon', amount: 900, month: 'Aug 2026', monthsAway: 3 },
  currentLocked:  350,
  currentTarget:  520,
  // option 1: include this month
  opt1Additional: 225,    // additional set-aside this month
  opt1Rate:       225,    // €/month for remaining months
  opt1Months:     3,
  // option 2: start from next month
  opt2Rate:       300,
  opt2Months:     3,
};

function MidMonthModalA() {
  const m = MODAL_CTX;
  const [choice, setChoice] = React.useState(null);
  return (
    <div style={{ height: '100%', background: 'rgba(20,18,28,0.45)', padding: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', ...vS }}>
      <div style={{ width: 540, background: vT.surface, borderRadius: 20, padding: 28, boxShadow: '0 30px 80px rgba(20,18,28,0.4), 0 0 0 1px rgba(255,255,255,0.04)' }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ ...vM, fontSize: 10, color: vT.peri, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700 }}>Mid-month decision</span>
          <button style={{ width: 28, height: 28, borderRadius: 999, border: 'none', background: vT.bg, color: vT.dim, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ ...vS, fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', marginTop: 8, color: vT.ink, lineHeight: 1.25 }}>
          How do you want to fund <span style={{ color: vT.peri }}>{m.expense.name}</span>?
        </div>
        <div style={{ ...vS, fontSize: 13, color: vT.dim, marginTop: 6 }}>
          You already locked <strong style={{ color: vT.ink }}>€{m.currentLocked}</strong> this month. This expense needs
          <strong style={{ color: vT.ink }}> €{m.expense.amount}</strong> by {m.expense.month}.
        </div>

        {/* options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20 }}>
          {/* Option 1 */}
          <button onClick={() => setChoice('1')} style={{
            ...vS, textAlign: 'left', padding: 18, border: '1.5px solid '+(choice==='1' ? vT.peri : vT.line),
            background: choice==='1' ? vT.periTint : vT.surface, borderRadius: 14, cursor: 'pointer',
            display: 'grid', gridTemplateColumns: '20px 1fr auto', gap: 14, alignItems: 'flex-start',
            transition: 'all .15s',
          }}>
            <div style={{ width: 18, height: 18, borderRadius: 999, border: '2px solid '+(choice==='1' ? vT.peri : vT.line), background: vT.surface, marginTop: 2, position: 'relative' }}>
              {choice==='1' && <div style={{ position: 'absolute', inset: 3, borderRadius: 999, background: vT.peri }}/>}
            </div>
            <div>
              <div style={{ ...vS, fontSize: 15, fontWeight: 700, color: vT.ink, letterSpacing: '-0.01em' }}>Include this month</div>
              <div style={{ ...vS, fontSize: 12, color: vT.dim, marginTop: 3 }}>
                Set aside an additional <strong style={{ color: vT.amber }}>€{m.opt1Additional}</strong> in May, then
                <strong style={{ color: vT.ink }}> €{m.opt1Rate}/month</strong> for {m.opt1Months} months.
              </div>
              <div style={{ ...vM, fontSize: 10, color: vT.subdim, marginTop: 8, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                MAY +€{m.opt1Additional} · JUN €{m.opt1Rate} · JUL €{m.opt1Rate} · AUG €{m.opt1Rate}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ ...vM, fontSize: 10, color: vT.dim, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Free budget this mo.</div>
              <div style={{ ...vS, fontSize: 18, fontWeight: 700, color: vT.amber, marginTop: 2 }}>−€225</div>
              <div style={{ ...vM, fontSize: 10, color: vT.subdim }}>→ €460</div>
            </div>
          </button>

          {/* Option 2 */}
          <button onClick={() => setChoice('2')} style={{
            ...vS, textAlign: 'left', padding: 18, border: '1.5px solid '+(choice==='2' ? vT.peri : vT.line),
            background: choice==='2' ? vT.periTint : vT.surface, borderRadius: 14, cursor: 'pointer',
            display: 'grid', gridTemplateColumns: '20px 1fr auto', gap: 14, alignItems: 'flex-start',
          }}>
            <div style={{ width: 18, height: 18, borderRadius: 999, border: '2px solid '+(choice==='2' ? vT.peri : vT.line), background: vT.surface, marginTop: 2, position: 'relative' }}>
              {choice==='2' && <div style={{ position: 'absolute', inset: 3, borderRadius: 999, background: vT.peri }}/>}
            </div>
            <div>
              <div style={{ ...vS, fontSize: 15, fontWeight: 700, color: vT.ink, letterSpacing: '-0.01em' }}>Start from next month</div>
              <div style={{ ...vS, fontSize: 12, color: vT.dim, marginTop: 3 }}>
                <strong style={{ color: vT.ink }}>€{m.opt2Rate}/month</strong> for {m.opt2Months} months starting June.
                Nothing additional this month.
              </div>
              <div style={{ ...vM, fontSize: 10, color: vT.subdim, marginTop: 8, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                MAY unchanged · JUN €{m.opt2Rate} · JUL €{m.opt2Rate} · AUG €{m.opt2Rate}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ ...vM, fontSize: 10, color: vT.dim, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Free budget this mo.</div>
              <div style={{ ...vS, fontSize: 18, fontWeight: 700, color: vT.green, marginTop: 2 }}>±€0</div>
              <div style={{ ...vM, fontSize: 10, color: vT.subdim }}>→ €685</div>
            </div>
          </button>
        </div>

        {/* footer */}
        <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <button style={{ ...vS, padding: '10px 16px', borderRadius: 999, border: 'none', background: 'transparent', color: vT.dim, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            Cancel
          </button>
          <button disabled={!choice} style={{ ...vS, padding: '10px 22px', borderRadius: 999, border: 'none',
            background: choice ? vT.ink : vT.lineSoft, color: choice ? vT.surface : vT.subdim,
            fontSize: 13, fontWeight: 700, cursor: choice ? 'pointer' : 'not-allowed' }}>
            {choice === '1' ? 'Confirm — include this month' : choice === '2' ? 'Confirm — start in June' : 'Choose an option'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Variation B: side-by-side with mini pot sparkline showing the diff.
function MidMonthModalB() {
  const m = MODAL_CTX;
  return (
    <div style={{ height: '100%', background: 'rgba(20,18,28,0.45)', padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', ...vS }}>
      <div style={{ width: 920, background: vT.surface, borderRadius: 20, boxShadow: '0 30px 80px rgba(20,18,28,0.4)', overflow: 'hidden' }}>
        {/* header */}
        <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid '+vT.line }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ ...vM, fontSize: 10, color: vT.peri, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, whiteSpace: 'nowrap' }}>Mid-month decision</span>
            <button style={{ width: 28, height: 28, borderRadius: 999, border: 'none', background: vT.bg, color: vT.dim, cursor: 'pointer', fontSize: 16 }}>×</button>
          </div>
          <div style={{ ...vS, fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', marginTop: 6, color: vT.ink, lineHeight: 1.25 }}>
            How do you want to fund <span style={{ color: vT.peri }}>{m.expense.name}</span>?
          </div>
          <div style={{ ...vS, fontSize: 13, color: vT.dim, marginTop: 4 }}>
            May already has <strong style={{ color: vT.ink }}>€{m.currentLocked}</strong> locked. {m.expense.name} needs <strong style={{ color: vT.ink }}>€{m.expense.amount}</strong> by {m.expense.month}.
          </div>
        </div>

        {/* options side by side */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr' }}>
          <ModalBOption side="left" tone="amber" title="Include this month"
            sub={`Add €${m.opt1Additional} to May, then €${m.opt1Rate}/mo`}
            highlight={`€${m.opt1Additional}`} highlightLabel="+ this month"
            stats={[
              { k: 'May free budget',     v: '€460',     d: '−€225' },
              { k: 'New monthly rate',    v: `€${m.opt1Rate}`, d: 'Jun – Aug' },
              { k: 'Total over 4 months', v: '€900',     d: '' },
            ]}
            sparkline={[0.92, 0.55, 0.65, 0.7, 0.05]}/>
          <div style={{ width: 1, background: vT.line }}/>
          <ModalBOption side="right" tone="green" title="Start from next month"
            sub={`€${m.opt2Rate}/mo from June. May stays as is.`}
            highlight="±€0" highlightLabel="this month"
            stats={[
              { k: 'May free budget',     v: '€685', d: 'unchanged' },
              { k: 'New monthly rate',    v: `€${m.opt2Rate}`, d: 'Jun – Aug' },
              { k: 'Total over 3 months', v: '€900', d: '' },
            ]}
            sparkline={[0.92, 0.92, 0.6, 0.7, 0.05]}
            warn="3-month window — Jun & Jul rate runs tight."/>
        </div>

        {/* footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid '+vT.line, background: vT.surface2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ ...vM, fontSize: 10, color: vT.dim, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
            <span style={{ padding: '1px 5px', border: '1px solid '+vT.line, borderRadius: 3, background: vT.surface, color: vT.ink }}>1</span> or <span style={{ padding: '1px 5px', border: '1px solid '+vT.line, borderRadius: 3, background: vT.surface, color: vT.ink }}>2</span> · <span style={{ padding: '1px 5px', border: '1px solid '+vT.line, borderRadius: 3, background: vT.surface, color: vT.ink }}>Esc</span> to cancel
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button style={{ ...vS, padding: '10px 14px', borderRadius: 999, border: '1px solid '+vT.line, background: vT.surface, color: vT.ink, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>Start in June</button>
            <button style={{ ...vS, padding: '10px 16px', borderRadius: 999, border: 'none', background: vT.peri, color: vT.surface, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Include this month</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModalBOption({ tone, title, sub, highlight, highlightLabel, stats, sparkline, warn }) {
  const toneColor = tone === 'amber' ? vT.amber : vT.green;
  // sparkline as smoothed path
  const W = 360, H = 80, P = 8;
  const pts = sparkline.map((v, i) => [P + (i / (sparkline.length-1)) * (W - 2*P), P + (1 - v) * (H - 2*P)]);
  const path = window.v6SmoothPath(pts);
  const area = `${path} L${pts[pts.length-1][0]},${H-P} L${pts[0][0]},${H-P} Z`;
  return (
    <div style={{ padding: '20px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <div style={{ ...vS, fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', color: vT.ink, whiteSpace: 'nowrap' }}>{title}</div>
        <span style={{ ...vM, fontSize: 10, fontWeight: 700, color: toneColor, padding: '3px 8px', background: tone==='amber'?vT.amberSoft:vT.greenSoft, borderRadius: 4, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {highlightLabel}
        </span>
      </div>
      <div style={{ ...vS, fontSize: 12, color: vT.dim, marginBottom: 14 }}>{sub}</div>

      <div style={{ background: vT.bg, borderRadius: 10, padding: '8px 6px', position: 'relative' }}>
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id={`mg-${tone}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={toneColor} stopOpacity="0.3"/>
              <stop offset="100%" stopColor={toneColor} stopOpacity="0"/>
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#mg-${tone})`}/>
          <path d={path} fill="none" stroke={toneColor} strokeWidth="2"/>
          {pts.map((p, i) => (
            <circle key={i} cx={p[0]} cy={p[1]} r="3" fill={vT.surface} stroke={toneColor} strokeWidth="1.5"/>
          ))}
          {['May','Jun','Jul','Aug','—'].map((lbl, i) => (
            <text key={i} x={pts[i][0]} y={H-2} textAnchor="middle" style={vM} fontSize="9" fill={vT.subdim}>{lbl}</text>
          ))}
        </svg>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 14 }}>
        {stats.map((s,i) => (
          <div key={i}>
            <div style={{ ...vM, fontSize: 9, color: vT.subdim, letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.k}</div>
            <div style={{ ...vS, fontSize: 16, fontWeight: 700, color: vT.ink, marginTop: 2, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>{s.v}</div>
            {s.d && <div style={{ ...vM, fontSize: 9, color: vT.dim, whiteSpace: 'nowrap' }}>{s.d}</div>}
          </div>
        ))}
      </div>

      {warn && (
        <div style={{ marginTop: 14, padding: '8px 12px', background: vT.amberSoft, borderRadius: 8, ...vS, fontSize: 11, color: vT.amberInk, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ marginTop: 1, flexShrink: 0 }}>
            <path d="M7 1L13 12H1z" stroke={vT.amber} strokeWidth="1.4" strokeLinejoin="round"/>
            <path d="M7 5v4M7 10.5v.4" stroke={vT.amber} strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          {warn}
        </div>
      )}
    </div>
  );
}

window.MidMonthModalA = MidMonthModalA;
window.MidMonthModalB = MidMonthModalB;

// ─────────────────────────────────────────────────────────────
// 3) CSV IMPORT WIZARD — 4 key steps as separate artboards.
// Steps: Upload → Review → Reconcile summary → Allocate leftover
// ─────────────────────────────────────────────────────────────

function WizardShell({ step, total, title, subtitle, children, footer }) {
  return (
    <div style={{ height: '100%', background: 'rgba(20,18,28,0.45)', padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', ...vS }}>
      <div style={{ width: 920, height: 640, background: vT.surface, borderRadius: 18, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 30px 80px rgba(20,18,28,0.4)' }}>
        {/* header */}
        <div style={{ padding: '18px 26px 14px', borderBottom: '1px solid '+vT.line }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <span style={{ ...vM, fontSize: 10, color: vT.peri, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                Month-end reconciliation · April 2026
              </span>
            </div>
            <button style={{ width: 28, height: 28, borderRadius: 999, border: 'none', background: vT.bg, color: vT.dim, cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>×</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 6, gap: 16 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ ...vS, fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', color: vT.ink, lineHeight: 1.2 }}>{title}</div>
              <div style={{ ...vS, fontSize: 13, color: vT.dim, marginTop: 3 }}>{subtitle}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {Array.from({ length: total }).map((_, i) => (
                <div key={i} style={{
                  height: 4, width: i === step ? 36 : 18, borderRadius: 999,
                  background: i < step ? vT.peri : i === step ? vT.peri : vT.line,
                  opacity: i < step ? 0.5 : 1,
                  transition: 'all .2s',
                }}/>
              ))}
              <span style={{ ...vM, fontSize: 10, color: vT.dim, marginLeft: 8, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                STEP {step + 1} / {total}
              </span>
            </div>
          </div>
        </div>

        {/* body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '22px 26px' }}>
          {children}
        </div>

        {/* footer */}
        <div style={{ padding: '14px 26px', borderTop: '1px solid '+vT.line, background: vT.surface2 }}>
          {footer}
        </div>
      </div>
    </div>
  );
}

// Step 1: Upload
function CsvWizardStep1() {
  return (
    <WizardShell step={0} total={4} title="Upload your bank statement"
      subtitle="Drop a CSV from C24 or any common bank. We'll match transactions against what you locked in for April."
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ ...vM, fontSize: 11, color: vT.dim, whiteSpace: 'nowrap' }}>We never upload your data — parsing happens on-device.</span>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button style={{ ...vS, padding: '9px 16px', borderRadius: 999, border: '1px solid '+vT.line, background: vT.surface, fontSize: 13, fontWeight: 600, color: vT.ink, cursor: 'pointer', whiteSpace: 'nowrap' }}>Reconcile manually</button>
            <button disabled style={{ ...vS, padding: '9px 18px', borderRadius: 999, border: 'none', background: vT.lineSoft, color: vT.subdim, fontSize: 13, fontWeight: 700, cursor: 'not-allowed', whiteSpace: 'nowrap' }}>Continue →</button>
          </div>
        </div>
      }>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, height: '100%' }}>
        {/* Dropzone */}
        <div style={{
          border: '2px dashed '+vT.peri, borderRadius: 14, background: vT.periTint,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
          padding: 32, position: 'relative',
        }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: vT.peri, color: 'white', display: 'grid', placeItems: 'center' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 16V4M5 11l7-7 7 7M4 20h16"/>
            </svg>
          </div>
          <div style={{ ...vS, fontSize: 16, fontWeight: 700, color: vT.ink }}>Drop a .csv here</div>
          <div style={{ ...vS, fontSize: 12, color: vT.dim, textAlign: 'center', maxWidth: 280, whiteSpace: 'nowrap' }}>
            or <span style={{ color: vT.peri, fontWeight: 600, textDecoration: 'underline' }}>browse files</span> · max 5 MB
          </div>
          <div style={{ position: 'absolute', bottom: 16, ...vM, fontSize: 10, color: vT.subdim, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
            Tested: C24 · Sparkasse · N26 · DKB
          </div>
        </div>

        {/* What we'll do */}
        <div>
          <div style={{ ...vM, fontSize: 10, color: vT.dim, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600, marginBottom: 12 }}>What happens after upload</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { n: '1', t: 'Detect sub-accounts',   d: 'Match each Kontoname to a fixed-expense category. We remember mappings.' },
              { n: '2', t: 'Pre-categorize',        d: 'Apply known categories to transactions. Anything new is flagged for review.' },
              { n: '3', t: 'Reconcile vs locked',   d: 'Compare bank reality to what you said you set aside. Confirm or correct.' },
              { n: '4', t: 'Distribute leftover',   d: 'Surplus flows into envelopes, planned goals, or rolls into free budget.' },
            ].map(s => (
              <div key={s.n} style={{ display: 'grid', gridTemplateColumns: '24px 1fr', gap: 12, padding: '10px 0', borderBottom: '1px solid '+vT.lineSoft }}>
                <div style={{ ...vM, fontSize: 10, fontWeight: 700, color: vT.peri, padding: '3px 6px', background: vT.periSoft, borderRadius: 4, textAlign: 'center', height: 'fit-content' }}>{s.n}</div>
                <div>
                  <div style={{ ...vS, fontSize: 13, fontWeight: 600, color: vT.ink }}>{s.t}</div>
                  <div style={{ ...vS, fontSize: 12, color: vT.dim, marginTop: 2 }}>{s.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </WizardShell>
  );
}

// Step 2: Review transactions (categorize)
function CsvWizardStep2() {
  const txs = [
    { d: '02 Apr', m: 'Aldi Süd Berlin',         a: -42.18, cat: 'Groceries',        c: 'green', new: false },
    { d: '03 Apr', m: 'Stadtwerke München',      a: -94.50, cat: 'Utilities · Gas',   c: 'green', new: false },
    { d: '05 Apr', m: 'DB Vertrieb',             a: -67.00, cat: 'Transport',        c: 'amber', new: true },
    { d: '07 Apr', m: 'Edeka Niemerszein',       a: -38.42, cat: 'Groceries',        c: 'green', new: false },
    { d: '09 Apr', m: 'TLG Immobilien',          a: -1100.00, cat: 'Rent',           c: 'green', new: false },
    { d: '11 Apr', m: 'Salary · Klar Studio',    a:  3200.00, cat: 'Income',         c: 'peri',  new: false },
    { d: '12 Apr', m: 'Sparda Bank → Pot',       a: -540.00, cat: 'Set-aside transfer', c: 'peri', new: false },
    { d: '14 Apr', m: 'Patreon · 23',            a: -8.50, cat: '? — uncategorized', c: 'red',   new: true },
    { d: '18 Apr', m: 'Rossmann',                a: -22.10, cat: 'Personal care',    c: 'amber', new: true },
    { d: '21 Apr', m: 'Coffee · Bonanza',        a: -4.20, cat: 'Free spend',        c: 'green', new: false },
  ];

  return (
    <WizardShell step={1} total={4} title="Review 47 transactions"
      subtitle="We've pre-categorized what we recognize. 3 new merchants need a category before we can reconcile."
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ ...vM, fontSize: 11, color: vT.amber, fontWeight: 600, whiteSpace: 'nowrap' }}>● 3 of 47 still need a category</span>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button style={{ ...vS, padding: '9px 16px', borderRadius: 999, border: '1px solid '+vT.line, background: vT.surface, fontSize: 13, fontWeight: 600, color: vT.ink, cursor: 'pointer', whiteSpace: 'nowrap' }}>← Back</button>
            <button style={{ ...vS, padding: '9px 18px', borderRadius: 999, border: 'none', background: vT.peri, color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Continue to reconcile →</button>
          </div>
        </div>
      }>
      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 4, padding: 3, background: vT.bg, borderRadius: 999, border: '1px solid '+vT.line }}>
          {[
            { l: 'All', c: 47, active: true },
            { l: 'Needs review', c: 3 },
            { l: 'Income', c: 1 },
            { l: 'Transfers', c: 2 },
          ].map(t => (
            <button key={t.l} style={{
              ...vS, padding: '5px 12px', borderRadius: 999, border: 'none',
              background: t.active ? vT.ink : 'transparent', color: t.active ? vT.surface : vT.dim,
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              {t.l}
              <span style={{ ...vM, fontSize: 10, opacity: 0.7 }}>{t.c}</span>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input placeholder="Search merchant…" style={{ ...vS, padding: '6px 12px', borderRadius: 999, border: '1px solid '+vT.line, background: vT.surface, fontSize: 12, width: 180, color: vT.ink }}/>
          <button style={{ ...vS, padding: '6px 12px', borderRadius: 999, border: '1px solid '+vT.line, background: vT.surface, fontSize: 12, color: vT.dim, cursor: 'pointer', fontWeight: 600 }}>Mappings ⚙</button>
        </div>
      </div>

      {/* Table */}
      <div style={{ border: '1px solid '+vT.line, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 200px 100px', padding: '8px 14px', background: vT.surface2, ...vM, fontSize: 10, color: vT.dim, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          <div>Date</div><div>Merchant</div><div>Category</div><div style={{ textAlign: 'right' }}>Amount</div>
        </div>
        <div>
          {txs.map((t, i) => {
            const catColor = t.c === 'green' ? vT.green : t.c === 'amber' ? vT.amber : t.c === 'red' ? vT.red : vT.peri;
            const catBg = t.c === 'green' ? vT.greenSoft : t.c === 'amber' ? vT.amberSoft : t.c === 'red' ? vT.redSoft : vT.periSoft;
            return (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 200px 100px', padding: '10px 14px', borderTop: '1px solid '+vT.lineSoft, alignItems: 'center', background: t.new ? vT.amberSoft + '33' : 'transparent' }}>
                <div style={{ ...vM, fontSize: 11, color: vT.dim }}>{t.d}</div>
                <div style={{ ...vS, fontSize: 13, color: vT.ink, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {t.m}
                  {t.new && <span style={{ ...vM, fontSize: 9, color: vT.amberInk, padding: '1px 5px', background: vT.amberSoft, borderRadius: 3, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 700 }}>NEW</span>}
                </div>
                <div>
                  <span style={{ ...vM, fontSize: 11, color: catColor, padding: '3px 8px', background: catBg, borderRadius: 4, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {t.cat}
                    <svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M2 3.5L4.5 6L7 3.5" stroke={catColor} strokeWidth="1.4" strokeLinecap="round"/></svg>
                  </span>
                </div>
                <div style={{ ...vM, fontSize: 13, fontWeight: 600, color: t.a > 0 ? vT.green : vT.ink, textAlign: 'right' }}>
                  {t.a > 0 ? '+' : '−'}€{Math.abs(t.a).toFixed(2)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ ...vS, fontSize: 11, color: vT.subdim, marginTop: 8, textAlign: 'center' }}>
        showing 10 of 47 · scroll for more
      </div>
    </WizardShell>
  );
}

// Step 3: The novel reconciliation summary — diff between locked-in vs CSV reality.
function CsvWizardStep3() {
  return (
    <WizardShell step={2} total={4} title="Reconcile April vs what really happened"
      subtitle="You said you transferred €540 to the pot. The CSV shows €540 — exact match. Here's the rest of the picture."
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ ...vM, fontSize: 11, color: vT.dim, whiteSpace: 'nowrap' }}>One decision pending below.</span>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button style={{ ...vS, padding: '9px 16px', borderRadius: 999, border: '1px solid '+vT.line, background: vT.surface, fontSize: 13, fontWeight: 600, color: vT.ink, cursor: 'pointer', whiteSpace: 'nowrap' }}>← Back</button>
            <button style={{ ...vS, padding: '9px 18px', borderRadius: 999, border: 'none', background: vT.peri, color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Continue →</button>
          </div>
        </div>
      }>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Headline diff */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <ReconcileDiff k="Set-aside transfer" planned="€540" actual="€540" diff="0" ok/>
          <ReconcileDiff k="Groceries envelope"  planned="€450" actual="€398" diff="−€52" surplus/>
          <ReconcileDiff k="Free-budget spend"   planned="—"    actual="€394" diff="of €612 budget" info/>
        </div>

        {/* Per-category breakdown */}
        <div style={{ border: '1px solid '+vT.line, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 130px', padding: '9px 16px', background: vT.surface2, ...vM, fontSize: 10, color: vT.dim, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600 }}>
            <div>Category</div>
            <div style={{ textAlign: 'right' }}>You said</div>
            <div style={{ textAlign: 'right' }}>CSV shows</div>
            <div style={{ textAlign: 'right' }}>Status</div>
          </div>
          {[
            { k: 'Rent',              p: 1100, a: 1100, t: 'match' },
            { k: 'Health insurance',  p: 280,  a: 280,  t: 'match' },
            { k: 'Set-aside → pot',   p: 540,  a: 540,  t: 'confirmed', emp: true },
            { k: 'Groceries (env.)',  p: 450,  a: 398,  t: 'surplus' },
            { k: 'Phone · Gym · Spotify', p: 80, a: 80, t: 'match' },
            { k: 'Unplanned spend',   p: '—',  a: 218,  t: 'unplanned' },
          ].map((r, i) => {
            const tone = r.t === 'match' ? vT.green : r.t === 'confirmed' ? vT.peri : r.t === 'surplus' ? vT.amber : vT.ink;
            const toneSoft = r.t === 'match' ? vT.greenSoft : r.t === 'confirmed' ? vT.periSoft : r.t === 'surplus' ? vT.amberSoft : vT.lineSoft;
            return (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 130px', padding: '10px 16px', borderTop: '1px solid '+vT.lineSoft, alignItems: 'center', background: r.emp ? vT.periTint : 'transparent' }}>
                <div style={{ ...vS, fontSize: 13, fontWeight: r.emp ? 700 : 500, color: vT.ink }}>{r.k}</div>
                <div style={{ ...vM, fontSize: 12, color: vT.dim, textAlign: 'right' }}>{typeof r.p === 'number' ? '€'+r.p : r.p}</div>
                <div style={{ ...vM, fontSize: 13, color: vT.ink, textAlign: 'right', fontWeight: 600 }}>€{r.a}</div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ ...vM, fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, color: tone, background: toneSoft, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    {r.t === 'confirmed' ? '✓ confirmed' : r.t === 'match' ? 'matches' : r.t === 'surplus' ? `+€${r.p - r.a} surplus` : 'logged'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Surplus decision */}
        <div style={{ background: vT.amberSoft, border: '1px solid '+vT.amber+'66', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: 999, background: vT.amber, color: 'white', display: 'grid', placeItems: 'center', flexShrink: 0, ...vS, fontWeight: 800, fontSize: 14 }}>!</div>
            <div style={{ flex: 1 }}>
              <div style={{ ...vS, fontSize: 14, fontWeight: 700, color: vT.amberInk }}>Groceries envelope has €52 left over</div>
              <div style={{ ...vS, fontSize: 12, color: vT.amberInk, opacity: 0.8, marginTop: 3 }}>You budgeted €450 for April groceries and spent €398. Where should it go?</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button style={{ ...vS, padding: '7px 14px', borderRadius: 999, border: '1.5px solid '+vT.amber, background: vT.surface, color: vT.amberInk, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Roll into May groceries</button>
                <button style={{ ...vS, padding: '7px 14px', borderRadius: 999, border: '1px solid '+vT.line, background: vT.surface, color: vT.ink, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>→ Free budget</button>
                <button style={{ ...vS, padding: '7px 14px', borderRadius: 999, border: '1px solid '+vT.line, background: vT.surface, color: vT.ink, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>→ Savings goal</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </WizardShell>
  );
}

function ReconcileDiff({ k, planned, actual, diff, ok, surplus, info }) {
  const color = ok ? vT.green : surplus ? vT.amber : vT.ink;
  return (
    <div style={{ background: vT.surface2, border: '1px solid '+vT.line, borderRadius: 12, padding: 14 }}>
      <div style={{ ...vM, fontSize: 10, color: vT.dim, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6, whiteSpace: 'nowrap' }}>
        <span style={{ ...vS, fontSize: 22, fontWeight: 700, color: color, letterSpacing: '-0.02em', lineHeight: 1 }}>{actual}</span>
        <span style={{ ...vM, fontSize: 11, color: vT.dim, lineHeight: 1 }}>vs {planned}</span>
      </div>
      <div style={{ ...vM, fontSize: 10, color: color, marginTop: 6, fontWeight: 600, whiteSpace: 'nowrap' }}>
        {ok ? '✓ exact match' : surplus ? `${diff} surplus` : diff}
      </div>
    </div>
  );
}

// Step 4: Allocate leftover free budget
function CsvWizardStep4() {
  const [alloc, setAlloc] = React.useState('roll');
  const leftover = 218;
  return (
    <WizardShell step={3} total={4} title="What about April's leftover free budget?"
      subtitle={`You spent €394 of your €612 free budget — €${leftover} is unaccounted for. We'll never assume; you decide.`}
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ ...vM, fontSize: 11, color: vT.dim, whiteSpace: 'nowrap' }}>This step closes April.</span>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button style={{ ...vS, padding: '9px 16px', borderRadius: 999, border: '1px solid '+vT.line, background: vT.surface, fontSize: 13, fontWeight: 600, color: vT.ink, cursor: 'pointer', whiteSpace: 'nowrap' }}>← Back</button>
            <button style={{ ...vS, padding: '9px 18px', borderRadius: 999, border: 'none', background: vT.peri, color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Close April ✓</button>
          </div>
        </div>
      }>
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 22 }}>
        {/* options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { id: 'roll',    t: 'Roll into May free budget',     sub: 'Your May free budget becomes €685 → €903 once we apply this.',     d: '+€218 to May', dc: vT.peri },
            { id: 'pot',    t: 'Send to the pot',                sub: 'Pot grows by €218 → €1,458. Earlier-than-needed coverage on plans.', d: '+€218 to pot', dc: vT.peri  },
            { id: 'goal',    t: 'Add to a savings goal',        sub: 'Pick a goal below. The €218 goes straight there.',                 d: 'Custom', dc: vT.dim },
            { id: 'discard', t: 'Leave it where it is',         sub: 'Treat April as fully spent. Free budget norm gets a downward nudge.', d: 'No change', dc: vT.subdim },
          ].map(opt => {
            const sel = alloc === opt.id;
            return (
              <button key={opt.id} onClick={() => setAlloc(opt.id)} style={{
                ...vS, textAlign: 'left', padding: 14, border: '1.5px solid '+(sel ? vT.peri : vT.line),
                background: sel ? vT.periTint : vT.surface, borderRadius: 12, cursor: 'pointer',
                display: 'grid', gridTemplateColumns: '20px 1fr auto', gap: 12, alignItems: 'center',
              }}>
                <div style={{ width: 18, height: 18, borderRadius: 999, border: '2px solid '+(sel ? vT.peri : vT.line), position: 'relative' }}>
                  {sel && <div style={{ position: 'absolute', inset: 3, borderRadius: 999, background: vT.peri }}/>}
                </div>
                <div>
                  <div style={{ ...vS, fontSize: 14, fontWeight: 700, color: vT.ink }}>{opt.t}</div>
                  <div style={{ ...vS, fontSize: 12, color: vT.dim, marginTop: 2 }}>{opt.sub}</div>
                </div>
                <div style={{ ...vM, fontSize: 11, color: opt.dc, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{opt.d}</div>
              </button>
            );
          })}

          {alloc === 'goal' && (
            <div style={{ marginTop: 4, padding: 14, background: vT.bg, borderRadius: 12 }}>
              <div style={{ ...vM, fontSize: 10, color: vT.dim, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 8 }}>Pick a goal</div>
              <div style={{ display: 'grid', gap: 6 }}>
                {MOCK.savingsGoals.filter(g => g.mode === 'target').map(g => (
                  <button key={g.id} style={{ ...vS, padding: '8px 12px', textAlign: 'left', background: vT.surface, border: '1px solid '+vT.line, borderRadius: 8, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: vT.ink, fontWeight: 600 }}>{g.name}</span>
                    <span style={{ ...vM, fontSize: 11, color: vT.dim }}>€{g.current.toLocaleString()} / €{g.target.toLocaleString()}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* preview */}
        <div style={{ background: vT.ink, color: vT.surface, borderRadius: 16, padding: 20, position: 'relative', overflow: 'hidden' }}>
          <div style={{ ...vM, fontSize: 10, color: vT.subdim, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Preview after April closes</div>

          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <PreviewRow k="May free to spend" before="€685" after={alloc === 'roll' ? '€903' : '€685'} highlight={alloc === 'roll'} />
            <PreviewRow k="Pot balance"       before="€1,240" after={alloc === 'pot' ? '€1,458' : '€1,240'} highlight={alloc === 'pot'} />
            <PreviewRow k="Bicycle goal"      before="€480" after={alloc === 'goal' ? '€698' : '€480'} highlight={alloc === 'goal'} muted={alloc !== 'goal'} />
            <PreviewRow k="Free-budget norm"  before="€612/mo" after={alloc === 'discard' ? '€583/mo ↘' : '€612/mo'} highlight={alloc === 'discard'} />
          </div>

          <div style={{ marginTop: 22, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ ...vM, fontSize: 10, color: vT.subdim, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Resulting lock state</div>
            <div style={{ ...vS, fontSize: 13, marginTop: 4, color: '#A5F3B5', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 14, height: 14, borderRadius: 999, background: vT.green, display: 'grid', placeItems: 'center' }}>
                <svg width="8" height="8" viewBox="0 0 9 9" fill="none"><path d="M1.5 4.5l2 2 4-4" stroke="white" strokeWidth="1.6" strokeLinecap="round"/></svg>
              </span>
              April set-aside · €540 confirmed
            </div>
          </div>

          <div style={{ position: 'absolute', right: -40, top: -40, width: 160, height: 160, borderRadius: 999, background: vT.peri, opacity: 0.15, filter: 'blur(30px)' }}/>
        </div>
      </div>
    </WizardShell>
  );
}

function PreviewRow({ k, before, after, highlight, muted }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px', gap: 10, alignItems: 'center', opacity: muted ? 0.4 : 1 }}>
      <div style={{ ...vS, fontSize: 12, color: vT.subdim }}>{k}</div>
      <div style={{ ...vM, fontSize: 13, color: vT.subdim, textAlign: 'right', textDecoration: highlight ? 'line-through' : 'none' }}>{before}</div>
      <div style={{ ...vM, fontSize: 14, fontWeight: 700, color: highlight ? '#A5F3B5' : vT.surface, textAlign: 'right' }}>{after}</div>
    </div>
  );
}

window.CsvWizardStep1 = CsvWizardStep1;
window.CsvWizardStep2 = CsvWizardStep2;
window.CsvWizardStep3 = CsvWizardStep3;
window.CsvWizardStep4 = CsvWizardStep4;
