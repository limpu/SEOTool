import type { ExtractedImage } from "@/lib/crawler/extract";
import type { RuleViolation } from "./on-page";

const LARGE_IMAGE_SIZE_BYTES = 1024 * 1024; // 1MB — a rough heuristic, not a universal limit (Section 28)
const RESPONSIVE_WIDTH_THRESHOLD = 600;
const LEGACY_FORMAT_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif"]);

function getExtension(url: string): string | null {
  try {
    const path = new URL(url).pathname;
    const match = path.match(/\.([a-z0-9]+)$/i);
    return match ? match[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Evaluates dimension/format/responsive/LCP-lazy-loading issues for one
 * page's images. `images` must be in document order — the first entry is
 * treated as the likely LCP candidate. File-size checking is separate
 * (`evaluateImageFileSizeIssues`) since it needs live-fetched data.
 */
export function evaluateImageIssues(images: ExtractedImage[]): RuleViolation[] {
  const violations: RuleViolation[] = [];
  if (images.length === 0) return violations;

  const missingDimensions = images.filter((img) => img.width === null || img.height === null);
  if (missingDimensions.length > 0) {
    violations.push({
      ruleKey: "IMAGE_MISSING_DIMENSIONS",
      evidence: `${missingDimensions.length} of ${images.length} image(s) missing width/height attributes.`,
    });
  }

  const legacyFormat = images.filter((img) => {
    const ext = getExtension(img.url);
    return ext !== null && LEGACY_FORMAT_EXTENSIONS.has(ext);
  });
  if (legacyFormat.length > 0) {
    violations.push({
      ruleKey: "IMAGE_LEGACY_FORMAT",
      evidence: `${legacyFormat.length} image(s) served as JPEG/PNG/GIF.`,
    });
  }

  const missingSrcset = images.filter(
    (img) => img.width !== null && img.width >= RESPONSIVE_WIDTH_THRESHOLD && !img.hasSrcset
  );
  if (missingSrcset.length > 0) {
    violations.push({
      ruleKey: "IMAGE_MISSING_SRCSET",
      evidence: `${missingSrcset.length} image(s) ≥${RESPONSIVE_WIDTH_THRESHOLD}px wide with no srcset.`,
    });
  }

  const likelyLcpImage = images[0];
  if (likelyLcpImage.lazyLoaded) {
    violations.push({
      ruleKey: "IMAGE_LCP_LAZY_LOADED",
      evidence: `First image on the page (${likelyLcpImage.url}) has loading="lazy".`,
    });
  }

  return violations;
}

/**
 * Evaluates file-size issues using a map of image URL -> byte size, built
 * from a capped set of live Content-Length checks (see run-crawl.ts). An
 * image absent from the map simply wasn't checked (budget exhausted) — that
 * is not the same as "known to be fine" and isn't flagged either way.
 */
export function evaluateImageFileSizeIssues(
  images: ExtractedImage[],
  sizeByUrl: Map<string, number>
): RuleViolation[] {
  const large = images.filter((img) => {
    const size = sizeByUrl.get(img.url);
    return size !== undefined && size > LARGE_IMAGE_SIZE_BYTES;
  });
  if (large.length === 0) return [];

  return [
    {
      ruleKey: "IMAGE_LARGE_FILE_SIZE",
      evidence: `${large.length} image(s) exceed 1MB: ${large
        .map((img) => `${img.url} (${Math.round((sizeByUrl.get(img.url) ?? 0) / 1024)}KB)`)
        .join(", ")}`,
    },
  ];
}
