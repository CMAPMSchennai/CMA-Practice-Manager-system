"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  invoiceSchema,
  REIMBURSEMENT_HEAD_OPTIONS,
  type InvoiceFormValues,
} from "@/lib/schemas/invoice";

interface Entity {
  id: string;
  name: string;
  short_code: string;
  gstin: string | null;
}

interface Client {
  id: string;
  name: string;
  client_code: string;
  gstin: string | null;
}

interface Engagement {
  id: string;
  engagement_code: string;
  client_id: string;
  billing_entity_id: string;
  agreed_fee: number | null;
  status: string;
}

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function InvoiceForm() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  // IGST unless the person chooses CGST + SGST (decided with the firm, 16 Oct 2026). The form
  // suggests CGST + SGST when the place of supply is the billing entity's own state.
  const [gstType, setGstType] = useState<"igst" | "cgst_sgst">("igst");
  const [gstTouched, setGstTouched] = useState(false);
  // The allowed GST rates are a setting (Settings > GST rates). These are the standard ones until it loads.
  const [gstRates, setGstRates] = useState<number[]>([0, 5, 12, 18, 28]);
  const [defaultRate, setDefaultRate] = useState(18);

  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      billing_entity_id: "",
      client_id: "",
      invoice_date: new Date().toISOString().slice(0, 10),
      due_date: "",
      place_of_supply: "",
      line_items: [{ description: "", sac_code: "", amount: 0, gst_rate: 18 }],
      reimbursement_lines: [],
      engagements: [],
      tds_receivable: 0,
      notes: "",
    },
  });

  const lineItemsField = useFieldArray({ control: form.control, name: "line_items" });
  const reimbField = useFieldArray({ control: form.control, name: "reimbursement_lines" });
  const engField = useFieldArray({ control: form.control, name: "engagements" });

  const selectedEntityId = form.watch("billing_entity_id");
  const selectedClientId = form.watch("client_id");
  const watchedLineItems = form.watch("line_items");
  const watchedReimb = form.watch("reimbursement_lines") ?? [];
  const watchedPlaceOfSupply = form.watch("place_of_supply");

  // Load entities + clients
  useEffect(() => {
    fetch("/api/entities")
      .then((r) => r.json())
      .then((d) => setEntities(Array.isArray(d?.entities) ? d.entities : []))
      .catch(() => setEntities([]));

    fetch("/api/clients?limit=500")
      .then((r) => r.json())
      .then((d) => setClients(Array.isArray(d?.clients) ? d.clients : []))
      .catch(() => setClients([]));

    fetch("/api/settings/gst-rates")
      .then((r) => r.json())
      .then((d: { rates?: number[]; default_rate?: number }) => {
        if (!Array.isArray(d?.rates) || d.rates.length === 0) return;
        const def = typeof d.default_rate === "number" ? d.default_rate : 18;
        setGstRates(d.rates);
        setDefaultRate(def);
        // The first line starts with the firm's default rate, if nothing has been typed yet.
        const first = form.getValues("line_items");
        if (first.length === 1 && !Number(first[0].amount) && !first[0].description) {
          form.setValue("line_items.0.gst_rate", def);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load engagements when entity + client selected
  useEffect(() => {
    if (selectedEntityId && selectedClientId) {
      fetch(`/api/engagements?billing_entity_id=${selectedEntityId}&client_id=${selectedClientId}`)
        .then((r) => r.json())
        .then((d) => setEngagements(Array.isArray(d?.engagements) ? d.engagements : []))
        .catch(() => setEngagements([]));
    } else {
      setEngagements([]);
    }
  }, [selectedEntityId, selectedClientId]);

  // Compute GST preview
  const subtotal = watchedLineItems.reduce((s, li) => s + (Number(li.amount) || 0), 0);
  const reimbTotal = watchedReimb.reduce((s, rl) => s + (Number(rl.amount) || 0), 0);

  const selectedEntity = entities.find((e) => e.id === selectedEntityId);
  const entityStateCode = selectedEntity?.gstin?.substring(0, 2) ?? null;
  const supplyStateCode = watchedPlaceOfSupply?.substring(0, 2) ?? null;

  const taxTotal = watchedLineItems.reduce((s, li) => {
    const rate = Number(li.gst_rate);
    return s + ((Number(li.amount) || 0) * (Number.isFinite(rate) ? rate : 18)) / 100;
  }, 0);
  const suggestedGst: "igst" | "cgst_sgst" =
    entityStateCode && supplyStateCode && entityStateCode === supplyStateCode ? "cgst_sgst" : "igst";
  useEffect(() => {
    if (!gstTouched) setGstType(suggestedGst);
  }, [suggestedGst, gstTouched]);

  const watchedEng = form.watch("engagements") ?? [];
  const engTotal = watchedEng.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  let cgst = 0, sgst = 0, igst = 0;
  if (gstType === "cgst_sgst") {
    cgst = Math.round((taxTotal / 2) * 100) / 100;
    sgst = Math.round((taxTotal / 2) * 100) / 100;
  } else {
    igst = Math.round(taxTotal * 100) / 100;
  }
  const totalAmount = Math.round((subtotal + reimbTotal + cgst + sgst + igst) * 100) / 100;

  // Without this, a failed check (for example no engagement linked) would just do nothing.
  function onInvalid(errors: Record<string, unknown>) {
    const found: string[] = [];
    const walk = (node: unknown) => {
      if (!node || typeof node !== "object") return;
      const n = node as Record<string, unknown>;
      if (typeof n.message === "string" && n.message) found.push(n.message);
      for (const k of Object.keys(n)) {
        if (k !== "ref" && k !== "message" && k !== "type") walk(n[k]);
      }
    };
    walk(errors);
    const unique = Array.from(new Set(found));
    const msg = unique.length
      ? `Can't create the invoice yet: ${unique.join("; ")}.`
      : "Please check the form and try again.";
    setFormError(msg);
    toast.error(msg);
  }

  async function onSubmit(values: InvoiceFormValues) {
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, gst_type: gstType }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = `The invoice was not saved (error ${res.status}): ${data.error || "no reason was given"}.`;
        setFormError(msg);
        toast.error(msg);
        return;
      }
      toast.success(`Invoice ${data.invoice_number} saved as a draft. Open it to issue it.`);
      router.push(`/dashboard/billing/invoices/${data.id}`);
    } catch (err) {
      const message = err instanceof Error && err.message.trim() ? err.message : "Something went wrong.";
      setFormError(`The invoice was not saved: ${message}`);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  // Available engagements = those matching entity+client and not already linked
  const linkedEngIds = new Set(engField.fields.map((f) => f.engagement_id));
  const availableEngagements = engagements.filter(
    (e) => !linkedEngIds.has(e.id) && e.status !== "cancelled"
  );

  return (
    <Form {...form}>
      <form noValidate onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-6">
        {/* Header Fields */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Invoice Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="billing_entity_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Billing Entity *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select entity" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {entities.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.name} ({e.short_code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="client_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Client *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select client" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} ({c.client_code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="invoice_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Invoice Date *</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="due_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Due Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="place_of_supply"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Place of Supply (State Code)</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. 33 for Tamil Nadu" maxLength={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="space-y-2">
              <label htmlFor="gst-type" className="text-sm font-medium leading-none">GST type</label>
              <select
                id="gst-type"
                value={gstType}
                onChange={(e) => {
                  setGstType(e.target.value as "igst" | "cgst_sgst");
                  setGstTouched(true);
                }}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
              >
                <option value="igst">IGST (client in another state, or no GSTIN)</option>
                <option value="cgst_sgst">CGST + SGST (client in the same state)</option>
              </select>
              <p className="text-xs text-muted-foreground">
                {gstTouched && gstType !== suggestedGst
                  ? `You chose ${gstType === "igst" ? "IGST" : "CGST + SGST"}. The place of supply suggests ${suggestedGst === "igst" ? "IGST" : "CGST + SGST"}. The choice is recorded.`
                  : suggestedGst === "cgst_sgst"
                    ? "The place of supply is the billing entity's own state, so CGST + SGST is selected."
                    : "IGST applies unless you choose CGST + SGST."}
              </p>
            </div>
            <FormField
              control={form.control}
              name="tds_receivable"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>TDS Receivable (₹)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Linked Engagements */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Linked Engagements</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={availableEngagements.length === 0}
              onClick={() => {
                if (availableEngagements.length > 0) {
                  engField.append({ engagement_id: availableEngagements[0].id, amount: 0 });
                }
              }}
            >
              <Plus className="size-4 mr-1" />
              Add Engagement
            </Button>
          </CardHeader>
          <CardContent>
            {engField.fields.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {selectedEntityId && selectedClientId
                  ? "No engagements linked yet. Click Add Engagement to link."
                  : "Select a billing entity and client first."}
              </p>
            )}
            {watchedEng.length > 0 && Math.abs(engTotal - subtotal) > 0.005 && (
              <div role="status" className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                The engagement amounts add up to {fmt(engTotal)}, but the fee lines add up to {fmt(subtotal)}. The invoice
                charges the fee lines. Billing&apos;s Unbilled figure counts the engagement amounts. Make them the same unless
                this is intended.
              </div>
            )}
            {form.formState.errors.engagements?.message && (
              <p className="text-sm text-destructive mb-2">{form.formState.errors.engagements.message}</p>
            )}
            <div className="space-y-3">
              {engField.fields.map((f, idx) => (
                <div key={f.id} className="flex items-end gap-3">
                  <FormField
                    control={form.control}
                    name={`engagements.${idx}.engagement_id`}
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        {idx === 0 && <FormLabel>Engagement</FormLabel>}
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {engagements
                              .filter(
                                (e) =>
                                  e.id === field.value || !linkedEngIds.has(e.id) || e.id === field.value
                              )
                              .map((e) => (
                                <SelectItem key={e.id} value={e.id}>
                                  {e.engagement_code} {e.agreed_fee ? `(₹${Number(e.agreed_fee).toLocaleString("en-IN")})` : ""}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`engagements.${idx}.amount`}
                    render={({ field }) => (
                      <FormItem className="w-36">
                        {idx === 0 && <FormLabel>Amount</FormLabel>}
                        <FormControl>
                          <Input type="number" step="0.01" min="0" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => engField.remove(idx)}
                    className="shrink-0"
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Line Items */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Professional Fee Line Items</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => lineItemsField.append({ description: "", sac_code: "", amount: 0, gst_rate: defaultRate })}
            >
              <Plus className="size-4 mr-1" />
              Add Line
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {lineItemsField.fields.map((f, idx) => (
              <div key={f.id} className="flex items-end gap-3">
                <FormField
                  control={form.control}
                  name={`line_items.${idx}.description`}
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      {idx === 0 && <FormLabel>Description</FormLabel>}
                      <FormControl>
                        <Input placeholder="Service description" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`line_items.${idx}.sac_code`}
                  render={({ field }) => (
                    <FormItem className="w-28">
                      {idx === 0 && <FormLabel>SAC Code</FormLabel>}
                      <FormControl>
                        <Input placeholder="998311" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`line_items.${idx}.amount`}
                  render={({ field }) => (
                    <FormItem className="w-32">
                      {idx === 0 && <FormLabel>Amount (₹)</FormLabel>}
                      <FormControl>
                        <Input type="number" step="0.01" min="0" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`line_items.${idx}.gst_rate`}
                  render={({ field }) => (
                    <FormItem className="w-24">
                      {idx === 0 && <FormLabel>GST %</FormLabel>}
                      <Select value={String(field.value ?? 18)} onValueChange={(v) => field.onChange(Number(v))}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(gstRates.includes(Number(field.value)) || field.value === undefined
                            ? gstRates
                            : [...gstRates, Number(field.value)].sort((a, b) => a - b)
                          ).map((r) => (
                            <SelectItem key={r} value={String(r)}>
                              {r}%
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={lineItemsField.fields.length <= 1}
                  onClick={() => lineItemsField.remove(idx)}
                  className="shrink-0"
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Reimbursement Lines */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Reimbursements</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => reimbField.append({ head: "", description: "", amount: 0 })}
            >
              <Plus className="size-4 mr-1" />
              Add Reimbursement
            </Button>
          </CardHeader>
          <CardContent>
            {reimbField.fields.length === 0 && (
              <p className="text-sm text-muted-foreground">No reimbursement lines.</p>
            )}
            <div className="space-y-3">
              {reimbField.fields.map((f, idx) => (
                <div key={f.id} className="flex items-end gap-3">
                  <FormField
                    control={form.control}
                    name={`reimbursement_lines.${idx}.head`}
                    render={({ field }) => (
                      <FormItem className="w-36">
                        {idx === 0 && <FormLabel>Head</FormLabel>}
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Choose" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {REIMBURSEMENT_HEAD_OPTIONS.map((h) => (
                              <SelectItem key={h} value={h}>
                                {h}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`reimbursement_lines.${idx}.description`}
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        {idx === 0 && <FormLabel>Description</FormLabel>}
                        <FormControl>
                          <Input placeholder="Description" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`reimbursement_lines.${idx}.amount`}
                    render={({ field }) => (
                      <FormItem className="w-32">
                        {idx === 0 && <FormLabel>Amount (₹)</FormLabel>}
                        <FormControl>
                          <Input type="number" step="0.01" min="0" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => reimbField.remove(idx)}
                    className="shrink-0"
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardContent className="pt-6">
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* GST Preview */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">GST Calculation Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal (Professional Fees)</span>
              <span className="tabular-nums font-medium">{fmt(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Reimbursements</span>
              <span className="tabular-nums">{fmt(reimbTotal)}</span>
            </div>
            <Separator />
            {cgst > 0 ? (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">CGST (half of GST)</span>
                  <span className="tabular-nums">{fmt(cgst)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">SGST (half of GST)</span>
                  <span className="tabular-nums">{fmt(sgst)}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between">
                <span className="text-muted-foreground">IGST (at each line's rate)</span>
                <span className="tabular-nums">{fmt(igst)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between font-semibold text-base">
              <span>Total Amount</span>
              <span className="tabular-nums">{fmt(totalAmount)}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {gstType === "igst"
                ? "IGST is charged. Change the GST type above to CGST + SGST for a client in the same state."
                : "CGST + SGST is charged, half of the GST each."}
              {!watchedPlaceOfSupply && " Entering the Place of Supply state code lets the form suggest the right type."}
            </p>
          </CardContent>
        </Card>

        {/* Submit */}
        {formError && (
          <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            {formError}
          </div>
        )}
        <div className="flex items-center justify-end gap-3 pb-6">
          <Button type="button" variant="outline" onClick={() => router.push("/dashboard/billing")}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Creating Invoice…" : "Create Invoice"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
