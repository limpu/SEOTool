/**
 * Phase 27 — SERP: reasonable, non-exhaustive, extensible checklist of SERP
 * feature types a user can manually observe and log against a rank-check.
 * This is intentionally a plain string list (not a DB enum) — see the schema
 * comment in `src/lib/db/schema/index.ts` — so it can grow without a
 * migration. The API layer validates every submitted value against this
 * list; unknown values are rejected, not silently stored.
 */
export const SERP_FEATURE_OPTIONS = [
  "featured_snippet",
  "people_also_ask",
  "local_pack",
  "image_pack",
  "video_carousel",
  "shopping_results",
  "knowledge_panel",
  "site_links",
  "top_stories",
  "reviews_snippet",
  "ai_overview",
] as const;

export type SerpFeature = (typeof SERP_FEATURE_OPTIONS)[number];

export const SERP_FEATURE_LABELS: Record<SerpFeature, string> = {
  featured_snippet: "Featured Snippet",
  people_also_ask: "People Also Ask",
  local_pack: "Local Pack",
  image_pack: "Image Pack",
  video_carousel: "Video Carousel",
  shopping_results: "Shopping Results",
  knowledge_panel: "Knowledge Panel",
  site_links: "Sitelinks",
  top_stories: "Top Stories",
  reviews_snippet: "Reviews Snippet",
  ai_overview: "AI Overview",
};

export function isValidSerpFeature(value: string): value is SerpFeature {
  return (SERP_FEATURE_OPTIONS as readonly string[]).includes(value);
}
