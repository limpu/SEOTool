import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getAdminUserOrNull } from "@/lib/rbac/require-admin";
import { listPackageLimits, setPackageLimit } from "@/lib/rbac/limit-admin";
import { packageLimitFormSchema } from "@/lib/validation/admin-limit";

const idSchema = z.string().uuid();

/** Limits currently assigned to a package. `packages`/`view` required. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!(await getAdminUserOrNull(user?.id ?? null, "packages", "view"))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Package not found." }, { status: 404 });
  }

  const limits = await listPackageLimits(id);
  return NextResponse.json({ packageLimits: limits });
}

/**
 * Add/Edit one limit for a package (Select Resource -> Set Value -> Set
 * Period -> Save, read.md §12). Upserts on (packageId, limitDefinitionId),
 * so this same route handles both "add a new limit" and "edit an existing
 * one's value/period" — the workflow diagram doesn't distinguish them and
 * neither does the unique constraint on package_limits. `packages`/`edit`
 * required.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!(await getAdminUserOrNull(user?.id ?? null, "packages", "edit"))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Package not found." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = packageLimitFormSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const firstError = Object.values(fieldErrors)[0]?.[0] ?? "Invalid input.";
    return NextResponse.json({ error: firstError, fieldErrors }, { status: 400 });
  }

  const result = await setPackageLimit(id, parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  const limits = await listPackageLimits(id);
  return NextResponse.json({ packageLimits: limits }, { status: 201 });
}
