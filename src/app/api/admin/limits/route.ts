import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getAdminUserOrNull } from "@/lib/rbac/require-admin";
import { listLimitDefinitions, createLimitDefinition, ensureLimitCatalogSeed } from "@/lib/rbac/limit-admin";
import { limitDefinitionFormSchema } from "@/lib/validation/admin-limit";
import { getPgErrorCode } from "@/lib/db/pg-error";

/** Reference-table list for the /admin/limits screen. `packages`/`view` required (limits are configured as part of package management). */
export async function GET() {
  const user = await getCurrentUser();
  if (!(await getAdminUserOrNull(user?.id ?? null, "packages", "view"))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  await ensureLimitCatalogSeed();
  const definitions = await listLimitDefinitions();
  return NextResponse.json({ limitDefinitions: definitions });
}

/** Creates a new limit_definitions row (a new "resource" that can be capped). `packages`/`create` required. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!(await getAdminUserOrNull(user?.id ?? null, "packages", "create"))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = limitDefinitionFormSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const firstError = Object.values(fieldErrors)[0]?.[0] ?? "Invalid input.";
    return NextResponse.json({ error: firstError, fieldErrors }, { status: 400 });
  }

  try {
    const def = await createLimitDefinition(parsed.data);
    return NextResponse.json({ limitDefinition: def }, { status: 201 });
  } catch (err) {
    if (getPgErrorCode(err) === "23505") {
      return NextResponse.json({ error: "A limit definition with this key already exists." }, { status: 409 });
    }
    throw err;
  }
}
