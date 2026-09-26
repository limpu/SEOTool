import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getAdminUserOrNull } from "@/lib/rbac/require-admin";
import { listUsers, getUserById } from "@/lib/admin/user-queries";
import { createAdminUserSchema } from "@/lib/validation/admin-user";
import { hashPassword } from "@/lib/auth";
import { getPgErrorCode } from "@/lib/db/pg-error";
import { db } from "@/lib/db";
import { users, userRoles, roles } from "@/lib/db/schema";
import { ensureRbacSeed, USER_ROLE_KEY } from "@/lib/rbac/seed";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!(await getAdminUserOrNull(user?.id ?? null, "users", "view"))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? undefined;
  const statusParam = searchParams.get("status");
  const status =
    statusParam === "active" || statusParam === "suspended" || statusParam === "deleted"
      ? statusParam
      : undefined;
  const roleId = searchParams.get("roleId") ?? undefined;
  const page = Number(searchParams.get("page") ?? "1") || 1;

  const result = await listUsers({ search, status, roleId, page, pageSize: 25 });
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!(await getAdminUserOrNull(user?.id ?? null, "users", "create"))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createAdminUserSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const firstError = Object.values(fieldErrors)[0]?.[0] ?? "Invalid input.";
    return NextResponse.json({ error: firstError, fieldErrors }, { status: 400 });
  }

  const { name, email, password, roleId } = parsed.data;
  const passwordHash = await hashPassword(password);

  let created;
  try {
    [created] = await db
      .insert(users)
      .values({
        name,
        email,
        passwordHash,
        // Admin-created accounts are pre-verified — no email OTP loop for
        // an account an admin is creating directly on someone's behalf.
        emailVerified: true,
        emailVerifiedAt: new Date(),
      })
      .returning({ id: users.id });
  } catch (err) {
    if (getPgErrorCode(err) === "23505") {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }
    throw err;
  }

  await ensureRbacSeed();
  let effectiveRoleId = roleId;
  if (!effectiveRoleId) {
    const [defaultRole] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, USER_ROLE_KEY)).limit(1);
    effectiveRoleId = defaultRole?.id;
  }
  if (effectiveRoleId) {
    await db.insert(userRoles).values({ userId: created.id, roleId: effectiveRoleId });
  }

  const full = await getUserById(created.id);
  return NextResponse.json({ user: full }, { status: 201 });
}
