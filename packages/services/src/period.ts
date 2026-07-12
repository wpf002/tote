const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface Period {
  readonly start: Date;
  readonly end: Date; // exclusive
}

/** The calendar month containing `date`, as a `[start, nextMonthStart)` period. */
export function monthPeriod(year: number, month1to12: number): Period {
  const start = new Date(Date.UTC(year, month1to12 - 1, 1));
  const end = new Date(Date.UTC(year, month1to12, 1));
  return { start, end };
}

/** Stable idempotency key for a monthly run, e.g. "2026-06". */
export function runKeyFor(period: Period): string {
  const y = period.start.getUTCFullYear();
  const m = String(period.start.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** Whole days in [start, end). */
export function daysInPeriod(period: Period): number {
  return Math.max(0, Math.round((period.end.getTime() - period.start.getTime()) / MS_PER_DAY));
}

/** Whole days that [from, to?) overlaps [period.start, period.end). */
export function overlapDays(period: Period, from: Date, to: Date | null | undefined): number {
  const start = Math.max(period.start.getTime(), from.getTime());
  const end = Math.min(period.end.getTime(), to ? to.getTime() : period.end.getTime());
  return Math.max(0, Math.round((end - start) / MS_PER_DAY));
}
