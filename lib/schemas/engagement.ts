import { z } from "zod";

export const engagementSchema = z.object({
  client_id: z.string().min(1, "Client is required"),
  service_type_id: z.string().min(1, "Service type is required"),
  billing_entity_id: z.string().min(1, "Billing entity is required"),
  period_start: z.string().optional(),
  period_end: z.string().optional(),
  fee_basis: z.string().optional(),
  agreed_fee: z.coerce.number().min(0).optional(),
  partner_in_charge_id: z.string().optional(),
  is_recurring: z.boolean().default(false),
  /** Must be chosen: false = a simple job with one task and no checklist (Gap #78). */
  needs_checklist: z.boolean({
    required_error: "Choose whether this job needs a checklist",
    invalid_type_error: "Choose whether this job needs a checklist",
  }),
  notes: z.string().optional(),
  team: z
    .array(
      z.object({
        user_id: z.string().min(1, "Team member is required"),
        role_in_engagement: z.string().optional(),
      })
    )
    .optional(),
});

export type EngagementFormValues = z.infer<typeof engagementSchema>;
