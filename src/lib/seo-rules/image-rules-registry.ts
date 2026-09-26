import type { RuleDefinition } from "./rules-registry";

/**
 * Image Analysis rules (Phase 10). Missing/empty alt text is already
 * covered by Phase 7's ONPAGE_IMAGE_MISSING_ALT (now correctly
 * distinguishing an absent alt attribute from an intentionally empty
 * alt="" on a decorative image — a fix made as part of this phase since
 * Section 28 explicitly calls out "decorative image handling").
 */
export const IMAGE_RULES: RuleDefinition[] = [
  {
    ruleKey: "IMAGE_MISSING_DIMENSIONS",
    category: "on_page",
    severity: "medium",
    title: "Image missing width/height attributes",
    description: "An image has no explicit width and height attributes.",
    recommendation: "Add explicit width and height attributes so the browser can reserve space before the image loads.",
    fixExample: '<img src="photo.jpg" alt="..." width="800" height="600">',
    impact: "Missing dimensions are a common cause of layout shift (CLS) as images load.",
  },
  {
    ruleKey: "IMAGE_LEGACY_FORMAT",
    category: "on_page",
    severity: "low",
    title: "Image uses a legacy format",
    description: "An image is served as JPEG, PNG, or GIF rather than a modern format.",
    recommendation: "Consider converting to WebP or AVIF for better compression at similar quality.",
    impact: "Modern formats typically produce smaller files than JPEG/PNG/GIF at comparable visual quality.",
  },
  {
    ruleKey: "IMAGE_MISSING_SRCSET",
    category: "on_page",
    severity: "low",
    title: "Large image without responsive srcset",
    description: "A sizeable image (declared width ≥ 600px) has no srcset attribute.",
    recommendation: "Add a srcset (and sizes) attribute so smaller devices don't download a full-size image.",
    fixExample: '<img src="photo.jpg" srcset="photo-480.jpg 480w, photo-800.jpg 800w" sizes="(max-width: 600px) 480px, 800px" alt="...">',
    impact: "Without srcset, mobile devices download the same large image as desktop, wasting bandwidth.",
  },
  {
    ruleKey: "IMAGE_LARGE_FILE_SIZE",
    category: "performance",
    severity: "medium",
    title: "Unusually large image file",
    description: "An image file exceeds 1MB. This is a rough heuristic, not a universal limit — a large hero image at high resolution may reasonably be this size; a small icon should never be.",
    recommendation: "Compress the image, or verify its dimensions actually require this file size.",
    impact: "Large image payloads are a common cause of slow page loads, especially on mobile networks.",
  },
  {
    ruleKey: "IMAGE_LCP_LAZY_LOADED",
    category: "performance",
    severity: "high",
    title: "Likely LCP image is lazy-loaded",
    description: "The first image on the page (the most likely Largest Contentful Paint candidate) has loading=\"lazy\".",
    recommendation: "Remove lazy loading from above-the-fold images, especially the likely LCP element.",
    impact: "Lazy-loading the LCP image delays its load, directly harming the LCP Core Web Vital.",
  },
];

export const IMAGE_RULES_BY_KEY = new Map(IMAGE_RULES.map((r) => [r.ruleKey, r]));
