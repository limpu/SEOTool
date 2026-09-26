"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  settings: "Settings",
  profile: "Profile",
  websites: "Websites",
  new: "Add Website",
  overview: "Overview",
  "site-audit": "Site Audit",
  technical: "Technical SEO",
  "on-page": "On-Page SEO",
  pagespeed: "PageSpeed",
  schema: "Schema",
  sitemap: "Sitemap",
  robots: "Robots.txt",
  "ai-overview": "AI Search Intelligence",
  eeat: "E-E-A-T / Trust",
  keywords: "Keywords / SERP",
  competitors: "Competitors",
  "search-console": "Search Console",
  reports: "Reports",
};

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) return null;

  const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

  let href = "";
  const crumbs = segments.map((segment) => {
    href += `/${segment}`;
    const label = LABELS[segment] ?? (isUuid(segment) ? "Details" : segment);
    return { href, label };
  });

  return (
    <nav aria-label="Breadcrumb" className="px-4 pt-4 text-sm text-muted sm:px-6">
      <ol className="flex flex-wrap items-center gap-1.5">
        {crumbs.map((crumb, i) => (
          <li key={crumb.href} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden="true">/</span>}
            {i === crumbs.length - 1 ? (
              <span className="font-medium text-secondary-foreground" aria-current="page">
                {crumb.label}
              </span>
            ) : (
              <Link href={crumb.href} className="hover:text-secondary-foreground hover:underline">
                {crumb.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
