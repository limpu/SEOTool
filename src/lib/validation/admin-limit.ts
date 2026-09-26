import { z } from "zod";

const periodTypeEnum = z.enum(["day", "week", "month", "lifetime"]);

export const limitDefinitionFormSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, "Please enter a key.")
    .max(100, "Key is too long.")
    .regex(/^[a-z0-9_]+$/, "Key must be lowercase letters, numbers, and underscores only (e.g. max_websites)."),
  name: z.string().min(1, "Please enter a name.").max(255, "Name is too long.").trim(),
  description: z
    .string()
    .max(2000, "Description is too long.")
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  unit: z.string().min(1, "Please enter a unit.").max(50, "Unit is too long.").trim().default("count"),
  periodType: periodTypeEnum.default("month"),
  active: z.boolean().default(true),
});

export type LimitDefinitionFormInput = z.infer<typeof limitDefinitionFormSchema>;

// Set Value / Set Period (read.md §12): a package's assigned limit for one
// resource. `limitValue: null` means unlimited — explicitly accepted, not
// coerced from an "unlimited" checkbox at the validation layer (the UI does
// that translation before it ever calls the API).
export const packageLimitFormSchema = z.object({
  limitDefinitionId: z.string().uuid("Invalid limit definition id."),
  limitValue: z
    .number({ error: "Enter a number or leave blank for unlimited." })
    .int("Limit value must be a whole number.")
    .min(0, "Limit value cannot be negative.")
    .nullable(),
  periodType: periodTypeEnum,
});

export type PackageLimitFormInput = z.infer<typeof packageLimitFormSchema>;
