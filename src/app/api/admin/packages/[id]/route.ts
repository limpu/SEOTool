import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getAdminUserOrNull } from "@/lib/rbac/require-admin";
import {
  getPackageWithFeatures,
  updatePackage,
  deactivatePackage,
  activatePackage,
} from "@/lib/rbac/package-admin";
import { packageFormSchema } from "@/lib/validation/admin-package";
import { getPgErrorCode } from "@/lib/db/pg-error";

const idSchema = z.string().uuid();

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!(await getAdminUserOrNull(user?.id ?? null, "packages", "view"))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Package not found." }, { status: 404 });
  }

  const result = await getPackageWithFeatures(id);
  if (!result) {
    return NextResponse.json({ error: "Package not found." }, { status: 404 });
  }
  return NextResponse.json(result);
}

/** Updates a package's Name/Description/Price/Currency/Billing Period/Status. `packages`/`edit` required. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!(await getAdminUserOrNull(user?.id ?? null, "packages", "edit"))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Package not found." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = packageFormSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const firstError = Object.values(fieldErrors)[0]?.[0] ?? "Invalid input.";
    return NextResponse.json({ error: firstError, fieldErrors }, { status: 400 });
  }

  try {
    const result = await updatePackage(id, parsed.data);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
  } catch (err) {
    if (getPgErrorCode(err) === "23505") {
      return NextResponse.json({ error: "A package with this name already exists." }, { status: 409 });
    }
    throw err;
  }

  const updated = await getPackageWithFeatures(id);
  return NextResponse.json(updated);
}

/**
 * "Delete" for a package always means Deactivate, never a real row delete
 * (read-v2.md §11 lists "Activate, Deactivate", not "Delete") — a package
 * still assigned to users must never disappear out from under them. Pass
 * `{status: "active"}` in the body to reactivate through this same route
 * instead of DELETE.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!(await getAdminUserOrNull(user?.id ?? null, "packages", "delete"))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Package not found." }, { status: 404 });
  }

  const result = await deactivatePackage(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}

const reactivateSchema = z.object({ status: z.literal("active") });

/** Reactivates a previously-deactivated package. `packages`/`edit` required. */
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
  const parsed = reactivateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const result = await activatePackage(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
