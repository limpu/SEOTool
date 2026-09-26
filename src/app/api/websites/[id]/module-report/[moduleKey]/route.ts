import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getWebsiteForUser } from "@/lib/websites/queries";
import { computeWebsiteModuleReport, type ModuleKey } from "@/lib/module-reports/compute";

const idSchema = z.string().uuid();
const moduleKeySchema = z.enum(["technical", "on_page", "schema", "sitemap", "robots"]);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; moduleKey: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id, moduleKey: rawModuleKey } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Website not found." }, { status: 404 });
  }

  const moduleKeyParse = moduleKeySchema.safeParse(rawModuleKey);
  if (!moduleKeyParse.success) {
    return NextResponse.json({ error: "Unknown module." }, { status: 404 });
  }

  const site = await getWebsiteForUser(user.id, id);
  if (!site) {
    return NextResponse.json({ error: "Website not found." }, { status: 404 });
  }

  const report = await computeWebsiteModuleReport(site.id, moduleKeyParse.data as ModuleKey);

  return NextResponse.json({ report });
}
