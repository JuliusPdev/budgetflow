import { useEffect, useRef, useState } from 'react';
import { Settings2, Undo2, X } from 'lucide-react';
import { addMonths, runEngine } from '../engine/smoothing';
import { formatCurrency, formatCurrencyExact, formatMonth } from '../utils/formatting';
import type { BudgetState, EngineOutput, Month, MonthResult, PlannedExpense } from '../engine/types';

interface Props {
  engine: EngineOutput;
  budget: BudgetState;
  currentMonth: Month;
  canUndo: boolean;
  onUndo: () => void;
  onOpenSettings: () => void;
  addPlannedExpense: (expense: Omit<PlannedExpense, 'id'>) => void;
  updatePlannedExpense: (id: string, changes: Partial<Omit<PlannedExpense, 'id'>>) => void;
  removePlannedExpense: (id: string) => void;
  lockIn: (amount: number) => void;
  freeUp: (amount: number) => void;
}

interface Point {
  x: number;
  y: number;
}

const TIMELINE_LABEL_WIDTH = 200;
const TIMELINE_MONTH_WIDTH = 92;

function timelineGridColumns(monthCount: number): { gridTemplateColumns: string } {
  return {
    gridTemplateColumns: `${TIMELINE_LABEL_WIDTH}px repeat(${monthCount}, ${TIMELINE_MONTH_WIDTH}px)`,
  };
}

function shortMonth(month: Month): string {
  return formatMonth(month).slice(0, 3);
}

function formatMonthYearShort(month: Month): string {
  const [year] = month.split('-');
  return `'${year.slice(2)}`;
}

function smoothPath(points: Point[]): string {
  if (points.length < 2) return '';
  if (points.length === 2) return `M${points[0].x},${points[0].y} L${points[1].x},${points[1].y}`;

  const slopes = points.slice(0, -1).map((point, index) => {
    const next = points[index + 1];
    return (next.y - point.y) / (next.x - point.x || 1);
  });
  const tangents = points.map((_, index) => {
    if (index === 0) return slopes[0];
    if (index === points.length - 1) return slopes[slopes.length - 1];

    const previousSlope = slopes[index - 1];
    const nextSlope = slopes[index];
    if (previousSlope * nextSlope <= 0) return 0;
    return (previousSlope + nextSlope) / 2;
  });

  // Limit the handles so the curve passes through each real month point without
  // overshooting into invented peaks or dips between months.
  for (let i = 0; i < slopes.length; i++) {
    if (slopes[i] === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }

    const alpha = tangents[i] / slopes[i];
    const beta = tangents[i + 1] / slopes[i];
    const handleLength = Math.hypot(alpha, beta);
    if (handleLength > 3) {
      const scale = 3 / handleLength;
      tangents[i] = scale * alpha * slopes[i];
      tangents[i + 1] = scale * beta * slopes[i];
    }
  }

  let path = `M${points[0].x},${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const current = points[i];
    const next = points[i + 1];
    const dx = next.x - current.x;
    const c1 = {
      x: current.x + dx / 3,
      y: current.y + (tangents[i] * dx) / 3,
    };
    const c2 = {
      x: next.x - dx / 3,
      y: next.y - (tangents[i + 1] * dx) / 3,
    };

    path += ` C${c1.x},${c1.y} ${c2.x},${c2.y} ${next.x},${next.y}`;
  }

  return path;
}

function V6Chip({ tone = 'dim', children }: { tone?: 'dim' | 'peri' | 'green' | 'amber' | 'red'; children: React.ReactNode }) {
  return <span className={`v6-chip v6-chip--${tone}`}>{children}</span>;
}

function getCurrentResult(engine: EngineOutput, currentMonth: Month): MonthResult | undefined {
  return engine.months.find(month => month.month === currentMonth);
}

function getSpentThisMonth(current: MonthResult | undefined): number {
  return current?.unplannedTotal ?? 0;
}

function comparePlannedExpensesByTime(a: PlannedExpense, b: PlannedExpense): number {
  const monthOrder = a.targetMonth.localeCompare(b.targetMonth);
  if (monthOrder !== 0) return monthOrder;
  const nameOrder = a.name.localeCompare(b.name);
  if (nameOrder !== 0) return nameOrder;
  return a.id.localeCompare(b.id);
}

function getCurrentLockedAmount(budget: BudgetState, currentMonth: Month): number {
  return budget.lockIns
    .filter(lock => lock.month === currentMonth)
    .reduce((sum, lock) => sum + lock.lockedAmount, 0);
}

function getFirstFutureRate(engine: EngineOutput, currentMonth: Month): number {
  return engine.months.find(month => month.month > currentMonth && month.setAsideRecommended > 0)?.setAsideRecommended ?? 0;
}

function countMonthsInclusive(startMonth: Month, endMonth: Month): number {
  let count = 0;
  let cursor = startMonth;
  while (cursor <= endMonth) {
    count++;
    cursor = addMonths(cursor, 1);
  }
  return count;
}

interface InlineFormProps {
  label: string;
  prefill: number;
  confirmText: string;
  onConfirm: (amount: number) => void;
  onCancel: () => void;
}

function InlineAmountForm({ label, prefill, confirmText, onConfirm, onCancel }: InlineFormProps) {
  const [valueStr, setValueStr] = useState(prefill.toFixed(2));

  function handleConfirm() {
    const amount = parseFloat(valueStr);
    if (amount > 0) onConfirm(amount);
  }

  return (
    <div className="inline-form v6-lock-inline-form">
      <span className="inline-form-label">{label}</span>
      <div className="input-prefix inline-form-input">
        <input
          className="input"
          type="number"
          min="0"
          step="0.01"
          value={valueStr}
          onChange={event => setValueStr(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') handleConfirm();
            if (event.key === 'Escape') onCancel();
          }}
          autoFocus
        />
      </div>
      <div className="inline-form-actions">
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={handleConfirm}>{confirmText}</button>
      </div>
    </div>
  );
}

function PotTrajectoryChart({ engine, currentMonth }: { engine: EngineOutput; currentMonth: Month }) {
  const months = engine.months;
  const width = TIMELINE_LABEL_WIDTH + months.length * TIMELINE_MONTH_WIDTH;
  const height = 280;
  const padLeft = TIMELINE_LABEL_WIDTH;
  const padRight = 0;
  const padTop = 28;
  const padBottom = 56;
  const innerHeight = height - padTop - padBottom;
  const monthCenterX = (index: number) => padLeft + index * TIMELINE_MONTH_WIDTH + TIMELINE_MONTH_WIDTH / 2;
  const pots = months.map(month => Math.max(0, month.potAfter));
  const freeBudgets = months.map(month => month.freeBudget);
  const maxPot = Math.max(1, ...pots) * 1.2;
  const maxFreeBudget = Math.max(1, ...freeBudgets);
  const minFreeBudget = Math.min(0, ...freeBudgets);
  // Extra headroom on the free-budget scale pushes the line visually lower vs the pot line.
  const freeBudgetScaleMax = maxFreeBudget * 1.3;
  const freeBudgetScaleMin = minFreeBudget;
  const freeBudgetRange = Math.max(1, freeBudgetScaleMax - freeBudgetScaleMin);
  const currentIndex = Math.max(0, months.findIndex(month => month.month === currentMonth));
  const yForPot = (amount: number) => padTop + innerHeight - (Math.max(0, amount) / maxPot) * innerHeight;
  const yForFreeBudget = (amount: number) => padTop + innerHeight - ((amount - freeBudgetScaleMin) / freeBudgetRange) * innerHeight;
  const potPoints = months.map((month, index) => {
    const x = monthCenterX(index);
    const y = yForPot(month.potAfter);
    return { x, y };
  });
  const freeBudgetPoints = months.map((month, index) => {
    const x = monthCenterX(index);
    const y = yForFreeBudget(month.freeBudget);
    return { x, y };
  });
  const potLinePath = smoothPath(potPoints);
  const freeBudgetLinePath = smoothPath(freeBudgetPoints);
  const areaPath = `${potLinePath} L${potPoints[potPoints.length - 1]?.x ?? padLeft},${padTop + innerHeight} L${potPoints[0]?.x ?? padLeft},${padTop + innerHeight} Z`;

  return (
    <div className="v6-chart-shell" style={{ width }}>
      <svg
        className="v6-chart"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Pot balance and free budget over the planning months"
      >
        <defs>
        <linearGradient id="v6-pot-gradient" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--text)" stopOpacity="0.12" />
          <stop offset="100%" stopColor="var(--text)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {[0, 0.25, 0.5, 0.75, 1].map(tick => (
        <line
          key={tick}
          x1={padLeft}
          x2={width - padRight}
          y1={padTop + innerHeight * tick}
          y2={padTop + innerHeight * tick}
          stroke={tick === 1 ? 'var(--border)' : 'var(--border-light)'}
          strokeDasharray={tick === 1 ? '0' : '3 5'}
        />
      ))}

      {potPoints[currentIndex] && (
        <>
          <rect
            x={padLeft + currentIndex * TIMELINE_MONTH_WIDTH}
            y={padTop}
            width={TIMELINE_MONTH_WIDTH}
            height={innerHeight}
            fill="var(--color-accent-tint)"
            opacity="0.9"
          />
          {currentIndex > 0 && (
            <line
              x1={(potPoints[currentIndex - 1].x + potPoints[currentIndex].x) / 2}
              x2={(potPoints[currentIndex - 1].x + potPoints[currentIndex].x) / 2}
              y1={padTop}
              y2={padTop + innerHeight}
              stroke="var(--text-muted)"
              strokeDasharray="2 4"
              opacity="0.7"
            />
          )}
        </>
      )}

      <path d={areaPath} fill="url(#v6-pot-gradient)" />
      <path d={potLinePath} fill="none" stroke="var(--text)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <path d={freeBudgetLinePath} fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="5 5" />

      {months.map((month, monthIndex) => {
        const point = potPoints[monthIndex];
        const sortedExpenses = [...month.plannedExpenses].sort(comparePlannedExpensesByTime);
        if (!point || sortedExpenses.length === 0) return null;
        const plannedTotal = sortedExpenses.reduce((sum, expense) => sum + expense.amount, 0);
        const label = sortedExpenses.length === 1 ? sortedExpenses[0].name : `${sortedExpenses.length} planned`;

        return (
          <g key={`${month.month}-planned-hit`} className="v6-chart-hit">
            <line x1={point.x} x2={point.x} y1={point.y + 9} y2={padTop + innerHeight} stroke="var(--color-irregular)" strokeDasharray="1 5" opacity="0.28" />
            <circle cx={point.x} cy={point.y} r="6" fill="var(--color-irregular)" stroke="var(--bg-card)" strokeWidth="2.5" />
            <g transform={`translate(${point.x} ${point.y - 14})`}>
              <text x="0" y="-15" textAnchor="middle" className="v6-chart-label">{label}</text>
              <text x="0" y="-6" textAnchor="middle" className="v6-chart-amount">-{formatCurrency(plannedTotal)}</text>
            </g>
          </g>
        );
      })}

      {months.map((month, index) => {
        const point = potPoints[index];
        const isCurrent = month.month === currentMonth;
        const isPast = month.month < currentMonth;
        return (
          <g key={month.month}>
            <text x={point.x} y={height - 30} textAnchor="middle" className={`v6-chart-month ${isCurrent ? 'is-current' : ''} ${isPast ? 'is-past' : ''}`}>
              {shortMonth(month.month).toUpperCase()}
            </text>
            <text x={point.x} y={height - 16} textAnchor="middle" className="v6-chart-pot">
              {formatCurrency(month.potAfter)}
            </text>
          </g>
        );
      })}

      {[0, 0.5, 1].map(tick => {
        const value = freeBudgetScaleMin + freeBudgetRange * tick;
        return (
          <text key={tick} x={width - 8} y={padTop + innerHeight * (1 - tick) + 3} textAnchor="end" className="v6-chart-free-axis">
            {formatCurrency(value)}
          </text>
        );
      })}
      </svg>
      <div
        className="v6-chart-gutter"
        style={{ width: TIMELINE_LABEL_WIDTH, height }}
        aria-hidden="true"
      >
        {[0, 0.5, 1].map(tick => (
          <span
            key={tick}
            className="v6-chart-gutter-label"
            style={{ top: padTop + innerHeight * (1 - tick) }}
          >
            {formatCurrency(maxPot * tick)}
          </span>
        ))}
      </div>
    </div>
  );
}

function SetAsideLockCard({
  budget,
  currentMonth,
  current,
  lockIn,
  freeUp,
}: {
  budget: BudgetState;
  currentMonth: Month;
  current: MonthResult | undefined;
  lockIn: (amount: number) => void;
  freeUp: (amount: number) => void;
}) {
  const [lockForm, setLockForm] = useState<{ prefill: number; mode: 'lock' | 'additional' } | null>(null);
  const [freeUpForm, setFreeUpForm] = useState<{ prefill: number } | null>(null);
  const lockStatus = current?.lockStatus ?? { kind: 'unlocked' as const };
  const recommended = current?.setAsideRecommended ?? 0;
  const currentLockIn = budget.lockIns.find(lock => lock.month === currentMonth);
  const lockState = currentLockIn?.lockState ?? 'planned';
  const lockedDisplay = lockStatus.kind === 'unlocked' ? 0 : lockStatus.lockedAmount;
  const displayThreshold = 0.5;
  const effectivelyOnTrack =
    (lockStatus.kind === 'additional-needed' && lockStatus.additionalNeeded < displayThreshold) ||
    (lockStatus.kind === 'surplus' && lockStatus.surplus < displayThreshold);
  const statusKind = effectivelyOnTrack ? 'on-track' : lockStatus.kind;
  const additionalNeeded = lockStatus.kind === 'additional-needed' && !effectivelyOnTrack
    ? lockStatus.additionalNeeded
    : 0;
  const surplus = lockStatus.kind === 'surplus' && !effectivelyOnTrack
    ? lockStatus.surplus
    : 0;
  const remainingSetAside = statusKind === 'additional-needed'
    ? additionalNeeded
    : Math.max(0, recommended - lockedDisplay);
  const lockedPct = recommended > 0 ? Math.min(100, Math.round((lockedDisplay / recommended) * 100)) : 0;
  const lockTone = statusKind === 'unlocked'
    ? 'empty'
    : lockState === 'confirmed'
    ? 'confirmed'
    : 'planned';

  function getCaption(): string {
    if (statusKind === 'unlocked') return 'Nothing transferred yet this month.';
    if (lockState === 'confirmed') return `${formatCurrency(lockedDisplay)} is marked as confirmed.`;
    if (statusKind === 'additional-needed') return `Lock in ${formatCurrency(additionalNeeded)} more to match the plan.`;
    if (statusKind === 'surplus') return `You can free up ${formatCurrency(surplus)} from this month.`;
    return 'This month is fully locked in.';
  }

  return (
    <article className={`v6-card v6-hero-card v6-lock-card v6-lock-card--${lockTone}`} data-testid="management-card">
      <div className="v6-card-topline">
        <span>Set-aside · {shortMonth(currentMonth)}</span>
        {remainingSetAside > 0 && <V6Chip tone="amber">{formatCurrency(remainingSetAside)} to go</V6Chip>}
        {statusKind !== 'unlocked' && lockState === 'confirmed' && <V6Chip tone="green">Confirmed</V6Chip>}
      </div>
      <div className="v6-hero-number-row v6-hero-number-row--tight">
        <strong className="v6-hero-number v6-hero-number--small cmm-amount">{formatCurrency(lockedDisplay)}</strong>
        <span className="v6-denominator">/ {Math.round(recommended).toLocaleString('en-GB')}</span>
      </div>
      <div className="v6-progress" aria-hidden="true">
        <span style={{ width: `${lockedPct}%` }} />
      </div>
      <p className="v6-card-caption">{getCaption()}</p>

      {!lockForm && !freeUpForm && (
        <div className="v6-lock-actions">
          {statusKind === 'unlocked' && (
            <button
              className="btn btn-primary btn-sm"
              data-testid="lock-in-button"
              onClick={() => setLockForm({ prefill: recommended, mode: 'lock' })}
            >
              Lock in
            </button>
          )}
          {statusKind === 'additional-needed' && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setLockForm({ prefill: additionalNeeded, mode: 'additional' })}
            >
              Lock additional
            </button>
          )}
          {statusKind === 'surplus' && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setFreeUpForm({ prefill: surplus })}
            >
              Free up
            </button>
          )}
          {statusKind === 'on-track' && (
            <span className={`setaside-badge ${lockState === 'confirmed' ? 'setaside-badge--ok' : 'setaside-badge--planned'}`}>
              {lockState === 'confirmed' ? 'Confirmed ✓' : 'Locked (planned)'}
            </span>
          )}
          <span className="v6-lock-recommended">Recommended {formatCurrencyExact(recommended)}</span>
        </div>
      )}

      {lockForm && (
        <InlineAmountForm
          label={lockForm.mode === 'lock' ? 'How much are you locking in?' : 'How much additional are you locking in?'}
          prefill={lockForm.prefill}
          confirmText="Confirm lock"
          onConfirm={amount => { lockIn(amount); setLockForm(null); }}
          onCancel={() => setLockForm(null)}
        />
      )}

      {freeUpForm && (
        <InlineAmountForm
          label="How much do you want to free up?"
          prefill={freeUpForm.prefill}
          confirmText="Free up"
          onConfirm={amount => { freeUp(amount); setFreeUpForm(null); }}
          onCancel={() => setFreeUpForm(null)}
        />
      )}
    </article>
  );
}

function HeroCards({
  engine,
  budget,
  currentMonth,
  lockIn,
  freeUp,
}: {
  engine: EngineOutput;
  budget: BudgetState;
  currentMonth: Month;
  lockIn: (amount: number) => void;
  freeUp: (amount: number) => void;
}) {
  const current = getCurrentResult(engine, currentMonth);
  const spent = getSpentThisMonth(current);
  const freeBudget = current?.freeBudget ?? 0;
  const remainingFree = Math.max(0, freeBudget - spent);
  const pot = current?.physicalPotAfter ?? 0;
  const spentPct = freeBudget > 0 ? Math.min(100, Math.round((spent / freeBudget) * 100)) : 0;
  const peak = engine.months.reduce((max, month) => Math.max(max, month.physicalPotAfter), 0);
  const finalPot = engine.months[engine.months.length - 1]?.physicalPotAfter ?? 0;

  return (
    <section className="v6-hero-grid" aria-label="Current budget summary">
      <article className="v6-card v6-hero-card v6-hero-card--primary">
        <div className="v6-card-topline">
          <span>Free to spend · {shortMonth(currentMonth)}</span>
          <V6Chip tone={freeBudget >= 0 ? 'green' : 'red'}>{freeBudget >= 0 ? 'On track' : 'Over budget'}</V6Chip>
        </div>
        <div className="v6-hero-number-row">
          <strong className="v6-hero-number" data-testid="free-budget-number">{formatCurrency(freeBudget)}</strong>
          <span className="v6-hero-note">
            {formatCurrency(spent)} spent<br />
            {formatCurrency(remainingFree)} left
          </span>
        </div>
        <div className="v6-progress v6-progress--split" aria-hidden="true">
          <span style={{ width: `${spentPct}%` }} />
          <span style={{ width: `${100 - spentPct}%` }} />
        </div>
        <div className="v6-meta-row">
          <span>{formatCurrency(spent)} spent</span>
          <span>{formatCurrency(remainingFree)} remaining</span>
        </div>
      </article>

      <article className="v6-card v6-hero-card">
        <div className="v6-card-topline"><span>Pot balance</span></div>
        <strong className="v6-hero-number v6-hero-number--small">{formatCurrency(pot)}</strong>
        <p className="v6-trend">Peak forecast {formatCurrency(peak)}</p>
        <div className="v6-mini-trace">
          <div>current · {formatCurrency(pot)}</div>
          <div>final month · {formatCurrency(finalPot)}</div>
        </div>
      </article>

      <SetAsideLockCard
        budget={budget}
        currentMonth={currentMonth}
        current={current}
        lockIn={lockIn}
        freeUp={freeUp}
      />
    </section>
  );
}

function HorizontalLedger({
  engine,
  budget,
  currentMonth,
  updatePlannedExpense,
  removePlannedExpense,
  onPlanExpenseForMonth,
}: {
  engine: EngineOutput;
  budget: BudgetState;
  currentMonth: Month;
  updatePlannedExpense: (id: string, changes: Partial<Omit<PlannedExpense, 'id'>>) => void;
  removePlannedExpense: (id: string) => void;
  onPlanExpenseForMonth: (month: Month) => void;
}) {
  const [editingExpense, setEditingExpense] = useState<{ expense: PlannedExpense; initialFocus: 'name' | 'amount' } | null>(null);
  const months = engine.months;
  const sortedPlannedExpenses = [...budget.plannedExpenses].sort(comparePlannedExpensesByTime);
  const gridStyle = timelineGridColumns(months.length);
  const timelineWidth = TIMELINE_LABEL_WIDTH + months.length * TIMELINE_MONTH_WIDTH;
  const rows = [
    {
      group: 'Inflow',
      label: 'Income',
      values: months.map(
        month =>
          (budget.incomeByMonth?.[month.month] ?? budget.income) + month.incomeCarryover,
      ),
      tone: 'ink',
    },
    {
      group: 'Outflow',
      label: 'Fixed expenses',
      values: months.map(() => -engine.fixedTotal),
      tone: 'ink2',
    },
    {
      group: 'Outflow',
      label: 'Savings',
      values: months.map(() => -engine.modeBSavingsTotal),
      tone: 'ink2',
    },
    {
      group: 'Outflow',
      label: 'Set-aside to pot',
      values: months.map(month => -month.setAsideRecommended),
      tone: 'amber',
    },
    {
      group: 'Answer',
      label: 'Free to spend',
      values: months.map(month => month.freeBudget),
      tone: 'peri',
      highlight: true,
    },
    {
      group: 'Answer',
      label: 'Pot balance end',
      values: months.map(month => month.potAfter),
      tone: 'ink',
    },
  ];

  return (
    <div className="v6-ledger-scroll">
      <div className="v6-ledger" style={{ width: timelineWidth }}>
        <div className="v6-ledger-row v6-ledger-header" style={gridStyle}>
          <div>Line item</div>
          {months.map(month => {
            const isCurrent = month.month === currentMonth;
            const isPast = month.month < currentMonth;
            return (
              <div key={month.month} className={`v6-ledger-cell ${isCurrent ? 'is-current' : ''} ${isPast ? 'is-past' : ''}`}>
                <strong>{shortMonth(month.month)} <span>{formatMonthYearShort(month.month)}</span></strong>
                <small>
                  {isCurrent ? 'Now' : isPast ? 'Past' : 'Planned'}
                </small>
              </div>
            );
          })}
        </div>

        {rows.map((row, rowIndex) => {
          const showGroup = rowIndex === 0 || rows[rowIndex - 1].group !== row.group;
          return (
            <div key={row.label}>
              {showGroup && (
                <div className="v6-ledger-row v6-ledger-group" style={gridStyle}>
                  <div>{row.group}</div>
                  {months.map(month => <div key={month.month} className={month.month === currentMonth ? 'is-current' : ''} />)}
                </div>
              )}
              <div className={`v6-ledger-row ${row.highlight ? 'is-highlight' : ''}`} style={gridStyle}>
                <div className={`v6-ledger-label v6-ledger-tone--${row.tone}`}>{row.label}</div>
                {row.values.map((value, valueIndex) => {
                  const month = months[valueIndex];
                  return (
                    <div
                      key={month.month}
                      className={`v6-ledger-value v6-ledger-tone--${row.tone} ${month.month === currentMonth ? 'is-current' : ''} ${month.month < currentMonth ? 'is-past' : ''}`}
                    >
                      {value < 0 ? '-' : ''}{formatCurrency(Math.abs(value)).replace('€', '')}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {sortedPlannedExpenses.length > 0 && (
          <>
            <div className="v6-ledger-row v6-ledger-group" style={gridStyle}>
              <div>Planned expenses</div>
              {months.map(month => <div key={month.month} className={month.month === currentMonth ? 'is-current' : ''} />)}
            </div>
            {sortedPlannedExpenses.map(expense => (
              <div key={expense.id} className="v6-ledger-row" style={gridStyle}>
                <div className="v6-ledger-planned-name">
                  <span className="v6-ledger-dot" />
                  <span>{expense.name}</span>
                  <button
                    type="button"
                    className="v6-ledger-remove-btn"
                    onClick={() => removePlannedExpense(expense.id)}
                    aria-label={`Remove ${expense.name}`}
                  >
                    ×
                  </button>
                </div>
                {months.map(month => (
                  <div
                    key={month.month}
                    className={`v6-ledger-value v6-ledger-tone--amber ${month.month === currentMonth ? 'is-current' : ''} ${month.month < currentMonth ? 'is-past' : ''}`}
                  >
                    {month.month === expense.targetMonth ? (
                      <button
                        type="button"
                        className="v6-ledger-planned-cell-btn"
                        onClick={() => setEditingExpense({ expense, initialFocus: 'amount' })}
                        onDoubleClick={() => setEditingExpense({ expense, initialFocus: 'amount' })}
                        aria-label={`Edit amount for ${expense.name} in ${formatMonth(month.month)}`}
                        title={`Edit amount for ${expense.name} in ${formatMonth(month.month)}`}
                      >
                        -{formatCurrency(expense.amount).replace('€', '')}
                      </button>
                    ) : (
                      '·'
                    )}
                  </div>
                ))}
              </div>
            ))}
          </>
        )}
      </div>

      <div className="v6-ledger-add-row" style={{ ...gridStyle, width: timelineWidth }}>
        <div className="v6-ledger-add-label" aria-hidden="true" />
        {months.map(month => {
          const isPast = month.month < currentMonth;
          return (
            <div
              key={month.month}
              className={`v6-ledger-add-cell ${month.month === currentMonth ? 'is-current' : ''} ${isPast ? 'is-past' : ''}`}
            >
              <button
                type="button"
                className="v6-ledger-add-btn"
                disabled={isPast}
                onClick={() => onPlanExpenseForMonth(month.month)}
                aria-label={`Plan expense for ${formatMonth(month.month)}`}
                title={`Plan expense for ${formatMonth(month.month)}`}
              >
                +
              </button>
            </div>
          );
        })}
      </div>

      {editingExpense && (
        <EditPlannedExpenseModal
          expense={editingExpense.expense}
          initialFocus={editingExpense.initialFocus}
          currentMonth={currentMonth}
          onClose={() => setEditingExpense(null)}
          onSave={changes => {
            updatePlannedExpense(editingExpense.expense.id, changes);
            setEditingExpense(null);
          }}
        />
      )}
    </div>
  );
}

function EditPlannedExpenseModal({
  expense,
  initialFocus,
  currentMonth,
  onClose,
  onSave,
}: {
  expense: PlannedExpense;
  initialFocus: 'name' | 'amount';
  currentMonth: Month;
  onClose: () => void;
  onSave: (changes: Partial<Omit<PlannedExpense, 'id'>>) => void;
}) {
  const amountInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(expense.name);
  const [amountStr, setAmountStr] = useState(String(expense.amount));
  const [targetMonth, setTargetMonth] = useState(expense.targetMonth);
  const minTargetMonth = expense.targetMonth < currentMonth ? expense.targetMonth : currentMonth;
  const amount = parseFloat(amountStr) || 0;
  const canSave = name.trim().length > 0 && amount > 0 && targetMonth >= minTargetMonth;

  function handleSave() {
    if (!canSave) return;
    onSave({
      name: name.trim(),
      amount,
      targetMonth,
    });
  }

  useEffect(() => {
    if (initialFocus !== 'amount') return;
    amountInputRef.current?.focus();
    amountInputRef.current?.select();
  }, [initialFocus]);

  return (
    <div className="modal-overlay v6-planner-overlay" onClick={onClose}>
      <div className="modal v6-planner-modal v6-edit-expense-modal" role="dialog" aria-modal="true" aria-labelledby="v6-edit-expense-title" onClick={event => event.stopPropagation()}>
        <div className="v6-planner-header">
          <div>
            <p className="csv-wizard-kicker">Planning</p>
            <h2 id="v6-edit-expense-title" className="modal-title">Edit planned expense</h2>
            <p className="v6-card-caption">Change the amount or deadline, then BudgetFlow recalculates the whole plan.</p>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="v6-planner-grid">
          <label className="v6-planner-field">
            <span>Expense name</span>
            <input className="input" value={name} onChange={event => setName(event.target.value)} autoFocus={initialFocus === 'name'} />
          </label>
          <label className="v6-planner-field">
            <span>Amount</span>
            <div className="input-prefix">
              <input ref={amountInputRef} className="input" type="number" min="0" value={amountStr} onChange={event => setAmountStr(event.target.value)} />
            </div>
          </label>
          <label className="v6-planner-field">
            <span>Target month</span>
            <input className="input" type="month" min={minTargetMonth} value={targetMonth} onChange={event => setTargetMonth(event.target.value)} />
          </label>
        </div>

        <div className="csv-step-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!canSave} onClick={handleSave}>Save changes</button>
        </div>
      </div>
    </div>
  );
}

function PlanExpenseModal({
  engine,
  budget,
  currentMonth,
  initialTargetMonth,
  onClose,
  onConfirm,
}: {
  engine: EngineOutput;
  budget: BudgetState;
  currentMonth: Month;
  initialTargetMonth?: Month;
  onClose: () => void;
  onConfirm: (expense: Omit<PlannedExpense, 'id'>) => void;
}) {
  const [name, setName] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [targetMonth, setTargetMonth] = useState(initialTargetMonth ?? currentMonth);
  const [pendingDecision, setPendingDecision] = useState<Omit<PlannedExpense, 'id'> | null>(null);
  const [selectedFundingChoice, setSelectedFundingChoice] = useState<'include-current' | 'start-next' | null>(null);
  const amount = parseFloat(amountStr) || 0;
  const canSave = name.trim().length > 0 && amount > 0 && targetMonth >= currentMonth;
  const previewBudget: BudgetState = {
    ...budget,
    plannedExpenses: [
      ...budget.plannedExpenses,
      {
        id: 'preview',
        name: name.trim() || 'New planned expense',
        amount,
        targetMonth,
        category: 'general',
        confidence: 'confirmed',
      },
    ],
  };
  const previewEngine = amount > 0 ? runEngine(previewBudget, currentMonth) : null;
  const previewCurrent = previewEngine?.months.find(month => month.month === currentMonth);

  function buildExpense(startFromMonth?: Month): Omit<PlannedExpense, 'id'> {
    return {
      name: name.trim(),
      amount,
      targetMonth,
      category: 'general',
      confidence: 'confirmed',
      ...(startFromMonth ? { startFromMonth } : {}),
    };
  }

  function shouldAskForFundingDecision(expense: Omit<PlannedExpense, 'id'>): boolean {
    const currentLockedAmount = getCurrentLockedAmount(budget, currentMonth);
    if (currentLockedAmount <= 0 || expense.targetMonth <= currentMonth) return false;

    const optionOneBudget: BudgetState = {
      ...budget,
      plannedExpenses: [
        ...budget.plannedExpenses,
        { id: 'preview', ...expense },
      ],
    };
    const optionOneEngine = runEngine(optionOneBudget, currentMonth);
    const optionOneCurrent = optionOneEngine.months.find(month => month.month === currentMonth);
    const additionalNeeded = Math.max(0, (optionOneCurrent?.setAsideRecommended ?? 0) - currentLockedAmount);

    return additionalNeeded > 0;
  }

  function resetAndClose() {
    setPendingDecision(null);
    setSelectedFundingChoice(null);
    onClose();
  }

  function handleConfirm() {
    if (!canSave) return;
    const expense = buildExpense();
    if (shouldAskForFundingDecision(expense)) {
      setPendingDecision(expense);
      setSelectedFundingChoice(null);
      return;
    }
    onConfirm(expense);
  }

  function handleConfirmFundingDecision() {
    if (!pendingDecision || !selectedFundingChoice) return;

    if (selectedFundingChoice === 'start-next') {
      onConfirm({
        ...pendingDecision,
        startFromMonth: addMonths(currentMonth, 1),
      });
      return;
    }

    onConfirm(pendingDecision);
  }

  if (pendingDecision) {
    const nextMonth = addMonths(currentMonth, 1);
    const currentLockedAmount = getCurrentLockedAmount(budget, currentMonth);
    const monthsAvailable = countMonthsInclusive(nextMonth, pendingDecision.targetMonth);
    const monthWord = monthsAvailable === 1 ? 'month' : 'months';

    const optionOneBudget: BudgetState = {
      ...budget,
      plannedExpenses: [
        ...budget.plannedExpenses,
        { id: 'preview', ...pendingDecision },
      ],
    };
    const optionOneEngine = runEngine(optionOneBudget, currentMonth);
    const optionOneCurrent = optionOneEngine.months.find(month => month.month === currentMonth);
    const optionOneRate = optionOneCurrent?.setAsideRecommended ?? 0;
    const additionalNeeded = Math.max(0, optionOneRate - currentLockedAmount);
    const optionOneFutureRate = getFirstFutureRate(optionOneEngine, currentMonth);

    const optionTwoBudget: BudgetState = {
      ...budget,
      plannedExpenses: [
        ...budget.plannedExpenses,
        {
          id: 'preview',
          ...pendingDecision,
          startFromMonth: nextMonth,
        },
      ],
    };
    const optionTwoEngine = runEngine(optionTwoBudget, currentMonth);
    const optionTwoFutureRate = getFirstFutureRate(optionTwoEngine, currentMonth);
    const baseFutureRate = getFirstFutureRate(engine, currentMonth);
    const optionOneFutureAdditional = Math.max(0, optionOneFutureRate - baseFutureRate);
    const optionTwoFutureAdditional = Math.max(0, optionTwoFutureRate - baseFutureRate);
    const showOptionTwoWarning = optionTwoFutureRate > optionTwoEngine.availablePerMonth * 0.8 || monthsAvailable < 2;

    return (
      <div className="modal-overlay v6-planner-overlay" onClick={resetAndClose}>
        <div
          className="modal v6-planner-modal v6-midmonth-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="v6-midmonth-title"
          data-testid="mid-month-modal"
          onClick={event => event.stopPropagation()}
        >
          <div className="v6-planner-header v6-midmonth-header">
            <div>
              <p className="csv-wizard-kicker">Mid-month decision</p>
              <h2 id="v6-midmonth-title" className="modal-title">How do you want to fund {pendingDecision.name}?</h2>
              <p className="v6-card-caption">
                You already locked {formatCurrency(currentLockedAmount)} for {shortMonth(currentMonth)}. Choose whether this new plan should ask for more money now or start from next month.
              </p>
            </div>
            <button type="button" className="modal-close-btn" onClick={resetAndClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>

          <div className="v6-midmonth-summary" aria-label="Expense and lock-in summary">
            <div>
              <span>Current locked amount</span>
              <strong>{formatCurrency(currentLockedAmount)}</strong>
            </div>
            <div>
              <span>Expense</span>
              <strong>{formatCurrency(pendingDecision.amount)}</strong>
            </div>
            <div>
              <span>Deadline</span>
              <strong>{formatMonth(pendingDecision.targetMonth)}</strong>
            </div>
          </div>

          <div className="v6-midmonth-options" role="radiogroup" aria-label="Funding options">
            <button
              type="button"
              className={`v6-midmonth-option ${selectedFundingChoice === 'include-current' ? 'is-selected' : ''}`}
              role="radio"
              aria-checked={selectedFundingChoice === 'include-current'}
              data-testid="modal-option-1"
              onClick={() => setSelectedFundingChoice('include-current')}
            >
              <span className="v6-midmonth-radio" aria-hidden="true" />
              <span className="v6-midmonth-option-copy">
                <span className="v6-midmonth-option-title">Include this month</span>
                <span className="v6-midmonth-option-desc">
                  Set aside an additional {formatCurrency(additionalNeeded)} this month.
                </span>
                <span className="v6-midmonth-option-detail">
                  Future impact: {optionOneFutureAdditional > 0
                    ? `${formatCurrency(optionOneFutureAdditional)} more per month, making the future set-aside ${formatCurrency(optionOneFutureRate)}/month.`
                    : `Future set-aside stays at ${formatCurrency(optionOneFutureRate)}/month.`}
                </span>
              </span>
            </button>

            <button
              type="button"
              className={`v6-midmonth-option ${selectedFundingChoice === 'start-next' ? 'is-selected' : ''}`}
              role="radio"
              aria-checked={selectedFundingChoice === 'start-next'}
              data-testid="modal-option-2"
              onClick={() => setSelectedFundingChoice('start-next')}
            >
              <span className="v6-midmonth-radio" aria-hidden="true" />
              <span className="v6-midmonth-option-copy">
                <span className="v6-midmonth-option-title">Start from next month</span>
                <span className="v6-midmonth-option-desc">
                  Nothing additional this month.
                </span>
                <span className="v6-midmonth-option-detail">
                  Future impact: {formatCurrency(optionTwoFutureAdditional)} more per month for {monthsAvailable} {monthWord}, making the future set-aside {formatCurrency(optionTwoFutureRate)}/month.
                </span>
                {showOptionTwoWarning && (
                  <span className="v6-midmonth-option-warning">
                    Starting next month leaves only {monthsAvailable} {monthWord}, so the future monthly amount may be tight.
                  </span>
                )}
              </span>
            </button>
          </div>

          <div className="v6-midmonth-impact">
            <div>
              <span>Selected impact</span>
              <strong>
                {selectedFundingChoice === 'include-current'
                  ? `${formatCurrency(additionalNeeded)} additional now`
                  : selectedFundingChoice === 'start-next'
                    ? `${formatCurrency(optionTwoFutureAdditional)} more/month from ${shortMonth(nextMonth)}`
                    : 'Choose an option to preview the final effect'}
              </strong>
            </div>
          </div>

          <div className="csv-step-actions">
            <button type="button" className="btn btn-ghost" onClick={resetAndClose}>Cancel</button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!selectedFundingChoice}
              onClick={handleConfirmFundingDecision}
            >
              {selectedFundingChoice ? 'Confirm funding choice' : 'Choose an option'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay v6-planner-overlay" onClick={resetAndClose}>
      <div className="modal v6-planner-modal" role="dialog" aria-modal="true" aria-labelledby="v6-planner-title" onClick={event => event.stopPropagation()}>
        <div className="v6-planner-header">
          <div>
            <p className="csv-wizard-kicker">Planning</p>
            <h2 id="v6-planner-title" className="modal-title">Plan another expense</h2>
            <p className="v6-card-caption">Add the event first, then BudgetFlow shows how it changes your monthly plan before you commit.</p>
          </div>
          <button type="button" className="modal-close-btn" onClick={resetAndClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="v6-planner-grid">
          <label className="v6-planner-field">
            <span>Expense name</span>
            <input className="input" value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Trip to Lisbon" autoFocus />
          </label>
          <label className="v6-planner-field">
            <span>Amount</span>
            <div className="input-prefix">
              <input className="input" type="number" min="0" value={amountStr} onChange={event => setAmountStr(event.target.value)} placeholder="900" />
            </div>
          </label>
          <label className="v6-planner-field">
            <span>Target month</span>
            <input className="input" type="month" min={currentMonth} value={targetMonth} onChange={event => setTargetMonth(event.target.value)} />
          </label>
        </div>

        <div className="v6-planner-analysis">
          <div className="v6-card-topline"><span>Preview analysis</span></div>
          {previewCurrent ? (
            <div className="v6-planner-analysis-grid">
              <div>
                <span>Monthly set-aside</span>
                <strong>{formatCurrency(previewCurrent.setAsideRecommended)}</strong>
              </div>
              <div>
                <span>Free to spend</span>
                <strong>{formatCurrency(previewCurrent.freeBudget)}</strong>
              </div>
              <div>
                <span>Deadline</span>
                <strong>{formatMonth(targetMonth)}</strong>
              </div>
            </div>
          ) : (
            <p className="v6-empty-text">Enter an amount to preview how this changes the plan.</p>
          )}
        </div>

        <div className="csv-step-actions">
          <button type="button" className="btn btn-ghost" onClick={resetAndClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!canSave} onClick={handleConfirm}>Add to plan</button>
        </div>
      </div>
    </div>
  );
}

function AlgoTrace({ engine, budget, current }: { engine: EngineOutput; budget: BudgetState; current: MonthResult | undefined }) {
  const plannedTotal = budget.plannedExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const free = current?.freeBudget ?? 0;
  const recommended = current?.setAsideRecommended ?? 0;

  return (
    <article className="v6-algo-card">
      <div className="v6-algo-header">
        <span>Under the hood</span>
        <small>engine.smooth()</small>
      </div>
      <div className="v6-algo-lines">
        <div><span>›</span> available = {formatCurrency(budget.income)} - {formatCurrency(engine.fixedTotal)} - {formatCurrency(engine.modeBSavingsTotal)}</div>
        <div className="is-indent">= <strong>{formatCurrency(engine.availablePerMonth)}</strong>/mo</div>
        <div><span>›</span> planned total = <strong>{formatCurrency(plannedTotal)}</strong></div>
        <div><span>›</span> set-aside = <strong>{formatCurrency(recommended)}</strong>/mo</div>
        <div><span>›</span> free = <strong className="is-good">{formatCurrency(free)}</strong></div>
      </div>
    </article>
  );
}

export default function V6Dashboard({
  engine,
  budget,
  currentMonth,
  canUndo,
  onUndo,
  onOpenSettings,
  addPlannedExpense,
  updatePlannedExpense,
  removePlannedExpense,
  lockIn,
  freeUp,
}: Props) {
  const current = getCurrentResult(engine, currentMonth);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [plannerInitialMonth, setPlannerInitialMonth] = useState<Month>(currentMonth);
  const timelineWidth = TIMELINE_LABEL_WIDTH + engine.months.length * TIMELINE_MONTH_WIDTH;
  const chartScrollRef = useRef<HTMLDivElement>(null);
  const ledgerScrollRef = useRef<HTMLDivElement>(null);
  const isSyncingTimelineScroll = useRef(false);

  function syncTimelineScroll(source: HTMLDivElement) {
    if (isSyncingTimelineScroll.current) return;
    isSyncingTimelineScroll.current = true;
    const peer = source === chartScrollRef.current ? ledgerScrollRef.current : chartScrollRef.current;
    if (peer && peer.scrollLeft !== source.scrollLeft) {
      peer.scrollLeft = source.scrollLeft;
    }
    isSyncingTimelineScroll.current = false;
  }

  function openPlanner(targetMonth: Month = currentMonth) {
    setPlannerInitialMonth(targetMonth);
    setPlannerOpen(true);
  }

  return (
    <div className="v6-app-shell">
      <header className="v6-topbar">
        <div className="v6-brand-row">
          <div className="v6-logo-mark" aria-hidden="true">b</div>
          <strong className="v6-logo-text">BudgetFlow</strong>
          <nav className="v6-nav" aria-label="Primary">
            <button className="is-active">Plan</button>
            <button onClick={onOpenSettings}>Settings</button>
          </nav>
        </div>
        <div className="v6-top-actions">
          <span className="v6-date-status">
            <span>{formatMonth(currentMonth)} · </span>
            <strong>On track for the current plan</strong>
          </span>
          {canUndo && (
            <button className="v6-btn v6-btn--ghost" onClick={onUndo} data-testid="undo-button">
              <Undo2 size={15} /> Undo
            </button>
          )}
          <button className="v6-btn v6-btn--ghost v6-icon-only" onClick={onOpenSettings} aria-label="Open settings">
            <Settings2 size={17} />
          </button>
        </div>
      </header>

      <main className="v6-main">
        <HeroCards
          engine={engine}
          budget={budget}
          currentMonth={currentMonth}
          lockIn={lockIn}
          freeUp={freeUp}
        />

        <section className="v6-card v6-timeline-card">
          <div className="v6-section-header">
            <div>
              <h2>Timeline · next {engine.months.length} months</h2>
              <p>Graph and ledger share the same month columns, so each planned hit lines up with its month.</p>
            </div>
            <div className="v6-legend">
              <span><i className="v6-legend-line" />Pot</span>
              <span><i className="v6-legend-line v6-legend-line--free" />Free budget</span>
              <span><i className="v6-legend-dot" />Planned hit</span>
              <button type="button" className="v6-btn v6-btn--ghost" onClick={() => openPlanner()}>
                + Plan another expense
              </button>
            </div>
          </div>
          <div
            ref={chartScrollRef}
            className="v6-timeline-scroll v6-timeline-scroll--chart"
            onScroll={event => syncTimelineScroll(event.currentTarget)}
          >
            <div className="v6-timeline-canvas" style={{ width: timelineWidth, minWidth: '100%' }}>
              <PotTrajectoryChart engine={engine} currentMonth={currentMonth} />
            </div>
          </div>
          <div className="v6-ledger-heading">
            <h3>Month-by-month ledger</h3>
            <p>Free-to-spend is the answer; everything above it explains how the engine gets there.</p>
          </div>
          <div
            ref={ledgerScrollRef}
            className="v6-timeline-scroll v6-timeline-scroll--ledger"
            onScroll={event => syncTimelineScroll(event.currentTarget)}
          >
            <div className="v6-timeline-canvas" style={{ width: timelineWidth, minWidth: '100%' }}>
              <HorizontalLedger
                engine={engine}
                budget={budget}
                currentMonth={currentMonth}
                updatePlannedExpense={updatePlannedExpense}
                removePlannedExpense={removePlannedExpense}
                onPlanExpenseForMonth={openPlanner}
              />
            </div>
          </div>
        </section>

        <section className="v6-under-hood-section" aria-label="Algorithm trace">
          <AlgoTrace engine={engine} budget={budget} current={current} />
        </section>
      </main>

      {plannerOpen && (
        <PlanExpenseModal
          engine={engine}
          budget={budget}
          currentMonth={currentMonth}
          initialTargetMonth={plannerInitialMonth}
          onClose={() => setPlannerOpen(false)}
          onConfirm={expense => {
            addPlannedExpense(expense);
            setPlannerOpen(false);
          }}
        />
      )}
    </div>
  );
}
