/**
 * Two-step verification of documents (added feature outside the PDF, A4).
 *
 * Step one: the Manager on the job's Team checks the file ("checked").
 * Step two: a Managing Partner verifies it (this is the PDF's verified_by /
 * verified_on, and the moment the file counts as filed in the filing cabinet).
 * Optional: a Managing Partner asks a different Managing Partner for a peer review.
 * When no Manager is on the Team, or the paper is not a job file, the Managing
 * Partner may verify directly.
 */
import { query } from "@/lib/db";
import type { DocMeta } from "@/lib/document-meta";

export type DocAction = "check" | "uncheck" | "verify" | "unverify" | "request_peer" | "peer_review";

const STEP_TWO_ROLES = ["managing_partner", "admin"];

export function isStepTwoRole(role: string): boolean {
  return STEP_TWO_ROLES.includes(role);
}

/** For each job: the user ids of Managers on its Team. */
export async function teamManagers(engagementIds: string[]): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (engagementIds.length === 0) return out;
  const rows = await query<{ engagement_id: string; user_id: string }>(
    `SELECT et.engagement_id, et.user_id
       FROM engagement_team et
       JOIN users u ON u.id = et.user_id
       JOIN roles r ON r.id = u.role_id
      WHERE r.name = 'manager' AND u.is_active = true AND et.engagement_id = ANY($1::uuid[])`,
    [engagementIds],
  );
  for (const r of rows) {
    const s = out.get(r.engagement_id) ?? new Set<string>();
    s.add(r.user_id);
    out.set(r.engagement_id, s);
  }
  return out;
}

/** What this person may do to this document right now. */
export function actionsFor(
  userId: string,
  role: string,
  doc: { owner_type: string; owner_id: string },
  meta: DocMeta,
  managers: Map<string, Set<string>>,
): DocAction[] {
  const out: DocAction[] = [];
  const teamSet = doc.owner_type === "engagement" ? managers.get(doc.owner_id) : undefined;
  const managerAssigned = !!teamSet && teamSet.size > 0;
  const isMyJobManager = role === "manager" && !!teamSet?.has(userId);
  const stepTwo = isStepTwoRole(role);
  const verified = !!meta.verified_at;
  const checked = !!meta.checked_at;

  if (verified) {
    if (stepTwo) {
      out.push("unverify");
      if (!meta.peer_id && role === "managing_partner") out.push("request_peer");
    }
    if (meta.peer_id === userId && !meta.peer_done_at) out.push("peer_review");
    return out;
  }
  if (checked) {
    if (stepTwo) out.push("verify", "uncheck");
    else if (isMyJobManager && meta.checked_by === userId) out.push("uncheck");
    return out;
  }
  if (isMyJobManager) out.push("check");
  if (stepTwo && !managerAssigned) out.push("verify");
  return out;
}

/** Bell notification for each recipient (skips empty lists). */
export async function notifyUsers(
  recipients: string[],
  subject: string,
  body: string,
  data: Record<string, unknown>,
): Promise<void> {
  for (const rid of new Set(recipients)) {
    await query(
      `INSERT INTO notifications (channel, recipient_id, template, subject, body, data, status)
       VALUES ('in_app', $1, 'document_check', $2, $3, $4::jsonb, 'delivered')`,
      [rid, subject, body, JSON.stringify(data)],
    );
  }
}

export async function managingPartnerIds(): Promise<string[]> {
  return (
    await query<{ id: string }>(
      `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'managing_partner' AND u.is_active = true`,
    )
  ).map((r) => r.id);
}
