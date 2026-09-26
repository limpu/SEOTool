import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getAdminUserOrNull } from "@/lib/rbac/require-admin";
import { getUserById, setUserSubscriptionPackage } from "@/lib/admin/user-queries";
import { assignPackageSchema } from "@/lib/validation/admin-package";

const idSchema = z.string().uuid();

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!(await getAdminUserOrNull(user?.id ?? null, "users", "edit"))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const existing = await getUserById(id);
  if (!existing) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = assignPackageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid subscription package." }, { status: 400 });
  }

  const updated = await setUserSubscriptionPackage(id, parsed.data.packageId);
  return NextResponse.json({ user: updated });
}
