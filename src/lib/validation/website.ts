import { z } from "zod";

/**
 * Normalizes a URL's host into a comparable domain: lowercase, no "www.",
 * no trailing dot. Used both for duplicate-detection and display.
 */
export function normalizeDomain(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
}

const urlSchema = z
  .string()
  .min(1, "Please enter a website URL.")
  .transform((v) => v.trim())
  .pipe(
    z
      .string()
      .refine(
        (v) => {
          try {
            const u = new URL(v);
            return u.protocol === "http:" || u.protocol === "https:";
          } catch {
            return false;
          }
        },
        { message: "Please enter a valid http:// or https:// URL." }
      )
  );

export const createWebsiteSchema = z.object({
  name: z.string().min(1, "Please enter a website name.").max(255, "Name is too long.").trim(),
  url: urlSchema,
  country: z
    .string()
    .trim()
    .max(10, "Country code is too long.")
    .optional()
    .transform((v) => (v ? v.toUpperCase() : undefined)),
});

export const updateWebsiteSchema = z.object({
  name: z.string().min(1, "Please enter a website name.").max(255, "Name is too long.").trim(),
  country: z
    .string()
    .trim()
    .max(10, "Country code is too long.")
    .optional()
    .transform((v) => (v ? v.toUpperCase() : undefined)),
  maxPages: z
    .number()
    .int("Max pages must be a whole number.")
    .min(1, "Max pages must be at least 1.")
    .max(10000, "Max pages cannot exceed 10,000."),
  maxDepth: z
    .number()
    .int("Max depth must be a whole number.")
    .min(1, "Max depth must be at least 1.")
    .max(50, "Max depth cannot exceed 50."),
});

export type CreateWebsiteInput = z.infer<typeof createWebsiteSchema>;
export type UpdateWebsiteInput = z.infer<typeof updateWebsiteSchema>;
