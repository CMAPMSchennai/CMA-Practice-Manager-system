import { z } from "zod";

export const referenceDataSchema = z.object({
  type: z.string().min(1, "Type is required"),
  code: z.string().min(1, "Code is required"),
  label: z.string().min(1, "Label is required"),
  sort_order: z.coerce.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
  metadata: z.any().optional(),
});

export type ReferenceDataFormValues = z.infer<typeof referenceDataSchema>;
