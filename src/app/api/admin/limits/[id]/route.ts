import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getAdminUserOrNull } from "@/lib/rbac/require-admin";
import {
  getLimitDefinition,
  updateLimitDefinition,
  deactivateLimitDefinition,
  activateLimitDefinition,
} from "@/lib/rbac/limit-admin";
import { limitDefinitionFormSchema } from "@/lib/validation/admin-limit";
import { getPgErrorCode } from "@/lib/db/pg-error";

const idSchema = z.string().uuid();

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!(await getAdminUserOrNull(user?.id ?? null, "packages", "view"))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Limit definition not found." }, { status: 404 });
  }

  const def = await getLimitDefinition(id);
  if (!def) return NextResponse.json({ error: "Limit definition not found." }, { status: 404 });
  return NextResponse.json({ limitDefinition: def });
}

/** Updates a limit definition's Name/Description/Unit/Period/Active state. `packages`/`edit` required. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!(await getAdminUserOrNull(user?.id ?? null, "packages", "edit"))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Limit definition not found." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = limitDefinitionFormSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const firstError = Object.values(fieldErrors)[0]?.[0] ?? "Invalid input.";
    return NextResponse.json({ error: firstError, fieldErrors }, { status: 400 });
  }

  try {
    const result = await updateLimitDefinition(id, parsed.data);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  } catch (err) {
    if (getPgErrorCode(err) === "23505") {
      return NextResponse.json({ error: "A limit definition with this key already exists." }, { status: 409 });
    }
    throw err;
  }

  const updated = await getLimitDefinition(id);
  return NextResponse.json({ limitDefinition: updated });
}

/** "Delete" here always means Deactivate, same convention as packages — `packages`/`delete` required. Pass `{active: true}` to reactivate through this same route. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!(await getAdminUserOrNull(user?.id ?? null, "packages", "delete"))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Limit definition not found." }, { status: 404 });
  }

  const result = await deactivateLimitDefinition(id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}

const reactivateSchema = z.object({ active: z.literal(true) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!(await getAdminUserOrNull(user?.id ?? null, "packages", "edit"))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Limit definition not found." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = reactivateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const result = await activateLimitDefinition(id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
