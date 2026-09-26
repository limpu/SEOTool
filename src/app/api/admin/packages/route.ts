import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getAdminUserOrNull } from "@/lib/rbac/require-admin";
import { listPackagesWithCounts, createPackage } from "@/lib/rbac/package-admin";
import { packageFormSchema } from "@/lib/validation/admin-package";
import { ensureRbacSeed } from "@/lib/rbac/seed";
import { getPgErrorCode } from "@/lib/db/pg-error";

/** Package list for the /admin/packages screen. `packages`/`view` required. */
export async function GET() {
  const user = await getCurrentUser();
  if (!(await getAdminUserOrNull(user?.id ?? null, "packages", "view"))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const packageList = await listPackagesWithCounts();
  return NextResponse.json({ packages: packageList });
}

/** Creates a new subscription package (read-v2.md §11). `packages`/`create` required. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!(await getAdminUserOrNull(user?.id ?? null, "packages", "create"))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  await ensureRbacSeed();

  const body = await req.json().catch(() => null);
  const parsed = packageFormSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const firstError = Object.values(fieldErrors)[0]?.[0] ?? "Invalid input.";
    return NextResponse.json({ error: firstError, fieldErrors }, { status: 400 });
  }

  try {
    const pkg = await createPackage(parsed.data);
    return NextResponse.json({ package: pkg }, { status: 201 });
  } catch (err) {
    if (getPgErrorCode(err) === "23505") {
      return NextResponse.json({ error: "A package with this name already exists." }, { status: 409 });
    }
    throw err;
  }
}
