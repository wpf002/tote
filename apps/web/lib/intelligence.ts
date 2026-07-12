import "server-only";

/**
 * Client for the Python intelligence service (Phase 7). All calls degrade
 * gracefully: if the service is down, they return null and the UI shows an
 * offline notice rather than erroring.
 */
const BASE = process.env.INTELLIGENCE_URL ?? "http://localhost:8000";

export interface ForecastSummary {
  opening: number;
  closing: number;
  low: number;
  low_date: string | null;
  total_out: number;
  total_in: number;
}

export interface HorseRoi {
  horse_id: string;
  name: string;
  expense_cents: number;
  income_cents: number;
  net_cents: number;
  starts: number;
  wins: number;
  cost_per_start_cents: number | null;
  roi_pct: number | null;
}

export interface ReceiptDraft {
  vendor: string | null;
  amount_cents: number | null;
  category: string | null;
  date: string | null;
  confidence: number;
}

async function get<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function getForecast(
  org: string,
  entity: string,
  days = 90,
): Promise<{ summary: ForecastSummary } | null> {
  return get(`/forecast/cashflow?org=${org}&entity=${entity}&days=${days}`);
}

export async function getHorseRoi(org: string, entity: string): Promise<{ horses: HorseRoi[] } | null> {
  return get(`/analytics/horse-roi?org=${org}&entity=${entity}`);
}

export async function draftReceipt(text: string): Promise<ReceiptDraft | null> {
  try {
    const res = await fetch(`${BASE}/ocr/receipt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as ReceiptDraft;
  } catch {
    return null;
  }
}
