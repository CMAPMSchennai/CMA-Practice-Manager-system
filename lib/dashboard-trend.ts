/**
 * Six months of firm figures ending at the chosen month, for the dashboard charts
 * (added feature outside the PDF). It reuses the same calculation as the monthly
 * overview, so the numbers match the tiles exactly.
 */
import { buildOverview } from "@/lib/dashboard-overview";
import type { AccessScope } from "@/lib/access-scope";

export interface TrendMonth {
  period: string;
  income: number;
  expenses: number;
  net_profit: number;
  collected: number;
  closing_cash: number;
  receivables: number;
}

function monthsEndingAt(period: string, count: number): string[] {
  const [y, m] = period.split("-").map(Number);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export async function buildTrend(period: string, scope: AccessScope, count = 6): Promise<TrendMonth[]> {
  const periods = monthsEndingAt(period, count);
  const overviews = await Promise.all(periods.map((p) => buildOverview(p, { finance: true, team: false, scope })));
  return overviews.map((o, i) => {
    const f = o.finance;
    return {
      period: periods[i],
      income: f?.income ?? 0,
      expenses: f?.expenses ?? 0,
      net_profit: f?.net_profit ?? 0,
      collected: f?.collected ?? 0,
      closing_cash: f?.cash.closing ?? 0,
      receivables: f?.receivables.total ?? 0,
    };
  });
}
