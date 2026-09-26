import { Badge } from "@/components/ui/badge";
import type { CheckStatus } from "@/lib/install/types";
import {
  SECTION_STATUS_BADGE,
  SECTION_STATUS_LABEL,
  type SectionStatus,
} from "@/lib/install/wizard-steps";

/**
 * The installer's status vocabulary, rendered.
 *
 * Four words, no synonyms anywhere in the wizard:
 *   ✓ Ready · ⚠ Action Required · ○ Optional · ✕ Failed
 *
 * Both badges go through the design system's `Badge`, which always renders an
 * ICON BESIDE THE LABEL for a status variant. That is the point: colour never
 * carries the meaning on its own here. Several of the status hues sit below
 * 3:1 on their own subtle tint by design, so the badge has to survive
 * greyscale, colour-vision differences and a printed page — which it does,
 * because the word is always there.
 */

export function SectionStatusBadge({ status }: { status: SectionStatus }) {
  return (
    <Badge variant={SECTION_STATUS_BADGE[status]}>{SECTION_STATUS_LABEL[status]}</Badge>
  );
}

/**
 * A single check's status. `unknown` gets its own badge rather than borrowing
 * a pass or fail colour it has not earned — "we could not measure this" and
 * "we measured it and it is broken" are different facts.
 */
export function CheckStatusBadge({ status }: { status: CheckStatus }) {
  switch (status) {
    case "pass":
      return <Badge variant="good">Ready</Badge>;
    case "warn":
      return <Badge variant="warning">Action Required</Badge>;
    case "fail":
      return <Badge variant="critical">Failed</Badge>;
    case "optional":
      return <Badge variant="neutral">Optional</Badge>;
    case "unknown":
    default:
      return <Badge variant="unknown">Not measured</Badge>;
  }
}
