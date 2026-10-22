"use client";

import * as React from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuditChainCard } from "@/components/settings/AuditChainCard";
import { AuditLogViewer } from "@/components/settings/AuditLogViewer";
import { UndertakingCard } from "@/components/settings/UndertakingCard";

type Me = { enabled: boolean; enrolled_at: string | null; required: boolean; role_can_use: boolean; must_enrol: boolean };
type Admin = { required: boolean; people: { id: string; name: string; role: string; enabled: boolean }[] };

const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
};

async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "That didn't work.");
  return j;
}

function MyTwoStep() {
  const { data, mutate } = useSWR<Me>("/api/mfa/me", fetcher);
  const [setup, setSetup] = React.useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = React.useState("");
  const [codes, setCodes] = React.useState<string[] | null>(null);
  const [pw, setPw] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent></Card>;

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Your two-step sign-in</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        {data.must_enrol && (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
            Two-step sign-in is now required for your role. Please set it up below.
          </p>
        )}
        {codes ? (
          <div className="space-y-2">
            <p className="font-medium">Two-step sign-in is on. Save these recovery codes now. They are shown only once.</p>
            <pre className="rounded-md bg-muted p-3 font-mono text-xs leading-6">{codes.join("\n")}</pre>
            <p className="text-muted-foreground">Each code works once if you lose your phone. Keep them somewhere safe, not in this system.</p>
            <Button onClick={() => { setCodes(null); mutate(); }}>I have saved them</Button>
          </div>
        ) : data.enabled ? (
          <div className="space-y-3">
            <p>Status: <strong>On</strong>{data.enrolled_at ? ` (since ${new Date(data.enrolled_at).toLocaleDateString()})` : ""}. You will be asked for a code from your authenticator app each time you sign in.</p>
            {data.required ? (
              <p className="text-muted-foreground">It is required for your role, so it can&apos;t be switched off. If you lose your phone, ask the Managing Partner to reset it.</p>
            ) : (
              <div className="flex flex-wrap items-end gap-2">
                <Input type="password" placeholder="Your password" value={pw} onChange={(e) => setPw(e.target.value)} className="max-w-48" />
                <Input placeholder="Current code" value={code} onChange={(e) => setCode(e.target.value)} className="max-w-40" />
                <Button variant="outline" disabled={busy || !pw || !code} onClick={() => run(async () => {
                  await post("/api/mfa/me", { action: "disable", password: pw, code });
                  setPw(""); setCode(""); toast.success("Two-step sign-in is off."); mutate();
                })}>Switch off</Button>
              </div>
            )}
          </div>
        ) : setup ? (
          <div className="space-y-3">
            <ol className="list-decimal space-y-1 pl-5">
              <li>Open an authenticator app (Google Authenticator, Microsoft Authenticator, Authy).</li>
              <li>Add an account and choose &ldquo;enter a setup key&rdquo;. Paste the key below (time-based).</li>
              <li>Type the 6-digit code the app shows, then press Confirm.</li>
            </ol>
            <pre className="select-all break-all rounded-md bg-muted p-3 font-mono text-xs">{setup.secret}</pre>
            <a href={setup.uri} className="text-xs text-primary underline">Open in an authenticator app on this device</a>
            <div className="flex items-center gap-2">
              <Input inputMode="numeric" placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} className="max-w-40" />
              <Button disabled={busy || code.trim().length < 6} onClick={() => run(async () => {
                const j = await post("/api/mfa/me", { action: "enable", code });
                setCodes(j.recovery_codes as string[]); setSetup(null); setCode("");
              })}>Confirm</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p>Status: <strong>Off</strong>.{data.role_can_use ? "" : " Two-step sign-in is available for Partners and the Managing Partner."}</p>
            {data.role_can_use && (
              <Button disabled={busy} onClick={() => run(async () => setSetup(await post("/api/mfa/me", { action: "setup" })))}>Set up two-step sign-in</Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AdminControls() {
  const { data, mutate, error } = useSWR<Admin>("/api/mfa/admin", fetcher, { shouldRetryOnError: false });
  if (error || !data) return null;
  async function act(body: unknown, ok: string) {
    try {
      await post("/api/mfa/admin", body);
      toast.success(ok);
      mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't work.");
    }
  }
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Managing Partner controls</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex items-center justify-between gap-3">
          <p>Require two-step sign-in for Partners and the Managing Partner: <strong>{data.required ? "Yes" : "No"}</strong></p>
          <Button variant="outline" onClick={() => act({ action: "require", required: !data.required }, data.required ? "No longer required." : "Now required. Each person is asked to set it up.")}>
            {data.required ? "Stop requiring" : "Require it"}
          </Button>
        </div>
        <div className="divide-y rounded-md border">
          {data.people.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span>{p.name} <span className="text-muted-foreground">({p.role.replace("_", " ")})</span></span>
              <span className="flex items-center gap-3">
                <span className={p.enabled ? "text-green-700" : "text-muted-foreground"}>{p.enabled ? "On" : "Off"}</span>
                {p.enabled && (
                  <Button size="sm" variant="outline" onClick={() => { if (confirm(`Reset two-step sign-in for ${p.name}? They will need to set it up again.`)) act({ action: "reset", user_id: p.id }, "Reset."); }}>
                    Reset (lost phone)
                  </Button>
                )}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** The list of recorded actions. Hidden from people who may not read the audit trail. */
function AuditLogSection() {
  const [status, setStatus] = React.useState<number | null>(null);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/audit-logs?limit=1")
      .then((r) => setStatus(r.status))
      .catch(() => setStatus(0));
  }, []);

  // 403 means this person may not read the audit trail: hide the card.
  if (status === 403) return null;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">Audit log</CardTitle>
        <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide the log" : "Show the log"}
        </Button>
      </CardHeader>
      {status !== null && status !== 200 && (
        <CardContent>
          <p className="text-sm text-muted-foreground">
            The log could not be checked just now (code {status}). Try Show the log.
          </p>
        </CardContent>
      )}
      {open && (
        <CardContent>
          <AuditLogViewer />
        </CardContent>
      )}
    </Card>
  );
}

export default function SecurityPage() {
  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Security</h1>
        <p className="mt-1 text-sm text-muted-foreground">Two-step sign-in and the audit trail check.</p>
      </div>
      <MyTwoStep />
      <AdminControls />
      <UndertakingCard />
      <AuditChainCard />
      <AuditLogSection />
    </div>
  );
}
