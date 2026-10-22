/**
 * Live activity feed for the Managing Partner dashboard (added feature outside
 * the PDF). It turns recent audit-trail entries about the firm's work into plain
 * sentences: who did what, newest first. Sign-ins, permission changes and other
 * system entries are left out. Read-only.
 */
import { query } from "@/lib/db";

export type ActivityKind = "task" | "done" | "engagement" | "invoice" | "receipt" | "document" | "client" | "review";

export interface ActivityEvent {
  id: string;
  at: string;
  who: string;
  kind: ActivityKind;
  text: string;
  href: string | null;
}

const TASK_WORDS: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  under_review: "Under review",
  returned: "Returned",
  blocked: "Blocked",
  completed: "Completed",
};
const ENGAGEMENT_WORDS: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  cancelled: "Cancelled",
};
const INVOICE_WORDS: Record<string, string> = {
  issued: "issued",
  sent: "sent",
  paid: "paid",
  partially_paid: "part paid",
  overdue: "overdue",
  cancelled: "cancelled",
  written_off: "written off",
};

interface Row {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  field_changes: Record<string, { before?: unknown; after?: unknown }> | null;
  created_at: string;
  who: string | null;
  task_title: string | null;
  task_engagement_id: string | null;
  eng_code: string | null;
  client_name: string | null;
  doc_name: string | null;
}

function after(fc: Row["field_changes"], key: string): string | null {
  const v = fc?.[key]?.after;
  return typeof v === "string" ? v : null;
}

function describe(r: Row): { kind: ActivityKind; text: string; href: string | null } | null {
  const forClient = r.client_name ? ` for ${r.client_name}` : "";
  const code = r.eng_code ?? "an engagement";
  switch (`${r.entity_type}:${r.action}`) {
    case "task_instance:update": {
      const st = after(r.field_changes, "status");
      const title = r.task_title ? `“${r.task_title}”` : "a task";
      const href = r.task_engagement_id ? `/dashboard/engagements/${r.task_engagement_id}?task=${r.entity_id}` : null;
      if (!st) return { kind: "task", text: `updated ${title}${forClient}`, href };
      return { kind: st === "completed" ? "done" : st === "under_review" ? "review" : "task", text: `moved ${title} to ${TASK_WORDS[st] ?? st}${forClient}`, href };
    }
    case "task_instance:bulk_assign":
      return { kind: "task", text: `assigned tasks on ${code}${forClient}`, href: null };
    case "engagement:create_engagement":
      return { kind: "engagement", text: `created engagement ${code}${forClient}`, href: `/dashboard/engagements/${r.entity_id}` };
    case "engagement:status_change": {
      const st = after(r.field_changes, "status");
      return { kind: "engagement", text: st ? `changed ${code} to ${ENGAGEMENT_WORDS[st] ?? st}${forClient}` : `changed the status of ${code}${forClient}`, href: `/dashboard/engagements/${r.entity_id}` };
    }
    case "invoice:create_invoice":
      return { kind: "invoice", text: "raised an invoice", href: `/dashboard/billing/invoices/${r.entity_id}` };
    case "invoice:status_change": {
      const st = after(r.field_changes, "status");
      return { kind: "invoice", text: st ? `marked an invoice ${INVOICE_WORDS[st] ?? st}` : "changed an invoice's status", href: `/dashboard/billing/invoices/${r.entity_id}` };
    }
    case "receipt:record_receipt":
      return { kind: "receipt", text: "recorded a receipt", href: null };
    case "expense:create_expense":
      return { kind: "receipt", text: "recorded an expense", href: null };
    case "document:upload_document": {
      const created = r.field_changes?.created?.after as { file_name?: string } | undefined;
      return { kind: "document", text: `uploaded ${created?.file_name ?? "a document"}`, href: null };
    }
    case "document:verify_document":
      return { kind: "done", text: `verified ${r.doc_name ?? "a document"}`, href: null };
    case "document:delete_document":
      return { kind: "document", text: `deleted ${r.doc_name ?? "a document"}`, href: null };
    case "clients:activate":
      return { kind: "client", text: `activated ${r.client_name ?? "a client"}`, href: `/dashboard/clients/${r.entity_id}` };
    case "clients:conflict_check":
      return { kind: "client", text: `ran the conflict check for ${r.client_name ?? "a client"}`, href: `/dashboard/clients/${r.entity_id}` };
    case "clients:client_form_submitted":
      return { kind: "client", text: `submitted the onboarding form for ${r.client_name ?? "a client"}`, href: `/dashboard/clients/${r.entity_id}` };
    case "delay_reason_disposition:disposition_accept":
      return { kind: "review", text: "accepted a delay reason", href: null };
    case "delay_reason_disposition:disposition_counsel":
      return { kind: "review", text: "counselled a team member on a delay", href: null };
    default:
      return null;
  }
}

export async function buildActivity(limit = 25): Promise<ActivityEvent[]> {
  const rows = await query<Row>(
    `SELECT a.id, a.action, a.entity_type, a.entity_id, a.field_changes, a.created_at,
            COALESCE(NULLIF(trim(u.name), ''), u.email) AS who,
            ti.title AS task_title, ti.engagement_id AS task_engagement_id,
            e.engagement_code AS eng_code, c.name AS client_name, d.file_name AS doc_name
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       LEFT JOIN task_instances ti ON a.entity_type = 'task_instance' AND ti.id = a.entity_id
       LEFT JOIN engagements e ON (a.entity_type = 'engagement' AND e.id = a.entity_id)
                               OR (a.entity_type = 'task_instance' AND e.id = ti.engagement_id)
       LEFT JOIN clients c ON (a.entity_type = 'clients' AND c.id = a.entity_id)
                           OR (a.entity_type IN ('engagement', 'task_instance') AND c.id = e.client_id)
       LEFT JOIN documents d ON a.entity_type = 'document' AND d.id = a.entity_id
      WHERE (a.entity_type = 'task_instance' AND a.action IN ('update', 'bulk_assign'))
         OR (a.entity_type = 'engagement' AND a.action IN ('create_engagement', 'status_change'))
         OR (a.entity_type = 'invoice' AND a.action IN ('create_invoice', 'status_change'))
         OR (a.entity_type = 'receipt' AND a.action = 'record_receipt')
         OR (a.entity_type = 'expense' AND a.action = 'create_expense')
         OR (a.entity_type = 'document' AND a.action IN ('upload_document', 'verify_document', 'delete_document'))
         OR (a.entity_type = 'clients' AND a.action IN ('activate', 'conflict_check', 'client_form_submitted'))
         OR (a.entity_type = 'delay_reason_disposition' AND a.action IN ('disposition_accept', 'disposition_counsel'))
      ORDER BY a.created_at DESC
      LIMIT $1`,
    [limit * 2],
  );

  const out: ActivityEvent[] = [];
  for (const r of rows) {
    const d = describe(r);
    if (!d) continue;
    out.push({
      id: r.id,
      at: new Date(r.created_at).toISOString(),
      who: r.who ?? (r.action === "client_form_submitted" ? "A client" : "The system"),
      kind: d.kind,
      text: d.text,
      href: d.href,
    });
    if (out.length >= limit) break;
  }
  return out;
}
