/**
 * POST /api/documents/:id/verify  { action, peer_id? }  (FR-63, added feature A4)
 *
 * Two steps. A Manager on the job's Team "checks" the file; a Managing Partner
 * then "verifies" it (the PDF's verified_by / verified_on, and the moment it
 * counts as filed). A Managing Partner may verify directly when the job has no
 * Manager. A Managing Partner can ask a different Managing Partner for a peer
 * review. Old callers may still send { verified: boolean }.
 * A new version of the file starts unchecked and unverified.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { userHasPermission } from "@/lib/rbac";
import { query } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";
import { canSeeDocumentOwner, getAccessScope } from "@/lib/access-scope";
import { getDocMeta, patchDocMeta } from "@/lib/document-meta";
import { actionsFor, managingPartnerIds, notifyUsers, teamManagers } from "@/lib/doc-verification";
import type { DocAction } from "@/lib/doc-verification";

const ACTIONS: DocAction[] = ["check", "uncheck", "verify", "unverify", "request_peer", "peer_review"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSessionUser(req);
    if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const who = await query<{ role: string; name: string }>(
      `SELECT r.name AS role, COALESCE(NULLIF(trim(u.name), ''), u.email) AS name
         FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1 LIMIT 1`,
      [session.id],
    );
    if (!who[0]) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const me = who[0];

    const { id } = await params;
    const rows = await query<{ id: string; owner_type: string; owner_id: string; file_name: string; is_active: boolean; uploaded_by: string | null }>(
      `SELECT id, owner_type, owner_id, file_name, is_active, uploaded_by FROM documents WHERE id = $1 LIMIT 1`,
      [id],
    );
    if (rows.length === 0) return NextResponse.json({ error: "Document not found." }, { status: 404 });
    const doc = rows[0];

    const scope = await getAccessScope(session.id);
    const canViewEmployees = await userHasPermission(session.id, "view_employees");
    if (!(await canSeeDocumentOwner(scope, doc.owner_type, doc.owner_id, canViewEmployees))) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }
    if (!doc.is_active) {
      return NextResponse.json({ error: "Only the current version of a document can be verified." }, { status: 409 });
    }

    const body = (await req.json().catch(() => ({}))) as { action?: string; verified?: boolean; peer_id?: string };
    const action = (body.action ?? (body.verified === false ? "unverify" : "verify")) as DocAction;
    if (!ACTIONS.includes(action)) return NextResponse.json({ error: "Unknown action." }, { status: 422 });

    const meta = (await getDocMeta([id])).get(id) ?? {};
    const managers = await teamManagers(doc.owner_type === "engagement" ? [doc.owner_id] : []);
    const allowed = actionsFor(session.id, me.role, doc, meta, managers);
    if (!allowed.includes(action)) {
      const msg: Record<DocAction, string> = {
        check: "Only the Manager on this job's Team can check this file, and only once.",
        uncheck: "This check can't be taken back by you right now.",
        verify: managers.get(doc.owner_id)?.size && !meta.checked_at
          ? "The Manager on this job has to check the file first."
          : "Only a Managing Partner can verify documents.",
        unverify: "Only a Managing Partner can remove a verification.",
        request_peer: "Only a Managing Partner can ask for a peer review, after verifying, and only once.",
        peer_review: "Only the Managing Partner asked for the peer review can do it.",
      };
      return NextResponse.json({ error: msg[action] }, { status: 403 });
    }

    const now = new Date().toISOString();
    let patch: Record<string, unknown> = {};
    let notify: { to: string[]; subject: string; text: string } | null = null;
    const label = doc.file_name;

    if (action === "check") {
      patch = { checked_by: session.id, checked_by_name: me.name, checked_at: now };
      notify = {
        to: await managingPartnerIds(),
        subject: `${label} is ready for your verification`,
        text: `${me.name} has checked ${label}. It now needs the Managing Partner's verification.`,
      };
    } else if (action === "uncheck") {
      patch = { checked_by: null, checked_by_name: null, checked_at: null };
    } else if (action === "verify") {
      patch = { verified_by: session.id, verified_by_name: me.name, verified_at: now };
    } else if (action === "unverify") {
      patch = { verified_by: null, verified_by_name: null, verified_at: null };
    } else if (action === "request_peer") {
      const peerId = String(body.peer_id ?? "");
      if (!peerId || peerId === session.id) {
        return NextResponse.json({ error: "Choose a different Managing Partner for the peer review." }, { status: 422 });
      }
      const peer = await query<{ name: string }>(
        `SELECT COALESCE(NULLIF(trim(u.name), ''), u.email) AS name
           FROM users u JOIN roles r ON r.id = u.role_id
          WHERE u.id = $1::uuid AND r.name = 'managing_partner' AND u.is_active = true`,
        [peerId],
      );
      if (!peer[0]) return NextResponse.json({ error: "The peer must be another Managing Partner." }, { status: 422 });
      patch = { peer_id: peerId, peer_name: peer[0].name, peer_requested_at: now, peer_done_at: null };
      notify = {
        to: [peerId],
        subject: `Peer review asked: ${label}`,
        text: `${me.name} asks you to peer review ${label}. Open the file's Documents list and tick it as reviewed.`,
      };
    } else {
      patch = { peer_done_at: now };
    }

    await patchDocMeta(id, patch);
    if (notify) {
      await notifyUsers(notify.to.filter((u) => u !== session.id), notify.subject, notify.text, {
        document_id: id,
        owner_type: doc.owner_type,
        owner_id: doc.owner_id,
        step: action,
      });
    }

    await createAuditLog({
      action: `${action}_document`,
      entity_type: "document",
      entity_id: id,
      field_changes: { [action]: { before: null, after: patch } },
      user_id: session.id,
      ip_address: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
      user_agent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ ok: true, action, verified: action === "verify" ? true : action === "unverify" ? false : !!meta.verified_at });
  } catch (err: unknown) {
    console.error(err);
    const message = err instanceof Error && err.message.trim() ? err.message : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
