/**
 * Next engagement code, ENG-YYYYMM-NNNN. Takes the highest number already used
 * in the month (not a count), so deleting an engagement can never cause a
 * code to be handed out twice.
 */
import { query } from "@/lib/db";

type Runner = (sql: string, params: unknown[]) => Promise<{ rows: { max_num: number | null }[] }>;

export async function nextEngagementCode(run?: Runner, when: Date = new Date()): Promise<string> {
  const ym = `${when.getFullYear()}${String(when.getMonth() + 1).padStart(2, "0")}`;
  const params = [`^ENG-${ym}-([0-9]+)$`, `^ENG-${ym}-[0-9]+$`];
  const sql = `SELECT MAX(substring(engagement_code FROM $1)::int) AS max_num
                 FROM engagements WHERE engagement_code ~ $2`;
  const rows = run ? (await run(sql, params)).rows : await query<{ max_num: number | null }>(sql, params);
  const next = (rows[0]?.max_num ?? 0) + 1;
  return `ENG-${ym}-${String(next).padStart(4, "0")}`;
}
