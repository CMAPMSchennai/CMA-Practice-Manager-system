"use client";

import { useState, useEffect } from "react";
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
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClientPicker, type PickerClient } from "@/components/engagements/ClientPicker";
import { FEE_BASES, feeUnit } from "@/lib/fee-basis";
import {
  engagementSchema,
  type EngagementFormValues,
} from "@/lib/schemas/engagement";

interface LookupItem {
  id: string;
  name: string;
  [key: string]: unknown;
}

interface EngagementFormProps {
  onSubmit: (values: EngagementFormValues) => Promise<void>;
  defaultValues?: Partial<EngagementFormValues>;
  submitLabel?: string;
}

export function EngagementForm({
  onSubmit,
  defaultValues,
  submitLabel = "Create Engagement",
}: EngagementFormProps) {
  const [clients, setClients] = useState<PickerClient[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [serviceTypes, setServiceTypes] = useState<LookupItem[]>([]);
  const [entities, setEntities] = useState<LookupItem[]>([]);
  const [users, setUsers] = useState<LookupItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  // The standard fee that was filled in for the chosen service (null when none, or when the user typed their own).
  const [autoFee, setAutoFee] = useState<number | null>(null);

  const form = useForm<EngagementFormValues>({
    resolver: zodResolver(engagementSchema),
    defaultValues: {
      client_id: "",
      service_type_id: "",
      billing_entity_id: "",
      period_start: "",
      period_end: "",
      fee_basis: "",
      agreed_fee: undefined,
      partner_in_charge_id: "",
      is_recurring: false,
      notes: "",
      team: [],
      ...defaultValues,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "team",
  });

  // The firm marks each service as a checklist job or a simple job (Service Type Catalogue); when it
  // has, that choice is made for the person creating the job.
  const watchedService = form.watch("service_type_id");
  const lockedJobType = serviceTypes.find((x) => x.id === watchedService)?.job_type;
  const jobTypeLocked = lockedJobType === "checklist" || lockedJobType === "simple";

  useEffect(() => {
    const fetcher = (url: string) =>
      fetch(url).then((r) => r.json());

    fetcher("/api/clients?limit=500&is_active=true")
      .then((d) => {
        const list = Array.isArray(d?.clients) ? d.clients : [];
        setClients(list);
      })
      .finally(() => setClientsLoading(false));

    fetcher("/api/service-types?limit=500&is_active=true").then((d) => {
      const list = Array.isArray(d?.service_types) ? d.service_types : [];
      setServiceTypes(list);
    });

    fetcher("/api/entities").then((d) => {
      const list = Array.isArray(d?.entities) ? d.entities : [];
      setEntities(list);
    });

    fetcher("/api/users").then((d) => {
      const list = Array.isArray(d?.users) ? d.users : [];
      setUsers(list);
    });
  }, []);

  const handleSubmit = async (values: EngagementFormValues) => {
    setSubmitting(true);
    try {
      await onSubmit(values);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="space-y-6"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="client_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Client *</FormLabel>
                <FormControl>
                  <ClientPicker
                    clients={clients}
                    value={field.value}
                    onChange={field.onChange}
                    loading={clientsLoading}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="service_type_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Service Type *</FormLabel>
                <Select
                  onValueChange={(v) => {
                    field.onChange(v);
                    // Start the agreed fee from the service's standard fee, unless someone has typed their own.
                    const st = serviceTypes.find((x) => x.id === v);
                    const jobType = st ? (st as Record<string, unknown>).job_type : null;
                    if (jobType === "checklist") form.setValue("needs_checklist", true, { shouldValidate: true });
                    else if (jobType === "simple") form.setValue("needs_checklist", false, { shouldValidate: true });
                    // A service with no setting asks again, so a choice made for the last service does not carry over.
                    else form.setValue("needs_checklist", undefined as unknown as boolean);
                    const raw = st ? Number((st as Record<string, unknown>).standard_fee) : NaN;
                    const standard = Number.isFinite(raw) && raw > 0 ? raw : null;
                    const typed = form.getValues("agreed_fee");
                    const blank = typed === undefined || typed === null || String(typed) === "";
                    if (blank || (autoFee !== null && Number(typed) === autoFee)) {
                      form.setValue("agreed_fee", standard === null ? undefined : standard, { shouldDirty: true });
                      setAutoFee(standard);
                    }
                  }}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select service type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {serviceTypes.map((st) => (
                      <SelectItem key={st.id} value={st.id}>
                        {st.name}
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
            name="billing_entity_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Billing Entity *</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select entity" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {entities.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name}
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
            name="partner_in_charge_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Partner in Charge</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value || ""}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select partner" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name || (u as Record<string, unknown>).email as string || u.id.slice(0, 8)}
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
            name="period_start"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Period Start</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="period_end"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Period End</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="fee_basis"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fee Basis</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || ""}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select how the fee is charged" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {FEE_BASES.map((b) => (
                      <SelectItem key={b.v} value={b.v}>
                        {b.l}
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
            name="agreed_fee"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Agreed Fee (₹{feeUnit(form.watch("fee_basis")) ? ` ${feeUnit(form.watch("fee_basis"))}` : ""})
                </FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder="0.00"
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                {autoFee !== null && Number(field.value) === autoFee && (
                  <p className="text-xs text-muted-foreground">
                    The standard fee for this service, before GST. Change it for a client&apos;s special rate.
                  </p>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="is_recurring"
          render={({ field }) => (
            <FormItem className="flex items-center gap-3">
              <FormLabel className="mt-0">Recurring Engagement</FormLabel>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {jobTypeLocked && (
          <p className="text-xs text-muted-foreground">
            {lockedJobType === "checklist"
              ? "Checklist job: its checklist loads automatically when the job is created."
              : "Simple job: one task, no checklist."}
          </p>
        )}
        {!jobTypeLocked && (
        <FormField
          control={form.control}
          name="needs_checklist"
          render={({ field }) => (
            <FormItem className="rounded-md border border-border p-3 space-y-2">
              <FormLabel>Does this job need a checklist? *</FormLabel>
              <p className="text-xs text-muted-foreground">
                {jobTypeLocked
                  ? `Set by the service: this one is ${lockedJobType === "checklist" ? "a checklist job" : "a simple job"}. The Managing Partner or Admin can change it in the Service Type Catalogue.`
                  : "Choose one. A one-step job such as a certificate needs no checklist: it becomes a single job that one person does and a reviewer approves."}
              </p>
              <FormControl>
                <RadioGroup
                  disabled={jobTypeLocked}
                  value={field.value === undefined ? "" : field.value ? "yes" : "no"}
                  onValueChange={(v) => field.onChange(v === "yes")}
                  className="flex flex-col sm:flex-row gap-3"
                >
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <RadioGroupItem value="yes" id="checklist-yes" />
                    Yes, use a checklist (audits and similar work)
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <RadioGroupItem value="no" id="checklist-no" />
                    No, it is a simple job
                  </label>
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        )}

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea rows={3} placeholder="Additional notes..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Team members */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Team Members</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ user_id: "", role_in_engagement: "" })}
            >
              <Plus className="size-4 mr-1" /> Add Member
            </Button>
          </div>
          {fields.map((f, idx) => (
            <div key={f.id} className="flex items-end gap-3">
              <FormField
                control={form.control}
                name={`team.${idx}.user_id`}
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel className={idx > 0 ? "sr-only" : undefined}>
                      Member
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select user" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.name || (u as Record<string, unknown>).email as string || u.id.slice(0, 8)}
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
                name={`team.${idx}.role_in_engagement`}
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel className={idx > 0 ? "sr-only" : undefined}>
                      Role
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Engagement Partner" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(idx)}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving..." : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}
