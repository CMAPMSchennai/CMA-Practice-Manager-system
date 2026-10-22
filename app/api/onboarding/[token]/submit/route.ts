/**
 * POST /api/onboarding/:token/submit — the client's own onboarding form (FR-31, FR-32, FR-37)
 *
 * Public route, no sign-in. The form has six sections (PDF): primary entity
 * information, authorised contact, financial and tax registrations, scope of
 * services, preliminary document checklist, and the declaration. The answers
 * are saved on the client record and kept whole in `onboarding_submission`.
 *
 * The client's document answers are a statement of what they can supply. They
 * do not tick the firm's checklist: staff verify the documents and tick the
 * nine items themselves.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { prepareClientPan, saveClientSecretMeta, secureFieldErrorResponse } from "@/lib/secure-fields";
import { CLIENT_CHECKLIST } from "@/lib/client-checklist";
import { createDraftEngagements } from "@/lib/draft-engagements";
import { createAuditLog } from "@/lib/audit";
import { notifyClientFormSubmitted } from "@/lib/client-form-notify";

const DOCS = CLIENT_CHECKLIST.slice(0, 6);
const COMMS = ["Email", "Phone", "Video", "In-Person"];
const DOC_ANSWERS = ["have", "later", "na"];

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;

    const tokenRows = await query<{
      id: string;
      client_id: string;
      expires_at: string;
      used_at: string | null;
      generated_by: string | null;
    }>(
      `SELECT id, client_id, expires_at, used_at, generated_by
         FROM onboarding_tokens
        WHERE token = $1
        LIMIT 1`,
      [token],
    );
    if (tokenRows.length === 0) {
      return NextResponse.json({ error: "Invalid or unknown onboarding token" }, { status: 400 });
    }
    const tokenRecord = tokenRows[0];
    if (tokenRecord.used_at) {
      return NextResponse.json({ error: "This onboarding link has already been used" }, { status: 400 });
    }
    if (new Date(tokenRecord.expires_at) < new Date()) {
      return NextResponse.json({ error: "This onboarding link has expired" }, { status: 400 });
    }

    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    // Section 1: primary entity information
    const trade_name = text(b.trade_name, 255);
    const registration_no = text(b.registration_no, 50);
    const address = text(b.address, 1000);
    const city = text(b.city, 100);
    const state = text(b.state, 100);
    const pin = text(b.pin, 10);
    const incorporation_date = typeof b.incorporation_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.incorporation_date) ? b.incorporation_date : null;
    const entity_type_id = typeof b.entity_type_id === "string" && UUID_RE.test(b.entity_type_id) ? b.entity_type_id : null;
    if (!address) return NextResponse.json({ error: "Enter the registered address." }, { status: 422 });
    if (pin && !/^\d{6}$/.test(pin)) return NextResponse.json({ error: "Enter a 6-digit PIN code." }, { status: 422 });

    // Section 2: authorised contact representative
    const contact_person = text(b.contact_person, 255);
    const designation = text(b.designation, 100);
    const contact_email = text(b.contact_email, 255);
    const contact_phone = text(b.contact_phone, 30);
    const preferred = typeof b.preferred_communication === "string" && COMMS.includes(b.preferred_communication) ? b.preferred_communication : null;
    if (!contact_person) return NextResponse.json({ error: "Enter the contact person's name." }, { status: 422 });
    if (!contact_email || !EMAIL_RE.test(contact_email)) return NextResponse.json({ error: "Enter a valid contact email." }, { status: 422 });
    if (!contact_phone || contact_phone.replace(/\D/g, "").length < 10) return NextResponse.json({ error: "Enter a valid contact phone number." }, { status: 422 });

    // Section 3: financial and tax registrations
    const pan = typeof b.pan === "string" ? b.pan.trim().toUpperCase() : "";
    const gstin = typeof b.gstin === "string" && b.gstin.trim() ? b.gstin.trim().toUpperCase() : null;
    const billing_email = text(b.billing_email, 255);
    const fy = Number(b.financial_year_end_month);
    const financial_year_end_month = Number.isInteger(fy) && fy >= 1 && fy <= 12 ? fy : null;
    if (!PAN_RE.test(pan)) return NextResponse.json({ error: "Enter a valid PAN (for example ABCDE1234F)." }, { status: 422 });
    if (gstin && !GSTIN_RE.test(gstin)) return NextResponse.json({ error: "Enter a valid GSTIN: 2 digits, 5 capital letters, 4 digits, 1 letter, then a letter or digit (not 0), the letter Z, and a letter or digit. Example: 22ABCDE1234F1Z5." }, { status: 422 });
    if (billing_email && !EMAIL_RE.test(billing_email)) return NextResponse.json({ error: "Enter a valid billing email." }, { status: 422 });

    // Section 4: scope of services
    const requested = Array.isArray(b.service_type_ids) ? b.service_type_ids.filter((x): x is string => typeof x === "string" && UUID_RE.test(x)) : [];
    const serviceIds = Array.from(new Set(requested)).slice(0, 60);
    const services = serviceIds.length
      ? await query<{ id: string; name: string }>(
          `SELECT id, name FROM service_types WHERE id = ANY($1::uuid[]) AND is_active = true ORDER BY name`,
          [serviceIds],
        )
      : [];

    // Section 5: preliminary document checklist (what the client can supply)
    const docIn = (b.documents && typeof b.documents === "object" ? b.documents : {}) as Record<string, unknown>;
    const documents: Record<string, string> = {};
    for (const d of DOCS) {
      const a = docIn[d.code];
      documents[d.code] = typeof a === "string" && DOC_ANSWERS.includes(a) ? a : "later";
    }

    // Section 6: declaration and authorisation
    const signatory_name = text(b.signatory_name, 255);
    if (!signatory_name) return NextResponse.json({ error: "Type the authorised signatory's name." }, { status: 422 });
    if (b.declaration !== true) return NextResponse.json({ error: "You must accept the declaration to submit." }, { status: 422 });
    const submittedAt = new Date().toISOString();

    const securePan = await prepareClientPan(pan);

    const draft = await createDraftEngagements({
      clientId: tokenRecord.client_id,
      serviceIds: services.map((s) => s.id),
      actorId: tokenRecord.generated_by,
      source: "client onboarding form",
    });

    // Services go into the client's scope.
    if (services.length) {
      await query(
        `INSERT INTO client_service_scope (client_id, service_type_id)
         SELECT $1::uuid, s FROM unnest($2::uuid[]) AS s
          WHERE NOT EXISTS (SELECT 1 FROM client_service_scope x WHERE x.client_id = $1::uuid AND x.service_type_id = s)`,
        [tokenRecord.client_id, services.map((s) => s.id)],
      );
    }

    const submission = {
      version: 1,
      submitted_at: submittedAt,
      services: services.map((s) => ({ id: s.id, name: s.name })),
      documents,
      declaration: { accepted: true, signatory_name, at: submittedAt },
      draft_engagements: draft,
    };

    await query(
      `UPDATE clients SET
          trade_name = COALESCE($1, trade_name),
          entity_type_id = COALESCE($2::uuid, entity_type_id),
          incorporation_date = COALESCE($3::date, incorporation_date),
          registration_no = COALESCE($4, registration_no),
          address = $5,
          city = COALESCE($6, city),
          state = COALESCE($7, state),
          pin = COALESCE($8, pin),
          contact_person = $9,
          designation = COALESCE($10, designation),
          contact_email = $11,
          contact_phone = $12,
          preferred_communication = COALESCE($13, preferred_communication),
          pan = $14,
          gstin = COALESCE($15, gstin),
          financial_year_end_month = COALESCE($16::smallint, financial_year_end_month),
          billing_email = COALESCE($17, billing_email),
          onboarding_submission = $18::jsonb,
          submitted_at = $19::timestamptz,
          onboarding_status = CASE WHEN onboarding_status IN ('imported', 'not_started') THEN 'kyc_and_docs' ELSE onboarding_status END,
          updated_at = now()
        WHERE id = $20`,
      [
        trade_name,
        entity_type_id,
        incorporation_date,
        registration_no,
        address,
        city,
        state,
        pin,
        contact_person,
        designation,
        contact_email,
        contact_phone,
        preferred,
        securePan.column,
        gstin,
        financial_year_end_month,
        billing_email,
        JSON.stringify(submission),
        submittedAt,
        tokenRecord.client_id,
      ],
    );
    await saveClientSecretMeta(tokenRecord.client_id, securePan.meta);

    await query(`UPDATE onboarding_tokens SET used_at = now(), updated_at = now() WHERE id = $1`, [tokenRecord.id]);

    if (tokenRecord.generated_by) {
      await createAuditLog({
        action: "client_form_submitted",
        entity_type: "clients",
        entity_id: tokenRecord.client_id,
        field_changes: {
          onboarding_form: { before: null, after: `submitted by ${signatory_name} (${services.length} services chosen)` },
        },
        user_id: tokenRecord.generated_by,
        ip_address: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
        user_agent: req.headers.get("user-agent"),
      });
    }

    await notifyClientFormSubmitted({
      clientId: tokenRecord.client_id,
      signatory: signatory_name,
      serviceCount: services.length,
      draftCount: draft.created.length,
      generatedBy: tokenRecord.generated_by,
    });

    return NextResponse.json(
      {
        message: "Onboarding form submitted successfully",
        client_id: tokenRecord.client_id,
        draft_engagements: draft.created.length,
      },
      { status: 201 },
    );
  } catch (err: unknown) {
    const protectedError = secureFieldErrorResponse(err);
    if (protectedError) return protectedError;
    console.error(err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
