import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Settings2, Undo2, X } from 'lucide-react';
import { runEngine } from '../engine/smoothing';
import { formatCurrency, formatCurrencyExact, formatMonth, formatSignedCurrency } from '../utils/formatting';
import {
  PlannedExpenseFundingModal,
  shouldAskPlannedExpenseFundingTiming,
} from './PlannedExpenseFundingModal';
import {
  plannedExpenseLedgerCell,
  setAsideLedgerAmount,
} from '../utils/ledgerDisplay';
import {
  buildPlannedExpenseMarkers,
  chartPadTop,
  CHART_HIT_MARKER,
  CHART_ITEM_GAP,
  CHART_NAME_TO_AMOUNT,
  CHART_TOTAL_ABOVE_DOT,
  comparePlannedExpensesByTime,
  layoutExpenseLabels,
  type PlannedExpenseChartMarker,
} from './potChartMarkers';
import type {
  BudgetState,
  EngineOutput,
  Month,
  MonthResult,
  PlannedExpense,
  PlannedExpensePayment,
} from '../engine/types';

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
  setAdditionalIncomeForMonth: (month: Month, amount: number) => void;
  clearAdditionalIncomeForMonth: (month: Month) => void;
  recordEarlyPayment: (plannedExpenseId: string, paymentMonth: Month, amount: number, overflowToFreeBudget?: number) => void;
  updateEarlyPayment: (paymentId: string, amount: number, overflowToFreeBudget?: number) => void;
  removeEarlyPayment: (paymentId: string) => void;
  lockIn: (amount: number) => void;
  freeUp: (amount: number) => void;
}

interface Point {
  x: number;
  y: number;
}

const TIMELINE_LABEL_WIDTH = 200;
const TIMELINE_MONTH_MIN_WIDTH = 72;
const TIMELINE_MONTH_DEFAULT_WIDTH = 92;
/** Within a month column: plateau before expense, marker at hit, end-of-month balance. */
const CHART_HIT_PLATEAU = 0.35;
const CHART_MONTH_END = 0.85;

function timelineGridColumns(
  monthCount: number,
  monthWidth: number,
): { gridTemplateColumns: string } {
  return {
    gridTemplateColumns: `${TIMELINE_LABEL_WIDTH}px repeat(${monthCount}, ${monthWidth}px)`,
  };
}

function timelineTotalWidth(monthCount: number, monthWidth: number): number {
  return TIMELINE_LABEL_WIDTH + monthCount * monthWidth;
}

/** Stretch month columns to fill the timeline card; scroll only when months need more than min width. */
function useTimelineMonthWidth(monthCount: number) {
  const containerRef = useRef<HTMLElement>(null);
  const [monthWidth, setMonthWidth] = useState(TIMELINE_MONTH_DEFAULT_WIDTH);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || monthCount === 0) return;

    function updateWidth() {
      const available = element!.clientWidth - TIMELINE_LABEL_WIDTH;
      const computed = Math.floor(available / monthCount);
      setMonthWidth(Math.max(TIMELINE_MONTH_MIN_WIDTH, computed));
    }

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, [monthCount]);

  return {
    containerRef,
    monthWidth,
    timelineWidth: timelineTotalWidth(monthCount, monthWidth),
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

function monthChartX(padLeft: number, monthWidth: number, index: number, fraction: number): number {
  return padLeft + index * monthWidth + monthWidth * fraction;
}

function buildPotLinePoints(
  months: MonthResult[],
  padLeft: number,
  monthWidth: number,
  yForPotPositive: (amount: number) => number,
): Point[] {
  const points: Point[] = [];
  for (let index = 0; index < months.length; index++) {
    const month = months[index];
    if (month.potDeduction <= 0.001) {
      points.push({
        x: monthChartX(padLeft, monthWidth, index, 0.5),
        y: yForPotPositive(Math.max(0, month.potAfter)),
      });
      continue;
    }
    const before = Math.max(0, month.potBeforeExpenses);
    const after = Math.max(0, month.potAfter);
    points.push({
      x: monthChartX(padLeft, monthWidth, index, CHART_HIT_PLATEAU),
      y: yForPotPositive(before),
    });
    points.push({
      x: monthChartX(padLeft, monthWidth, index, CHART_HIT_MARKER),
      y: yForPotPositive(before),
    });
    points.push({
      x: monthChartX(padLeft, monthWidth, index, CHART_MONTH_END),
      y: yForPotPositive(after),
    });
  }
  return points;
}

function buildDebtLinePoints(
  months: MonthResult[],
  padLeft: number,
  monthWidth: number,
  zeroY: number,
  yForDebt: (amount: number) => number,
): Point[] {
  const points: Point[] = [];
  for (let index = 0; index < months.length; index++) {
    const month = months[index];
    const yForSigned = (signed: number) => (signed < 0 ? yForDebt(signed) : zeroY);

    if (month.potDeduction <= 0.001) {
      const signed = Math.min(0, month.potAfter);
      points.push({
        x: monthChartX(padLeft, monthWidth, index, 0.5),
        y: yForSigned(signed),
      });
      continue;
    }

    const beforeSigned = Math.min(0, month.potBeforeExpenses);
    const afterSigned = Math.min(0, month.potAfter);
    points.push({
      x: monthChartX(padLeft, monthWidth, index, CHART_HIT_PLATEAU),
      y: yForSigned(beforeSigned),
    });
    points.push({
      x: monthChartX(padLeft, monthWidth, index, CHART_HIT_MARKER),
      y: yForSigned(beforeSigned),
    });
    points.push({
      x: monthChartX(padLeft, monthWidth, index, CHART_MONTH_END),
      y: yForSigned(afterSigned),
    });
  }
  return points;
}

function ChartPlannedExpenseHit({
  marker,
  zeroY,
}: {
  marker: PlannedExpenseChartMarker;
  zeroY: number;
}) {
  const isMulti = marker.expenses.length > 1;
  const totalY = marker.y - CHART_TOTAL_ABOVE_DOT;
  const labelPositions = isMulti
    ? layoutExpenseLabels(totalY, marker.expenses.length)
    : [];

  return (
    <g className="v6-chart-hit">
      <line
        x1={marker.x}
        x2={marker.x}
        y1={marker.y + 9}
        y2={zeroY}
        stroke="var(--color-irregular)"
        strokeDasharray="1 5"
        opacity="0.28"
      />
      <circle
        cx={marker.x}
        cy={marker.y}
        r="6"
        fill="var(--color-irregular)"
        stroke="var(--bg-card)"
        strokeWidth="2.5"
      />
      {isMulti ? (
        <>
          {marker.expenses.map((expense, index) => {
            const { nameY, amountY } = labelPositions[index];
            return (
              <g key={`${marker.month}-${expense.name}-${index}`}>
                <text
                  x={marker.x}
                  y={nameY}
                  textAnchor="middle"
                  className="v6-chart-expense-name"
                >
                  {expense.name}
                </text>
                <text
                  x={marker.x}
                  y={amountY}
                  textAnchor="middle"
                  className="v6-chart-expense-amount"
                >
                  -{formatCurrency(expense.amount)}
                </text>
              </g>
            );
          })}
          <text
            x={marker.x}
            y={totalY}
            textAnchor="middle"
            className="v6-chart-amount"
          >
            -{formatCurrency(marker.totalAmount)}
          </text>
        </>
      ) : (
        <>
          <text
            x={marker.x}
            y={totalY - CHART_ITEM_GAP - CHART_NAME_TO_AMOUNT}
            textAnchor="middle"
            className="v6-chart-label"
          >
            {marker.expenses[0]?.name ?? ''}
          </text>
          <text
            x={marker.x}
            y={totalY}
            textAnchor="middle"
            className="v6-chart-amount"
          >
            -{formatCurrency(marker.totalAmount)}
          </text>
        </>
      )}
    </g>
  );
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

function PotTrajectoryChart({
  engine,
  currentMonth,
  monthWidth,
}: {
  engine: EngineOutput;
  currentMonth: Month;
  monthWidth: number;
}) {
  const months = engine.months;
  const width = timelineTotalWidth(months.length, monthWidth);
  const height = 280;
  const padLeft = TIMELINE_LABEL_WIDTH;
  const padRight = 0;
  const padTop = chartPadTop(months);
  const padBottom = 56;
  const innerHeight = height - padTop - padBottom;
  const monthCenterX = (index: number) => padLeft + index * monthWidth + monthWidth / 2;
  const pots = months.map(month => Math.max(0, month.potAfter, month.potBeforeExpenses));
  const debtMagnitudes = months.map(month =>
    Math.max(
      Math.abs(Math.min(0, month.potAfter)),
      Math.abs(Math.min(0, month.potBeforeExpenses)),
    ),
  );
  const maxPot = Math.max(1, ...pots) * 1.2;
  const maxDebt = Math.max(1, ...debtMagnitudes) * 1.2;
  const hasSavingsDebt = debtMagnitudes.some(debt => debt > 0.001);
  const chartBottom = padTop + innerHeight;
  // With no debt, zero sits at the chart bottom (full-height positive scale).
  // With debt, split the plot so positive pot is above zero and debt is below.
  const zeroY = hasSavingsDebt
    ? padTop + innerHeight * (1 - maxPot / (maxPot + maxDebt))
    : chartBottom;
  const currentIndex = months.findIndex(month => month.month === currentMonth);
  const yForPotPositive = (amount: number) => hasSavingsDebt
    ? zeroY - (amount / maxPot) * (zeroY - padTop)
    : chartBottom - (amount / maxPot) * innerHeight;
  const yForDebt = (amount: number) => zeroY + (Math.abs(amount) / maxDebt) * (chartBottom - zeroY);
  const potPoints = buildPotLinePoints(months, padLeft, monthWidth, yForPotPositive);
  const savingsDebtPoints = buildDebtLinePoints(months, padLeft, monthWidth, zeroY, yForDebt);
  const expenseMarkers = buildPlannedExpenseMarkers(months, padLeft, monthWidth, yForPotPositive, yForDebt);
  const potLinePath = smoothPath(potPoints);
  const savingsDebtLinePath = smoothPath(savingsDebtPoints);
  const areaPath = `${potLinePath} L${potPoints[potPoints.length - 1]?.x ?? padLeft},${zeroY} L${potPoints[0]?.x ?? padLeft},${zeroY} Z`;

  return (
    <div className="v6-chart-shell" style={{ width }}>
      <svg
        className="v6-chart"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Pot balance and savings debt over the planning months"
      >
        <defs>
        <linearGradient id="v6-pot-gradient" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--text)" stopOpacity="0.12" />
          <stop offset="100%" stopColor="var(--text)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {[0, 0.25, 0.5, 0.75, 1].map(tick => (
        <line
          key={`grid-${tick}`}
          x1={padLeft}
          x2={width - padRight}
          y1={padTop + innerHeight * tick}
          y2={padTop + innerHeight * tick}
          stroke={tick === 1 ? 'var(--border)' : 'var(--border-light)'}
          strokeDasharray={tick === 1 ? '0' : '3 5'}
        />
      ))}

      {hasSavingsDebt && (
        <>
          <line
            x1={padLeft}
            x2={width - padRight}
            y1={zeroY}
            y2={zeroY}
            stroke="var(--border)"
            strokeWidth="1.5"
          />
          {[0.5, 1].map(tick => (
            <line
              key={`debt-grid-${tick}`}
              x1={padLeft}
              x2={width - padRight}
              y1={zeroY + (chartBottom - zeroY) * tick}
              y2={zeroY + (chartBottom - zeroY) * tick}
              stroke="var(--border-light)"
              strokeDasharray="3 5"
            />
          ))}
        </>
      )}

      {currentIndex >= 0 && (
        <>
          <rect
            x={padLeft + currentIndex * monthWidth}
            y={padTop}
            width={monthWidth}
            height={innerHeight}
            fill="var(--color-accent-tint)"
            opacity="0.9"
          />
          {currentIndex > 0 && (
            <line
              x1={(
                monthChartX(
                  padLeft,
                  monthWidth,
                  currentIndex - 1,
                  months[currentIndex - 1].potDeduction > 0.001 ? CHART_MONTH_END : 0.5,
                )
                + monthChartX(
                  padLeft,
                  monthWidth,
                  currentIndex,
                  months[currentIndex].potDeduction > 0.001 ? CHART_HIT_PLATEAU : 0.5,
                )
              ) / 2}
              x2={(
                monthChartX(
                  padLeft,
                  monthWidth,
                  currentIndex - 1,
                  months[currentIndex - 1].potDeduction > 0.001 ? CHART_MONTH_END : 0.5,
                )
                + monthChartX(
                  padLeft,
                  monthWidth,
                  currentIndex,
                  months[currentIndex].potDeduction > 0.001 ? CHART_HIT_PLATEAU : 0.5,
                )
              ) / 2}
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
      {hasSavingsDebt && (
        <path
          d={savingsDebtLinePath}
          fill="none"
          stroke="var(--color-critical)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}

      {expenseMarkers.map(marker => (
        <ChartPlannedExpenseHit
          key={`${marker.month}-planned-hit`}
          marker={marker}
          zeroY={zeroY}
        />
      ))}

      {months.map((month, index) => {
        const isCurrent = month.month === currentMonth;
        const isPast = month.month < currentMonth;
        return (
          <g key={month.month}>
            <text x={monthCenterX(index)} y={height - 30} textAnchor="middle" className={`v6-chart-month ${isCurrent ? 'is-current' : ''} ${isPast ? 'is-past' : ''}`}>
              {shortMonth(month.month).toUpperCase()}
            </text>
            <text
              x={monthCenterX(index)}
              y={height - 16}
              textAnchor="middle"
              className={`v6-chart-pot ${month.potAfter < 0 ? 'v6-chart-pot--debt' : ''}`}
            >
              {formatSignedCurrency(month.potAfter)}
            </text>
          </g>
        );
      })}
      </svg>
      <div
        className="v6-chart-gutter"
        style={{ width: TIMELINE_LABEL_WIDTH, height }}
        aria-hidden="true"
      >
        {hasSavingsDebt ? (
          <>
            {[0, 0.5, 1].map(tick => (
              <span
                key={`pos-${tick}`}
                className="v6-chart-gutter-label"
                style={{ top: zeroY - tick * (zeroY - padTop) }}
              >
                {formatSignedCurrency(maxPot * tick)}
              </span>
            ))}
            {[0.5, 1].map(tick => (
              <span
                key={`neg-${tick}`}
                className="v6-chart-gutter-label v6-chart-gutter-label--negative"
                style={{ top: zeroY + tick * (chartBottom - zeroY) }}
              >
                {formatSignedCurrency(-maxDebt * tick)}
              </span>
            ))}
          </>
        ) : (
          [0, 0.5, 1].map(tick => (
            <span
              key={tick}
              className="v6-chart-gutter-label"
              style={{ top: padTop + innerHeight * (1 - tick) }}
            >
              {formatCurrency(maxPot * tick)}
            </span>
          ))
        )}
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
  const gapBarPct = recommended > 0 ? (additionalNeeded / recommended) * 100 : 0;
  const surplusBarPct = recommended > 0 ? (surplus / recommended) * 100 : 0;
  const lockedBarPct = recommended > 0 ? (lockedDisplay / recommended) * 100 : 0;
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

  function getCaptionClassName(): string {
    if (statusKind === 'additional-needed') {
      return 'v6-card-caption v6-lock-caption v6-lock-caption--needs-more';
    }
    if (statusKind === 'surplus') {
      return 'v6-card-caption v6-lock-caption v6-lock-caption--surplus';
    }
    return 'v6-card-caption';
  }

  function renderLockProgress(): ReactNode {
    if (recommended <= 0) {
      return (
        <div className="v6-progress" aria-hidden="true">
          <span style={{ width: '0%' }} />
        </div>
      );
    }

    if (statusKind === 'additional-needed') {
      return (
        <div className="v6-progress v6-progress--lock v6-progress--lock-needs-more" aria-hidden="true">
          <span className="v6-progress__locked" style={{ width: `${lockedBarPct}%` }} />
          <span className="v6-progress__gap" style={{ width: `${gapBarPct}%` }} />
        </div>
      );
    }

    if (statusKind === 'surplus') {
      return (
        <div className="v6-progress v6-progress--lock v6-progress--lock-surplus" aria-hidden="true">
          <span className="v6-progress__locked" style={{ width: '100%' }} />
          <span className="v6-progress__surplus" style={{ width: `${surplusBarPct}%` }} />
        </div>
      );
    }

    if (statusKind === 'unlocked') {
      return (
        <div className="v6-progress v6-progress--lock v6-progress--lock-needs-more" aria-hidden="true">
          <span className="v6-progress__locked" style={{ width: '0%' }} />
          <span className="v6-progress__gap" style={{ width: '100%' }} />
        </div>
      );
    }

    return (
      <div className="v6-progress" aria-hidden="true">
        <span style={{ width: `${lockedPct}%` }} />
      </div>
    );
  }

  const showToGoChip = remainingSetAside > 0 && statusKind !== 'surplus';
  const toGoChipTone = statusKind === 'additional-needed' || statusKind === 'unlocked' ? 'red' : 'amber';

  return (
    <article
      className={`v6-card v6-hero-card v6-lock-card v6-lock-card--${lockTone}${
        statusKind === 'additional-needed' ? ' v6-lock-card--needs-more' : ''
      }${statusKind === 'surplus' ? ' v6-lock-card--surplus' : ''}`}
      data-testid="management-card"
    >
      <div className="v6-card-topline">
        <span>Set-aside · {shortMonth(currentMonth)}</span>
        {showToGoChip && (
          <V6Chip tone={toGoChipTone}>{formatCurrency(remainingSetAside)} to go</V6Chip>
        )}
        {statusKind === 'surplus' && surplus > 0 && (
          <V6Chip tone="green">{formatCurrency(surplus)} over</V6Chip>
        )}
        {statusKind !== 'unlocked' && lockState === 'confirmed' && <V6Chip tone="green">Confirmed</V6Chip>}
      </div>
      <div className="v6-hero-number-row v6-hero-number-row--tight">
        <strong className="v6-hero-number v6-hero-number--small cmm-amount">{formatCurrency(lockedDisplay)}</strong>
        <span className="v6-denominator">/ {Math.round(recommended).toLocaleString('en-GB')}</span>
      </div>
      {renderLockProgress()}
      <p className={getCaptionClassName()}>{getCaption()}</p>

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
              className="btn btn-sm v6-btn-lock-needed"
              onClick={() => setLockForm({ prefill: additionalNeeded, mode: 'additional' })}
            >
              Lock additional
            </button>
          )}
          {statusKind === 'surplus' && (
            <button
              className="btn btn-sm v6-btn-lock-free"
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
  const potNow = current?.potActual ?? 0;
  const potForecastEnd = current?.potAfter ?? 0;
  const spentPct = freeBudget > 0 ? Math.min(100, Math.round((spent / freeBudget) * 100)) : 0;
  const peak = engine.months.reduce((max, month) => Math.max(max, month.potAfter), 0);
  const finalPot = engine.months[engine.months.length - 1]?.potAfter ?? 0;

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
        <strong className="v6-hero-number v6-hero-number--small">{formatCurrency(Math.max(0, potNow))}</strong>
        {potNow < 0
          ? <p className="v6-trend v6-trend--warn">Savings debt: {formatSignedCurrency(potNow)}</p>
          : <p className="v6-trend">Peak forecast {formatCurrency(peak)}</p>
        }
        <div className="v6-mini-trace">
          <div>end of month · {formatSignedCurrency(potForecastEnd)}</div>
          <div>final month · {formatCurrency(Math.max(0, finalPot))}</div>
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

function AdditionalIncomeModal({
  initialMonth,
  visibleMonths,
  budget,
  onClose,
  onSave,
  onClear,
}: {
  initialMonth: Month;
  visibleMonths: Month[];
  budget: BudgetState;
  onClose: () => void;
  onSave: (month: Month, amount: number) => void;
  onClear: (month: Month) => void;
}) {
  const [month, setMonth] = useState(initialMonth);
  const [amountStr, setAmountStr] = useState(
    String(budget.additionalIncomeByMonth?.[initialMonth] ?? ''),
  );
  const amount = parseFloat(amountStr) || 0;
  const hasAdditional = (budget.additionalIncomeByMonth?.[month] ?? 0) > 0;
  const totalIncome = budget.income + amount;

  useEffect(() => {
    setAmountStr(
      budget.additionalIncomeByMonth?.[month] != null
        ? String(budget.additionalIncomeByMonth[month])
        : '',
    );
  }, [month, budget.additionalIncomeByMonth]);

  return (
    <div className="modal-overlay v6-planner-overlay" onClick={onClose}>
      <div className="modal v6-planner-modal" role="dialog" aria-modal="true" onClick={event => event.stopPropagation()}>
        <div className="v6-planner-header">
          <div>
            <p className="csv-wizard-kicker">Planning</p>
            <h2 className="modal-title">Additional income</h2>
            <p className="v6-card-caption">
              Add extra income on top of your usual {formatCurrency(budget.income)}/mo for one month only.
            </p>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="v6-planner-grid">
          <label className="v6-planner-field">
            <span>Month</span>
            <input
              className="input"
              type="month"
              min={visibleMonths[0]}
              max={visibleMonths[visibleMonths.length - 1]}
              value={month}
              onChange={event => setMonth(event.target.value)}
            />
          </label>
          <label className="v6-planner-field">
            <span>Additional amount</span>
            <div className="input-prefix">
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={amountStr}
                onChange={event => setAmountStr(event.target.value)}
                autoFocus
              />
            </div>
          </label>
        </div>
        {amount > 0 && (
          <div className="v6-planner-analysis">
            <p className="v6-card-caption">
              Total income that month: {formatCurrency(budget.income)} + {formatCurrency(amount)} = <strong>{formatCurrency(totalIncome)}</strong>
            </p>
          </div>
        )}
        <div className="csv-step-actions">
          {hasAdditional && (
            <button type="button" className="btn btn-ghost" onClick={() => onClear(month)}>
              Remove additional income
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={amount <= 0} onClick={() => onSave(month, amount)}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export type OverflowDecision =
  | { kind: 'increase'; overflow: number }
  | { kind: 'freeBudget'; overflow: number };

function EarlyPaymentModal({
  expense,
  paymentMonth,
  budget,
  currentMonth,
  mode,
  existingPayment,
  onClose,
  onConfirm,
  onRemove,
}: {
  expense: PlannedExpense;
  paymentMonth: Month;
  budget: BudgetState;
  currentMonth: Month;
  mode: 'add' | 'edit';
  existingPayment?: PlannedExpensePayment;
  onClose: () => void;
  onConfirm: (amount: number, overflowDecision?: OverflowDecision) => void;
  onRemove?: () => void;
}) {
  const [amountStr, setAmountStr] = useState(
    mode === 'edit' && existingPayment ? String(existingPayment.amount) : '',
  );
  const [confirmRemove, setConfirmRemove] = useState(false);
  const amount = parseFloat(amountStr) || 0;
  const engine = amount > 0 ? runEngine(budget, currentMonth) : null;
  const monthResult = engine?.months.find(m => m.month === paymentMonth);
  const potBalance = monthResult?.potAfter ?? 0;
  const shortfall = Math.max(0, amount - Math.max(0, potBalance));

  const payments = budget.plannedExpensePayments ?? [];
  const existingPaid = payments
    .filter(p => p.plannedExpenseId === expense.id && p.id !== existingPayment?.id)
    .reduce((sum, p) => sum + p.amount, 0);
  const remaining = expense.amount - existingPaid;
  const overflow = amount - remaining;
  const isOverflow = amount > 0 && overflow > 0;

  const newPlannedTotal = isOverflow ? existingPaid + amount : expense.amount;
  const draftPayment: PlannedExpensePayment = {
    id: 'overflow-preview',
    plannedExpenseId: expense.id,
    month: paymentMonth,
    amount,
    potDeduction: amount,
  };
  const paymentsForPreview = [
    ...payments.filter(p => p.id !== existingPayment?.id),
    draftPayment,
  ];
  const hypotheticalEngine = isOverflow
    ? runEngine(
        {
          ...budget,
          plannedExpenses: budget.plannedExpenses.map(e =>
            e.id === expense.id ? { ...e, amount: newPlannedTotal } : e
          ),
          plannedExpensePayments: paymentsForPreview,
        },
        currentMonth,
      )
    : null;
  const currentRate = engine?.months.find(m => m.month === currentMonth)?.setAsideRecommended ?? 0;
  const hypotheticalRate = hypotheticalEngine?.months.find(m => m.month === currentMonth)?.setAsideRecommended ?? 0;

  function handleRemoveClick() {
    if (!onRemove) return;
    setConfirmRemove(true);
  }

  function handleConfirmRemove() {
    onRemove?.();
    setConfirmRemove(false);
  }

  return (
    <div className="modal-overlay v6-planner-overlay" onClick={onClose}>
      <div className="modal v6-planner-modal" role="dialog" aria-modal="true" onClick={event => event.stopPropagation()}>
        <div className="v6-planner-header">
          <div>
            <p className="csv-wizard-kicker">Actualize</p>
            <h2 className="modal-title">Early payment · {expense.name}</h2>
            <p className="v6-card-caption">
              {mode === 'edit'
                ? `Update what you paid in ${formatMonth(paymentMonth)} toward this ${formatCurrency(expense.amount)} expense due in ${formatMonth(expense.targetMonth)}.`
                : `Record what you paid in ${formatMonth(paymentMonth)} toward this ${formatCurrency(expense.amount)} expense due in ${formatMonth(expense.targetMonth)}.`}
            </p>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="v6-planner-grid">
          <label className="v6-planner-field">
            <span>Month</span>
            <input className="input" type="month" value={paymentMonth} disabled />
          </label>
          <label className="v6-planner-field">
            <span>Amount paid</span>
            <div className="input-prefix">
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={amountStr}
                onChange={event => setAmountStr(event.target.value)}
                autoFocus
              />
            </div>
          </label>
        </div>
        {amount > 0 && !isOverflow && (
          <div className="v6-planner-analysis">
            <p className="v6-card-caption">
              {shortfall <= 0
                ? <>Fully covered by pot.</>
                : <>Your pot does not fully cover this yet. The shortfall of {formatCurrency(shortfall)} will be recovered via future set-asides (your rate stays the same).</>
              }
            </p>
          </div>
        )}
        {isOverflow && (
          <div className="v6-planner-analysis v6-overflow-warning">
            <p className="v6-card-caption v6-overflow-heading">
              This payment exceeds the planned amount by {formatCurrency(overflow)}.
            </p>
            <p className="v6-card-caption v6-overflow-detail">
              Planned: {formatCurrency(expense.amount)} · Already paid: {formatCurrency(existingPaid)} · Remaining: {formatCurrency(Math.max(0, remaining))}
            </p>
            {hypotheticalEngine && (
              <p className="v6-card-caption v6-overflow-detail">
                After this payment the trip is fully funded. Set-aside repays savings debt by {formatMonth(expense.targetMonth)}.
              </p>
            )}
          </div>
        )}
        <div className="csv-step-actions">
          {mode === 'edit' && onRemove && !confirmRemove && (
            <button type="button" className="btn btn-ghost v6-btn-danger-text" onClick={handleRemoveClick}>
              Remove payment
            </button>
          )}
          {mode === 'edit' && onRemove && confirmRemove && (
            <>
              <span className="v6-card-caption v6-remove-confirm-text">
                Remove {formatCurrency(existingPayment?.amount ?? amount)} early payment for {expense.name}?
              </span>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmRemove(false)}>
                Keep payment
              </button>
              <button type="button" className="btn btn-ghost v6-btn-danger-text" onClick={handleConfirmRemove}>
                Confirm remove
              </button>
            </>
          )}
          {!confirmRemove && !isOverflow && (
            <>
              <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={amount <= 0}
                onClick={() => onConfirm(amount)}
              >
                {mode === 'edit' ? 'Save changes' : 'Record payment'}
              </button>
            </>
          )}
          {!confirmRemove && isOverflow && (
            <div className="v6-overflow-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => onConfirm(amount, { kind: 'freeBudget', overflow })}
              >
                Pay {formatCurrency(overflow)} from free budget
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => onConfirm(amount, { kind: 'increase', overflow })}
              >
                Increase plan to {formatCurrency(newPlannedTotal)}
                {hypotheticalRate !== currentRate && (
                  <span className="v6-overflow-rate-hint">
                    {' '}(rate {formatCurrency(currentRate)} → {formatCurrency(hypotheticalRate)})
                  </span>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LedgerPlannedExpenseName({
  expense,
  onRename,
  onRemove,
}: {
  expense: PlannedExpense;
  onRename: (name: string) => void;
  onRemove: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(expense.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    if (!isEditing) {
      setDraft(expense.name);
    }
  }, [expense.name, isEditing]);

  useEffect(() => {
    if (!isEditing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isEditing]);

  function commit() {
    skipBlurCommitRef.current = true;
    const trimmed = draft.trim();
    if (trimmed && trimmed !== expense.name) {
      onRename(trimmed);
    } else {
      setDraft(expense.name);
    }
    setIsEditing(false);
  }

  function cancel() {
    skipBlurCommitRef.current = true;
    setDraft(expense.name);
    setIsEditing(false);
  }

  function handleBlur() {
    if (skipBlurCommitRef.current) {
      skipBlurCommitRef.current = false;
      return;
    }
    commit();
  }

  return (
    <div className="v6-ledger-planned-name">
      <span className="v6-ledger-dot" aria-hidden />
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          className="v6-ledger-planned-name-input"
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onBlur={handleBlur}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              cancel();
            }
          }}
          data-testid="ledger-planned-expense-name"
          aria-label="Planned expense name"
        />
      ) : (
        <button
          type="button"
          className="v6-ledger-planned-name-label"
          onClick={() => setIsEditing(true)}
          title="Click to rename"
        >
          {expense.name}
        </button>
      )}
      {expense.originalAmount != null && (
        <span className="v6-ledger-planned-overflow">
          +{formatCurrency(expense.amount - expense.originalAmount)} over plan ({formatCurrency(expense.originalAmount)})
        </span>
      )}
      <button
        type="button"
        className="v6-ledger-remove-btn"
        onClick={event => {
          event.stopPropagation();
          onRemove();
        }}
        aria-label={`Remove ${expense.name}`}
      >
        ×
      </button>
    </div>
  );
}

function formatLedgerCellAmount(value: number): string {
  if (value === 0) return '·';
  const prefix = value < 0 ? '-' : '';
  return `${prefix}${formatCurrency(Math.abs(value)).replace('€', '')}`;
}

function formatPotLedgerCellAmount(value: number): string {
  if (value === 0) return '0';
  const prefix = value < 0 ? '-' : '';
  return `${prefix}${formatCurrency(Math.abs(value)).replace('€', '')}`;
}

function HorizontalLedger({
  engine,
  budget,
  currentMonth,
  monthWidth,
  timelineWidth,
  updatePlannedExpense,
  removePlannedExpense,
  onPlanExpenseForMonth,
  setAdditionalIncomeForMonth,
  clearAdditionalIncomeForMonth,
  recordEarlyPayment,
  updateEarlyPayment,
  removeEarlyPayment,
}: {
  engine: EngineOutput;
  budget: BudgetState;
  currentMonth: Month;
  monthWidth: number;
  timelineWidth: number;
  updatePlannedExpense: (id: string, changes: Partial<Omit<PlannedExpense, 'id'>>) => void;
  removePlannedExpense: (id: string) => void;
  onPlanExpenseForMonth: (month: Month) => void;
  setAdditionalIncomeForMonth: (month: Month, amount: number) => void;
  clearAdditionalIncomeForMonth: (month: Month) => void;
  recordEarlyPayment: (plannedExpenseId: string, paymentMonth: Month, amount: number, overflowToFreeBudget?: number) => void;
  updateEarlyPayment: (paymentId: string, amount: number, overflowToFreeBudget?: number) => void;
  removeEarlyPayment: (paymentId: string) => void;
}) {
  const [editingExpense, setEditingExpense] = useState<{ expense: PlannedExpense; initialFocus: 'name' | 'amount' } | null>(null);
  const [incomeModalOpen, setIncomeModalOpen] = useState(false);
  const [incomeExpanded, setIncomeExpanded] = useState(true);
  const [setAsideExpanded, setSetAsideExpanded] = useState(false);
  const [earlyPayment, setEarlyPayment] = useState<{
    expense: PlannedExpense;
    paymentMonth: Month;
    paymentId?: string;
  } | null>(null);
  const months = engine.months;
  const sortedPlannedExpenses = [...budget.plannedExpenses].sort(comparePlannedExpensesByTime);
  const gridStyle = timelineGridColumns(months.length, monthWidth);
  const payments = budget.plannedExpensePayments ?? [];
  const showSetAsideSplit = months.some(month => month.setAsideRecovery > 0);
  const showAdditionalIncomeRow = months.some(
    month => (budget.additionalIncomeByMonth?.[month.month] ?? 0) > 0,
  );
  const incomeValues = months.map(month => month.monthlyIncome + month.incomeCarryover);
  const rows = [
    {
      group: 'Inflow',
      label: 'Income',
      values: incomeValues,
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
      label: 'Set-aside',
      values: months.map(month => -setAsideLedgerAmount(month, currentMonth)),
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
      values: months.map(month => Math.max(0, month.potAfter)),
      tone: 'ink',
    },
  ];

  const showSavingsDebt = months.some(month => month.potAfter < 0);

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
                  <div className="v6-ledger-group-label">
                    <span>{row.group}</span>
                    {row.group === 'Inflow' && (
                      <button
                        type="button"
                        className="v6-ledger-group-add-btn"
                        onClick={() => setIncomeModalOpen(true)}
                        aria-label="Add additional income for a month"
                        title="Add additional income for a month"
                      >
                        +
                      </button>
                    )}
                  </div>
                  {months.map(month => <div key={month.month} className={month.month === currentMonth ? 'is-current' : ''} />)}
                </div>
              )}
              <div className={`v6-ledger-row ${row.highlight ? 'is-highlight' : ''}`} style={gridStyle}>
                <div className={`v6-ledger-label v6-ledger-tone--${row.tone}`}>
                  {row.label === 'Income' && showAdditionalIncomeRow ? (
                    <button
                      type="button"
                      className="v6-ledger-section-toggle"
                      aria-expanded={incomeExpanded}
                      aria-controls="ledger-section-income"
                      data-testid="ledger-section-toggle-income"
                      onClick={() => setIncomeExpanded(expanded => !expanded)}
                    >
                      {incomeExpanded
                        ? <ChevronDown size={14} aria-hidden />
                        : <ChevronRight size={14} aria-hidden />}
                      <span>Income</span>
                    </button>
                  ) : row.label === 'Set-aside' && showSetAsideSplit ? (
                    <button
                      type="button"
                      className="v6-ledger-section-toggle"
                      aria-expanded={setAsideExpanded}
                      aria-controls="ledger-section-setaside"
                      onClick={() => setSetAsideExpanded(expanded => !expanded)}
                    >
                      {setAsideExpanded
                        ? <ChevronDown size={14} aria-hidden />
                        : <ChevronRight size={14} aria-hidden />}
                      <span>Set-aside</span>
                    </button>
                  ) : (
                    row.label
                  )}
                </div>
                {row.values.map((value, valueIndex) => {
                  const month = months[valueIndex];
                  return (
                    <div
                      key={month.month}
                      className={`v6-ledger-value v6-ledger-tone--${row.tone} ${month.month === currentMonth ? 'is-current' : ''} ${month.month < currentMonth ? 'is-past' : ''}`}
                    >
                      {row.label === 'Pot balance end'
                        ? formatPotLedgerCellAmount(value)
                        : formatLedgerCellAmount(value)}
                    </div>
                  );
                })}
              </div>
              {row.label === 'Income' && showAdditionalIncomeRow && incomeExpanded && (
                <div id="ledger-section-income">
                  <div className="v6-ledger-row v6-ledger-row--subitem" style={gridStyle}>
                    <div className="v6-ledger-subitem-label v6-ledger-tone--ink">
                      <span className="v6-ledger-dot" aria-hidden />
                      <span>Base income</span>
                    </div>
                    {months.map(month => (
                      <div
                        key={month.month}
                        className={`v6-ledger-value v6-ledger-tone--ink ${month.month === currentMonth ? 'is-current' : ''} ${month.month < currentMonth ? 'is-past' : ''}`}
                      >
                        {formatLedgerCellAmount(budget.income + month.incomeCarryover)}
                      </div>
                    ))}
                  </div>
                  <div className="v6-ledger-row v6-ledger-row--subitem" style={gridStyle}>
                    <div className="v6-ledger-subitem-label v6-ledger-tone--ink">
                      <span className="v6-ledger-dot" aria-hidden />
                      <span>Additional income</span>
                    </div>
                    {months.map(month => {
                      const additional = budget.additionalIncomeByMonth?.[month.month] ?? 0;
                      return (
                        <div
                          key={month.month}
                          className={`v6-ledger-value v6-ledger-tone--ink ${month.month === currentMonth ? 'is-current' : ''} ${month.month < currentMonth ? 'is-past' : ''} ${additional > 0 ? 'has-override' : ''}`}
                        >
                          {formatLedgerCellAmount(additional)}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {row.label === 'Pot balance end' && showSavingsDebt && (
                <div className="v6-ledger-row v6-ledger-row--subitem" style={gridStyle}>
                  <div className="v6-ledger-subitem-label v6-ledger-tone--critical">
                    <span className="v6-ledger-dot" aria-hidden />
                    <span>Savings debt</span>
                  </div>
                  {months.map(month => {
                    const signedDebt = Math.min(0, month.potAfter);
                    return (
                      <div
                        key={month.month}
                        className={`v6-ledger-value v6-ledger-tone--critical ${month.month === currentMonth ? 'is-current' : ''} ${month.month < currentMonth ? 'is-past' : ''}`}
                      >
                        {signedDebt < 0 ? formatPotLedgerCellAmount(signedDebt) : '·'}
                      </div>
                    );
                  })}
                </div>
              )}
              {row.label === 'Set-aside' && showSetAsideSplit && setAsideExpanded && (
                <div id="ledger-section-setaside">
                  <div className="v6-ledger-row v6-ledger-row--subitem" style={gridStyle}>
                    <div className="v6-ledger-subitem-label v6-ledger-tone--amber">
                      <span className="v6-ledger-dot" aria-hidden />
                      <span>Recovering advance</span>
                    </div>
                    {months.map(month => (
                      <div
                        key={month.month}
                        className={`v6-ledger-value v6-ledger-tone--amber ${month.month === currentMonth ? 'is-current' : ''} ${month.month < currentMonth ? 'is-past' : ''}`}
                      >
                        {formatLedgerCellAmount(-month.setAsideRecovery)}
                      </div>
                    ))}
                  </div>
                  <div className="v6-ledger-row v6-ledger-row--subitem" style={gridStyle}>
                    <div className="v6-ledger-subitem-label v6-ledger-tone--amber">
                      <span className="v6-ledger-dot" aria-hidden />
                      <span>Toward planned expenses</span>
                    </div>
                    {months.map(month => (
                      <div
                        key={month.month}
                        className={`v6-ledger-value v6-ledger-tone--amber ${month.month === currentMonth ? 'is-current' : ''} ${month.month < currentMonth ? 'is-past' : ''}`}
                      >
                        {formatLedgerCellAmount(-month.setAsideFunding)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {sortedPlannedExpenses.length > 0 && (
          <>
            <div className="v6-ledger-row v6-ledger-group" style={gridStyle}>
              <div>Planned expenses</div>
              {months.map(month => <div key={month.month} className={month.month === currentMonth ? 'is-current' : ''} />)}
            </div>
            {sortedPlannedExpenses.map(expense => {
              return (
              <div key={expense.id} className="v6-ledger-row" style={gridStyle}>
                <LedgerPlannedExpenseName
                  expense={expense}
                  onRename={name => updatePlannedExpense(expense.id, { name })}
                  onRemove={() => removePlannedExpense(expense.id)}
                />
                {months.map(month => {
                  const cell = plannedExpenseLedgerCell(expense, month.month, payments);
                  const canRecordEarly =
                    cell.kind === 'empty' &&
                    month.month < expense.targetMonth &&
                    month.month <= currentMonth;
                  return (
                  <div
                    key={month.month}
                    className={`v6-ledger-value v6-ledger-tone--amber ${month.month === currentMonth ? 'is-current' : ''} ${month.month < currentMonth ? 'is-past' : ''}`}
                  >
                    {cell.kind === 'early-payment' ? (
                      <button
                        type="button"
                        className="v6-ledger-planned-cell-btn v6-ledger-planned-early-btn"
                        onClick={() => setEarlyPayment({
                          expense,
                          paymentMonth: month.month,
                          paymentId: cell.paymentId,
                        })}
                        aria-label={`Edit early payment for ${expense.name} in ${formatMonth(month.month)}`}
                        title={`Edit early payment in ${formatMonth(month.month)}`}
                      >
                        -{formatCurrency(cell.amount).replace('€', '')}
                      </button>
                    ) : cell.kind === 'target' ? (
                      <button
                        type="button"
                        className="v6-ledger-planned-cell-btn"
                        onClick={() => setEditingExpense({ expense, initialFocus: 'amount' })}
                        onDoubleClick={() => setEditingExpense({ expense, initialFocus: 'amount' })}
                        aria-label={`Edit amount for ${expense.name} in ${formatMonth(month.month)}`}
                        title={`Planned amount due in ${formatMonth(month.month)}`}
                      >
                        -{formatCurrency(cell.amount).replace('€', '')}
                      </button>
                    ) : canRecordEarly ? (
                      <button
                        type="button"
                        className="v6-ledger-planned-cell-btn v6-ledger-planned-cell-btn--add"
                        onClick={() => setEarlyPayment({ expense, paymentMonth: month.month })}
                        aria-label={`Record early payment for ${expense.name} in ${formatMonth(month.month)}`}
                        title={`Record early payment in ${formatMonth(month.month)}`}
                      >
                        +
                      </button>
                    ) : (
                      '·'
                    )}
                  </div>
                  );
                })}
              </div>
              );
            })}
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

      {incomeModalOpen && (
        <AdditionalIncomeModal
          initialMonth={currentMonth}
          visibleMonths={months.map(m => m.month)}
          budget={budget}
          onClose={() => setIncomeModalOpen(false)}
          onSave={(month, amount) => {
            setAdditionalIncomeForMonth(month, amount);
            setIncomeModalOpen(false);
          }}
          onClear={month => {
            clearAdditionalIncomeForMonth(month);
            setIncomeModalOpen(false);
          }}
        />
      )}

      {earlyPayment && (
        <EarlyPaymentModal
          expense={earlyPayment.expense}
          paymentMonth={earlyPayment.paymentMonth}
          budget={budget}
          currentMonth={currentMonth}
          mode={earlyPayment.paymentId ? 'edit' : 'add'}
          existingPayment={
            earlyPayment.paymentId
              ? payments.find(p => p.id === earlyPayment.paymentId)
              : undefined
          }
          onClose={() => setEarlyPayment(null)}
          onConfirm={(amount, overflowDecision) => {
            if (overflowDecision?.kind === 'increase') {
              const payments = budget.plannedExpensePayments ?? [];
              const otherPaid = payments
                .filter(p => p.plannedExpenseId === earlyPayment.expense.id
                  && p.id !== earlyPayment.paymentId)
                .reduce((sum, p) => sum + p.amount, 0);
              updatePlannedExpense(earlyPayment.expense.id, {
                amount: otherPaid + amount,
                ...(earlyPayment.expense.originalAmount == null
                  ? { originalAmount: earlyPayment.expense.amount }
                  : {}),
              });
            }

            const freeBudgetOverflow = overflowDecision?.kind === 'freeBudget'
              ? overflowDecision.overflow
              : undefined;

            if (earlyPayment.paymentId) {
              updateEarlyPayment(earlyPayment.paymentId, amount, freeBudgetOverflow);
            } else {
              recordEarlyPayment(
                earlyPayment.expense.id,
                earlyPayment.paymentMonth,
                amount,
                freeBudgetOverflow,
              );
            }
            setEarlyPayment(null);
          }}
          onRemove={
            earlyPayment.paymentId
              ? () => {
                  removeEarlyPayment(earlyPayment.paymentId!);
                  setEarlyPayment(null);
                }
              : undefined
          }
        />
      )}

      {editingExpense && (
        <EditPlannedExpenseModal
          expense={editingExpense.expense}
          initialFocus={editingExpense.initialFocus}
          budget={budget}
          engine={engine}
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
  budget,
  engine,
  currentMonth,
  onClose,
  onSave,
}: {
  expense: PlannedExpense;
  initialFocus: 'name' | 'amount';
  budget: BudgetState;
  engine: EngineOutput;
  currentMonth: Month;
  onClose: () => void;
  onSave: (changes: Partial<Omit<PlannedExpense, 'id'>>) => void;
}) {
  const amountInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(expense.name);
  const [amountStr, setAmountStr] = useState(String(expense.amount));
  const [targetMonth, setTargetMonth] = useState(expense.targetMonth);
  const [pendingDecision, setPendingDecision] = useState<Omit<PlannedExpense, 'id'> | null>(null);
  const minTargetMonth = expense.targetMonth < currentMonth ? expense.targetMonth : currentMonth;
  const amount = parseFloat(amountStr) || 0;
  const canSave = name.trim().length > 0 && amount > 0 && targetMonth >= minTargetMonth;

  useEffect(() => {
    if (initialFocus !== 'amount') return;
    amountInputRef.current?.focus();
    amountInputRef.current?.select();
  }, [initialFocus]);

  function buildDraft(): Omit<PlannedExpense, 'id'> {
    return {
      name: name.trim(),
      amount,
      targetMonth,
      category: expense.category,
      confidence: expense.confidence,
      ...(expense.startFromMonth ? { startFromMonth: expense.startFromMonth } : {}),
    };
  }

  function handleSave() {
    if (!canSave) return;
    const draft = buildDraft();
    if (shouldAskPlannedExpenseFundingTiming(budget, engine, draft, currentMonth, {
      replaceExpenseId: expense.id,
    })) {
      setPendingDecision(draft);
      return;
    }
    onSave({
      name: draft.name,
      amount: draft.amount,
      targetMonth: draft.targetMonth,
    });
  }

  if (pendingDecision) {
    return (
      <PlannedExpenseFundingModal
        draft={pendingDecision}
        budget={budget}
        engine={engine}
        currentMonth={currentMonth}
        replaceExpenseId={expense.id}
        onClose={() => setPendingDecision(null)}
        onConfirm={confirmed => {
          onSave({
            name: confirmed.name,
            amount: confirmed.amount,
            targetMonth: confirmed.targetMonth,
            ...(confirmed.startFromMonth
              ? { startFromMonth: confirmed.startFromMonth }
              : { resetStartFromMonth: true }),
          });
          setPendingDecision(null);
        }}
      />
    );
  }

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

  function resetAndClose() {
    setPendingDecision(null);
    onClose();
  }

  function handleConfirm() {
    if (!canSave) return;
    const expense = buildExpense();
    if (shouldAskPlannedExpenseFundingTiming(budget, engine, expense, currentMonth)) {
      setPendingDecision(expense);
      return;
    }
    onConfirm(expense);
  }

  if (pendingDecision) {
    return (
      <PlannedExpenseFundingModal
        draft={pendingDecision}
        budget={budget}
        engine={engine}
        currentMonth={currentMonth}
        onClose={resetAndClose}
        onConfirm={expense => {
          setPendingDecision(null);
          onConfirm(expense);
        }}
      />
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
  setAdditionalIncomeForMonth,
  clearAdditionalIncomeForMonth,
  recordEarlyPayment,
  updateEarlyPayment,
  removeEarlyPayment,
  lockIn,
  freeUp,
}: Props) {
  const current = getCurrentResult(engine, currentMonth);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [plannerInitialMonth, setPlannerInitialMonth] = useState<Month>(currentMonth);
  const monthCount = engine.months.length;
  const { containerRef: timelineContainerRef, monthWidth, timelineWidth } = useTimelineMonthWidth(monthCount);
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
        <div className="v6-dashboard-layout">
        <div className="v6-dashboard-sidebar">
          <HeroCards
            engine={engine}
            budget={budget}
            currentMonth={currentMonth}
            lockIn={lockIn}
            freeUp={freeUp}
          />

          <section className="v6-under-hood-section" aria-label="Algorithm trace">
            <AlgoTrace engine={engine} budget={budget} current={current} />
          </section>
        </div>

        <section ref={timelineContainerRef} className="v6-card v6-timeline-card">
          <div className="v6-section-header">
            <div>
              <h2>Timeline · next {engine.months.length} months</h2>
              <p>Graph and ledger share the same month columns, so each planned hit lines up with its month.</p>
            </div>
            <div className="v6-legend">
              <span><i className="v6-legend-line" />Pot</span>
              <span><i className="v6-legend-line v6-legend-line--debt" />Savings debt</span>
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
              <PotTrajectoryChart engine={engine} currentMonth={currentMonth} monthWidth={monthWidth} />
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
                monthWidth={monthWidth}
                timelineWidth={timelineWidth}
                updatePlannedExpense={updatePlannedExpense}
                removePlannedExpense={removePlannedExpense}
                onPlanExpenseForMonth={openPlanner}
                setAdditionalIncomeForMonth={setAdditionalIncomeForMonth}
                clearAdditionalIncomeForMonth={clearAdditionalIncomeForMonth}
                recordEarlyPayment={recordEarlyPayment}
                updateEarlyPayment={updateEarlyPayment}
                removeEarlyPayment={removeEarlyPayment}
              />
            </div>
          </div>
        </section>
        </div>
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
