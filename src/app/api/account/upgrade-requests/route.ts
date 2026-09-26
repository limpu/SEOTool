import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  submitUpgradeRequest,
  DuplicatePendingRequestError,
  InvalidRequestedPackageError,
} from "@/lib/rbac/upgrade-requests";

export const upgradeRequestBodySchema = z.object({ requestedPackageId: z.string().uuid() });

/**
 * Stage 2 — real upgrade REQUEST submission (not a purchase/payment
 * endpoint). Writes one `pending` row into `package_upgrade_requests`;
 * approval/rejection is a separate, not-yet-built admin flow.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = upgradeRequestBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid requestedPackageId is required." }, { status: 400 });
  }

  try {
    const created = await submitUpgradeRequest(user.id, parsed.data.requestedPackageId);
    return NextResponse.json({ request: created }, { status: 201 });
  } catch (err) {
    if (err instanceof DuplicatePendingRequestError || err instanceof InvalidRequestedPackageError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
