import { z } from "zod";

/**
 * Phase 37 — manual "add a file URL" input.
 *
 * The URL rule is the SAME shape this codebase already uses for website and
 * competitor URLs (`src/lib/validation/website.ts`, `competitor.ts`): trim,
 * must parse as a URL, must be http/https. That protocol check is a FIRST
 * gate for a clear error message, not the security boundary — the real SSRF
 * decision (DNS resolution, private/loopback/link-local rejection,
 * connection pinning, per-hop redirect re-validation) belongs to `safeFetch`,
 * which every fetch in this feature goes through.
 */
const urlSchema = z
  .string()
  .min(1, "Please enter the file URL.")
  .max(2048, "That URL is too long.")
  .transform((v) => v.trim())
  .pipe(
    z.string().refine(
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

export const siteFileTypeSchema = z.enum(["sitemap_xml", "sitemap_html", "robots_txt", "llms_txt"], {
  message: "Please choose a file type.",
});

export const SITE_FILE_TYPES = siteFileTypeSchema.options;

export const addSiteFileSchema = z.object({
  type: siteFileTypeSchema,
  url: urlSchema,
});

export type AddSiteFileInput = z.infer<typeof addSiteFileSchema>;
