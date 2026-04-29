const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const USD_WHOLE = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const NUMBER = new Intl.NumberFormat("en-US");

const DATE_SHORT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const DATE_LONG = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

const TIME = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

export function formatCurrency(value: number, opts: { whole?: boolean } = {}): string {
  if (!Number.isFinite(value)) return "$0";
  return opts.whole ? USD_WHOLE.format(value) : USD.format(value);
}

export function formatCents(cents: number, opts: { whole?: boolean; signed?: boolean } = {}): string {
  if (!Number.isFinite(cents)) return "$0";
  const dollars = cents / 100;
  const formatted = formatCurrency(Math.abs(dollars), { whole: opts.whole });
  if (!opts.signed) return cents < 0 ? `-${formatted}` : formatted;
  if (cents > 0) return `+${formatted}`;
  if (cents < 0) return `-${formatted}`;
  return formatted;
}

/**
 * Normalize an amount (cents OR major units) to integer cents.
 *
 * Teller returns transaction amounts as dollar-strings (`"-12.34"`); Plaid
 * returns positive numbers in major units; some internal endpoints return
 * cents. The `source` discriminator picks the right interpretation so callers
 * never have to remember the per-provider convention.
 */
export function toCents(
  value: number | string | null | undefined,
  source: "cents" | "dollars",
): number {
  if (value === null || value === undefined || value === "") return 0;
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return 0;
  if (source === "cents") return Math.round(num);
  return Math.round(num * 100);
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return NUMBER.format(value);
}

export function formatPercent(value: number, fractionDigits = 0): string {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toFixed(fractionDigits)}%`;
}

function toDate(input: string | Date): Date | null {
  const d = typeof input === "string" ? new Date(input) : input;
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(input: string | Date, variant: "short" | "long" = "short"): string {
  const d = toDate(input);
  if (!d) return "";
  return (variant === "long" ? DATE_LONG : DATE_SHORT).format(d);
}

export function formatTime(input: string | Date): string {
  const d = toDate(input);
  if (!d) return "";
  return TIME.format(d);
}

export function formatRelativeDays(input: string | Date, now: Date = new Date()): string {
  const d = toDate(input);
  if (!d) return "";
  const diffMs = d.getTime() - now.getTime();
  const days = Math.round(diffMs / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days > 0) return `In ${days} days`;
  return `${Math.abs(days)} days ago`;
}
