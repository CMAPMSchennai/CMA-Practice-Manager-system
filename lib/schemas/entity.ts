import { z } from "zod";

export const entitySchema = z.object({
  name: z.string().min(1, "Name is required"),
  short_code: z.string().min(1, "Short code is required"),
  pan: z.string().optional(),
  gstin: z.string().optional(),
  address: z.string().optional(),
  can_attest: z.boolean().default(false),
  is_active: z.boolean().default(true),
});

export type EntityFormValues = z.infer<typeof entitySchema>;

export const bankAccountSchema = z.object({
  entity_id: z.string().min(1, "Entity is required"),
  bank_name: z.string().min(1, "Bank name is required"),
  account_number: z.string().min(1, "Account number is required"),
  ifsc_code: z.string().optional(),
  account_type: z.enum(["current", "savings", "overdraft"], {
    required_error: "Account type is required",
  }),
  opening_balance: z.coerce.number().optional(),
  is_active: z.boolean().default(true),
});

export type BankAccountFormValues = z.infer<typeof bankAccountSchema>;
