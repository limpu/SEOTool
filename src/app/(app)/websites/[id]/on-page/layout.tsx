import type { ReactNode } from "react";

import { ModuleReportLayout } from "../_module-report/chrome";

/**
 * Shared chrome (report header + tab bar) for every On-Page SEO route.
 * All of the logic lives in `ModuleReportLayout` — see
 * `../_module-report/chrome.tsx`.
 */
export default async function OnPageSeoLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <ModuleReportLayout moduleKey="on_page" websiteIdParam={id}>
      {children}
    </ModuleReportLayout>
  );
}
