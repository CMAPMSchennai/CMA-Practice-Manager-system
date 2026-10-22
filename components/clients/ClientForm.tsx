"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CreatableCombobox } from "@/components/ui/creatable-combobox";

const clientSchema = z.object({
  name: z.string().min(1, "Client name is required"),
  trade_name: z.string().optional(),
  entity_type_id: z.string().optional(),
  pan: z.string().optional(),
  gstin: z.string().optional(),
  address: z.string().optional(),
  contact_person: z.string().optional(),
  contact_email: z.string().email("Invalid email").optional().or(z.literal("")),
  contact_phone: z.string().optional(),
  group_id: z.string().optional(),
  partner_in_charge_id: z.string().optional(),
  financial_year_end_month: z.string().optional(),
  notes: z.string().optional(),
});

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

type ClientFormValues = z.infer<typeof clientSchema>;

interface User {
  id: string;
  name: string | null;
  email: string | null;
}

interface Group {
  id: string;
  name: string;
}

interface ClientFormProps {
  onSuccess?: (client: { id: string; client_code: string; onboarding_status: string }) => void;
  onCancel?: () => void;
  defaultValues?: Partial<ClientFormValues>;
}

export function ClientForm({ onSuccess, onCancel, defaultValues }: ClientFormProps) {
  const [partners, setPartners] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name: "",
      trade_name: "",
      entity_type_id: "",
      pan: "",
      gstin: "",
      address: "",
      contact_person: "",
      contact_email: "",
      contact_phone: "",
      group_id: "",
      partner_in_charge_id: "",
      financial_year_end_month: "3",
      notes: "",
      ...defaultValues,
    },
  });

  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((usersData) => {
        setPartners(Array.isArray(usersData?.users) ? usersData.users : []);
      })
      .catch(() => {});
  }, []);

  async function onSubmit(values: ClientFormValues) {
    setSubmitting(true);
    try {
      const payload = {
        ...values,
        entity_type_id: values.entity_type_id || null,
        group_id: values.group_id || null,
        partner_in_charge_id: values.partner_in_charge_id || null,
        financial_year_end_month: values.financial_year_end_month ? Number(values.financial_year_end_month) : null,
      };
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Failed to create client");
        return;
      }
      toast.success(`Client created — ${json.client?.client_code}`);
      onSuccess?.(json.client);
    } catch {
      toast.error("Failed to create client");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Client Name *</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Acme Pvt Ltd" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="trade_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Trade Name</FormLabel>
                <FormControl>
                  <Input placeholder="DBA / trading name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="entity_type_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Entity Type</FormLabel>
                <FormControl>
                  <CreatableCombobox
                    category="entity_type"
                    value={field.value || ""}
                    onChange={(val) => field.onChange(val || "")}
                    valueMode="id"
                    placeholder="Select or add entity type…"
                  />
                </FormControl>
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
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select partner" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {partners.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name ?? p.email ?? p.id}
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
            name="pan"
            render={({ field }) => (
              <FormItem>
                <FormLabel>PAN</FormLabel>
                <FormControl>
                  <Input placeholder="AAAAA0000A" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="gstin"
            render={({ field }) => (
              <FormItem>
                <FormLabel>GSTIN</FormLabel>
                <FormControl>
                  <Input placeholder="22AAAAA0000A1Z5" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="contact_person"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contact Person</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Ramesh Kumar" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="contact_email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contact Email</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="e.g. contact@client.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="contact_phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contact Phone</FormLabel>
                <FormControl>
                  <Input placeholder="98XXXXXXXX" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="financial_year_end_month"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Financial year ends in</FormLabel>
                <FormControl>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                    value={field.value ?? "3"}
                    onChange={(e) => field.onChange(e.target.value)}
                  >
                    {MONTHS.map((name, i) => (
                      <option key={name} value={String(i + 1)}>
                        {name}{i === 2 ? " (Indian financial year)" : ""}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <p className="text-xs text-muted-foreground">
                  Sets the periods for yearly, half-yearly and quarterly work. Change it for clients whose year does not end in March.
                </p>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Address</FormLabel>
              <FormControl>
                <Textarea placeholder="Registered address" rows={2} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea placeholder="Any internal notes…" rows={2} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-3">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create Client"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
