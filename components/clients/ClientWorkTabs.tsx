"use client";

/**
 * The Engagements, Tasks and Billing tabs of a client (FR-28). Each one reads
 * the same APIs the main screens use, so scope and fee visibility rules apply
 * as they do everywhere else.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function fmtMoney(n: number) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function label(s: string) {
  return s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground py-8 text-center">{children}</p>;
}

/* ---------------------------------------------------------------- */

interface EngagementRow {
  id: string;
  engagement_code: string;
  service_type_name: string | null;
  period_start: string | null;
  period_end: string | null;
  progress_pct: number | null;
  status: string;
  agreed_fee: number | null;
  fee_visible?: boolean;
  is_recurring: boolean;
}

export function ClientEngagementsTab({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<EngagementRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/engagements?client_id=${clientId}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) setError(d.error ?? "Engagements could not be loaded.");
        else setRows(Array.isArray(d.engagements) ? d.engagements : []);
      })
      .catch(() => setError("Engagements could not be loaded."));
  }, [clientId]);

  const showFee = (rows ?? []).some((r) => r.fee_visible);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Engagements</CardTitle>
      </CardHeader>
      <CardContent>
        {error && <Empty>{error}</Empty>}
        {!error && rows === null && <Skeleton className="h-24 w-full" />}
        {!error && rows && rows.length === 0 && <Empty>No engagements for this client yet.</Empty>}
        {!error && rows && rows.length > 0 && (
          <div className="border rounded-md overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="bg-muted/50 text-left">
                  <th className="px-3 py-2 font-medium">Engagement</th>
                  <th className="px-3 py-2 font-medium">Service</th>
                  <th className="px-3 py-2 font-medium">Period</th>
                  <th className="px-3 py-2 font-medium text-right">Progress</th>
                  {showFee && <th className="px-3 py-2 font-medium text-right">Agreed fee</th>}
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t cursor-pointer hover:bg-muted/30"
                    onClick={() => router.push(`/dashboard/engagements/${r.id}`)}
                  >
                    <td className="px-3 py-2 font-medium">
                      {r.engagement_code}
                      {r.is_recurring && <span className="ml-2 text-xs text-muted-foreground">recurring</span>}
                    </td>
                    <td className="px-3 py-2">{r.service_type_name ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.period_start ? `${fmtDate(r.period_start)} to ${fmtDate(r.period_end)}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{Math.round(Number(r.progress_pct) || 0)}%</td>
                    {showFee && (
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.agreed_fee != null ? fmtMoney(Number(r.agreed_fee)) : "—"}
                      </td>
                    )}
                    <td className="px-3 py-2"><Badge variant="outline">{label(r.status)}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------------------------------------------------------- */

interface TaskRow {
  id: string;
  engagement_id: string;
  engagement_code: string | null;
  title: string;
  status: string;
  due_date: string | null;
  assigned_to_name: string | null;
  reviewer_name: string | null;
}

export function ClientTasksTab({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<TaskRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  useEffect(() => {
    fetch(`/api/task-instances?client_id=${clientId}&limit=1000`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) setError(d.error ?? "Tasks could not be loaded.");
        else setRows(Array.isArray(d.task_instances) ? d.task_instances : []);
      })
      .catch(() => setError("Tasks could not be loaded."));
  }, [clientId]);

  const today = new Date().toISOString().slice(0, 10);
  const open = (rows ?? []).filter((t) => t.status !== "completed" && t.status !== "not_applicable");
  const shown = showDone ? rows ?? [] : open;
  const late = open.filter((t) => t.due_date && String(t.due_date).slice(0, 10) < today).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Tasks</CardTitle>
        {rows && rows.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
            Include completed
          </label>
        )}
      </CardHeader>
      <CardContent>
        {error && <Empty>{error}</Empty>}
        {!error && rows === null && <Skeleton className="h-24 w-full" />}
        {!error && rows && rows.length === 0 && <Empty>No tasks for this client yet.</Empty>}
        {!error && rows && rows.length > 0 && (
          <>
            <p className="text-sm text-muted-foreground mb-3">
              {open.length} open{late > 0 ? `, ${late} past due` : ""} of {rows.length} tasks
            </p>
            <div className="border rounded-md overflow-x-auto max-h-[28rem] overflow-y-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead className="sticky top-0 z-10 bg-muted shadow-[0_1px_0_hsl(var(--border))]">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">Task</th>
                    <th className="px-3 py-2 font-medium">Engagement</th>
                    <th className="px-3 py-2 font-medium">Doer</th>
                    <th className="px-3 py-2 font-medium">Reviewer</th>
                    <th className="px-3 py-2 font-medium">Due</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.slice(0, 300).map((t) => {
                    const isLate =
                      t.due_date && String(t.due_date).slice(0, 10) < today && t.status !== "completed" && t.status !== "not_applicable";
                    return (
                      <tr
                        key={t.id}
                        className="border-t cursor-pointer hover:bg-muted/30"
                        onClick={() => router.push(`/dashboard/engagements/${t.engagement_id}?task=${t.id}`)}
                      >
                        <td className="px-3 py-2">{t.title}</td>
                        <td className="px-3 py-2 text-muted-foreground">{t.engagement_code ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{t.assigned_to_name ?? "Not assigned"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{t.reviewer_name ?? "—"}</td>
                        <td className={`px-3 py-2 ${isLate ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                          {fmtDate(t.due_date)}
                        </td>
                        <td className="px-3 py-2"><Badge variant="outline">{label(t.status)}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {shown.length > 300 && (
              <p className="text-xs text-muted-foreground mt-2">Showing the first 300. Open an engagement to see all of its tasks.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------------------------------------------------------- */

interface InvoiceRow {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  outstanding?: number;
  days_overdue?: number;
  status: string;
}

export function ClientBillingTab({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<InvoiceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/invoices?client_id=${clientId}`)
      .then((r) => r.json().then((d) => ({ status: r.status, d })))
      .then(({ status, d }) => {
        if (status === 403) setError("Billing is visible only to the Managing Partner, Partners, Admin and Managers.");
        else if (status >= 400) setError(d.error ?? "Invoices could not be loaded.");
        else setRows(Array.isArray(d.invoices) ? d.invoices : []);
      })
      .catch(() => setError("Invoices could not be loaded."));
  }, [clientId]);

  const billed = (rows ?? []).filter((r) => !["draft", "cancelled"].includes(r.status));
  const totalBilled = billed.reduce((s, r) => s + Number(r.total_amount || 0), 0);
  const totalOwed = (rows ?? [])
    .filter((r) => ["issued", "sent", "partially_paid", "overdue"].includes(r.status))
    .reduce((s, r) => s + Number(r.outstanding || 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Billing</CardTitle>
      </CardHeader>
      <CardContent>
        {error && <Empty>{error}</Empty>}
        {!error && rows === null && <Skeleton className="h-24 w-full" />}
        {!error && rows && rows.length === 0 && <Empty>No invoices for this client yet.</Empty>}
        {!error && rows && rows.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Invoiced (issued and later)</p>
                <p className="text-lg font-semibold tabular-nums">{fmtMoney(totalBilled)}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Still owed</p>
                <p className="text-lg font-semibold tabular-nums">{fmtMoney(totalOwed)}</p>
              </div>
            </div>
            <div className="border rounded-md overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="bg-muted/50 text-left">
                    <th className="px-3 py-2 font-medium">Invoice no.</th>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium text-right">Amount</th>
                    <th className="px-3 py-2 font-medium text-right">Owed</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-t cursor-pointer hover:bg-muted/30"
                      onClick={() => router.push(`/dashboard/billing/invoices/${r.id}`)}
                    >
                      <td className="px-3 py-2 font-medium">{r.invoice_number}</td>
                      <td className="px-3 py-2 text-muted-foreground">{fmtDate(r.invoice_date)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(Number(r.total_amount))}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(Number(r.outstanding || 0))}</td>
                      <td className="px-3 py-2">
                        <Badge variant={r.status === "overdue" ? "destructive" : "outline"}>{label(r.status)}</Badge>
                        {Number(r.days_overdue) > 0 && (
                          <span className="ml-2 text-xs text-destructive">{r.days_overdue} days overdue</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
