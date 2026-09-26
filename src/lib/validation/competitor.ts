import { z } from "zod";

const urlSchema = z
  .string()
  .min(1, "Please enter the competitor's website URL.")
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

export const addCompetitorSchema = z.object({
  name: z.string().min(1, "Please enter a name for this competitor.").max(255, "Name is too long.").trim(),
  url: urlSchema,
});

export type AddCompetitorInput = z.infer<typeof addCompetitorSchema>;
