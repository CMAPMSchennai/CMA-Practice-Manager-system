/**
 * Statutory due-date engine (FR-65, FR-66).
 *
 * Generates each client's obligations from the statutory calendar rules, the
 * client's services and the client's constitution (entity type), with no entry
 * per client. Rules carry their calendar in due_date_logic.schedule.
 *
 * Period labels, by rule frequency:
 *   monthly       2026-10      the month the obligation covers; due the next month
 *   quarterly     Q2-2026      financial-year quarter (Q1 = Apr-Jun); 2026 = FY 2026-27
 *   half_yearly   H1-2026      H1 = Apr-Sep, H2 = Oct-Mar
 *   annually      FY2026-27    due in the calendar year the financial year ends
 */

export type PeriodKind = "monthly" | "quarterly" | "half_yearly" | "annually";

export interface ParsedPeriod {
  kind: PeriodKind;
  year: number;
  month?: number;
  n?: number;
}

export const PERIOD_HELP =
  "Use 2026-10 for a month, Q2-2026 for a financial-year quarter (Q1 is Apr-Jun, 2026 means FY 2026-27), H1-2026 for a half-year, or FY2026-27 for a year.";

export function parsePeriod(label: string): ParsedPeriod | null {
  const t = label.trim();
  let m = t.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    const month = Number(m[2]);
    return month >= 1 && month <= 12 ? { kind: "monthly", year: Number(m[1]), month } : null;
  }
  m = t.match(/^Q([1-4])-(\d{4})$/);
  if (m) return { kind: "quarterly", year: Number(m[2]), n: Number(m[1]) };
  m = t.match(/^H([12])-(\d{4})$/);
  if (m) return { kind: "half_yearly", year: Number(m[2]), n: Number(m[1]) };
  m = t.match(/^FY(\d{4})-(\d{2})$/);
  if (m) return { kind: "annually", year: Number(m[1]) };
  return null;
}

export interface CalendarRule {
  id: string;
  name: string;
  form_or_return: string | null;
  frequency: string;
  due_day_of_month: number | null;
  due_date_logic: { schedule?: { month?: number; day: number; note?: string }[] } | null;
  applicable_entity_types: string[] | null;
  applicable_service_type_id: string | null;
}

function iso(year: number, month: number, day: number): string {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const d = Math.min(Math.max(day, 1), last);
  return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Due date for one rule and period, or null when the rule doesn't run on that kind of period. */
export function computeDueDate(rule: CalendarRule, period: ParsedPeriod): string | null {
  if (rule.frequency !== period.kind) return null;
  const schedule = rule.due_date_logic?.schedule ?? [];

  if (period.kind === "monthly") {
    const month = period.month as number;
    const note = schedule[0]?.note ?? "";
    // TDS / TCS: March deductions are due on 30 April.
    if (month === 3 && /March deductions due 30 April/i.test(note)) return iso(period.year, 4, 30);
    const day = rule.due_day_of_month ?? schedule[0]?.day ?? 15;
    return month === 12 ? iso(period.year + 1, 1, day) : iso(period.year, month + 1, day);
  }

  if (period.kind === "quarterly") {
    if (schedule.length < 4) return null;
    let year = period.year;
    let prev = -1;
    const dates: string[] = [];
    for (const e of schedule) {
      if (!e.month) return null;
      const key = e.month * 100 + e.day;
      if (prev >= 0 && key < prev) year += 1; // the calendar rolls into the next year
      prev = key;
      dates.push(iso(year, e.month, e.day));
    }
    return dates[(period.n as number) - 1] ?? null;
  }

  if (period.kind === "half_yearly") {
    if (schedule.length < 2 || !schedule[0].month || !schedule[1].month) return null;
    // H1 (Apr-Sep) is filed in the second slot of the year; H2 (Oct-Mar) in the first slot of the next.
    return period.n === 1
      ? iso(period.year, schedule[1].month, schedule[1].day)
      : iso(period.year + 1, schedule[0].month, schedule[0].day);
  }

  // annually: the first slot, in the calendar year the financial year ends
  const first = schedule[0];
  if (!first?.month) return null;
  return iso(period.year + 1, first.month, first.day);
}

export interface ClientForEngine {
  id: string;
  partner_in_charge_id: string | null;
  entity_type_code: string | null;
}

export type Applicability = "yes" | "service" | "entity_type" | "period";

/** Does this rule apply to this client for this period? */
export function ruleApplies(
  rule: CalendarRule,
  client: ClientForEngine,
  clientServiceIds: Set<string>,
  period: ParsedPeriod,
): Applicability {
  if (rule.frequency !== period.kind) return "period";
  if (rule.applicable_service_type_id && !clientServiceIds.has(rule.applicable_service_type_id)) return "service";
  const types = Array.isArray(rule.applicable_entity_types) ? rule.applicable_entity_types : [];
  if (types.length > 0 && !(client.entity_type_code && types.includes(client.entity_type_code))) return "entity_type";
  return "yes";
}
