/**
 * The current period of a recurring service (FR-37, FR-45).
 *
 * Periods follow the client's own financial year, which ends in the month stored on the
 * client (clients.financial_year_end_month). A client with none set uses March, the Indian
 * financial year (April to March). A client whose year ends in December gets January to
 * December years, and so on. The firm sets this per client, for Indian and international
 * clients alike (decided 16 Oct 2026, D3). Services that don't recur have no period.
 */
function iso(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
}

function lastDay(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Move a (year, month) pair by n months. Month is 1 to 12. */
function shift(y: number, m: number, n: number): { y: number; m: number } {
  const t = m - 1 + n;
  return { y: y + Math.floor(t / 12), m: ((t % 12) + 12) % 12 + 1 };
}

export function currentPeriod(
  pattern: string | null,
  todayIso: string,
  fyEndMonth?: number | null,
): { start: string; end: string } | null {
  const p = (pattern ?? "").toLowerCase();
  const [y, m] = todayIso.split("-").map(Number);

  if (p.includes("month")) {
    return { start: iso(y, m, 1), end: iso(y, m, lastDay(y, m)) };
  }

  // The month the client's financial year starts in: the month after it ends.
  const endMonth = Number.isInteger(fyEndMonth) && (fyEndMonth as number) >= 1 && (fyEndMonth as number) <= 12 ? (fyEndMonth as number) : 3;
  const startMonth = (endMonth % 12) + 1;
  const fyStartYear = m >= startMonth ? y : y - 1;
  const sinceStart = (m - startMonth + 12) % 12; // months into the client's year, 0 to 11

  // A block of `months` months that begins `offset` months after the year starts.
  const block = (offset: number, months: number) => {
    const s = shift(fyStartYear, startMonth, offset);
    const e = shift(s.y, s.m, months - 1);
    return { start: iso(s.y, s.m, 1), end: iso(e.y, e.m, lastDay(e.y, e.m)) };
  };

  if (p.includes("quarter")) return block(Math.floor(sinceStart / 3) * 3, 3);
  if (p.includes("half")) return block(Math.floor(sinceStart / 6) * 6, 6);
  if (p.includes("annu") || p.includes("year")) return block(0, 12);
  return null;
}
