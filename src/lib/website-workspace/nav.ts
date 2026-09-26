import type { PermissionAction } from "@/lib/rbac/feature-catalog";

/**
 * Website-workspace navigation catalog — Phase 35 (read.md). Each entry maps
 * one sub-route under /websites/[id]/<slug> to the feature key that governs
 * it (see feature-catalog.ts) and whether a real panel/report is actually
 * wired up. `implemented: false` entries render a "Coming Soon" state and
 * are shown disabled in the sidebar regardless of permission — they are not
 * hidden, so their existence is still discoverable, matching the old
 * "Soon" badge behavior.
 *
 * This is the SINGLE source of truth for the workspace sidebar; per-route
 * `page.tsx` files re-derive their own feature key from here (by slug) so
 * there is no separate hard-coded permission list to drift out of sync.
 */
export type WorkspaceGroup = {
  title: string;
  items: WorkspaceNavItem[];
};

export type WorkspaceNavItem = {
  slug: string;
  label: string;
  featureKey: string;
  action: PermissionAction;
  implemented: boolean;
};

export const WORKSPACE_NAV: WorkspaceGroup[] = [
  {
    title: "Overview",
    items: [
      { slug: "overview", label: "Overview", featureKey: "site_audit", action: "view", implemented: true },
    ],
  },
  {
    title: "SEO",
    items: [
      { slug: "site-audit", label: "Site Audit", featureKey: "site_audit", action: "view", implemented: true },
      { slug: "technical", label: "Technical SEO", featureKey: "technical_seo", action: "view", implemented: true },
      { slug: "on-page", label: "On-Page SEO", featureKey: "on_page_seo", action: "view", implemented: true },
      { slug: "pagespeed", label: "PageSpeed", featureKey: "pagespeed", action: "view", implemented: true },
      { slug: "schema", label: "Schema", featureKey: "schema", action: "view", implemented: true },
      { slug: "sitemap", label: "Sitemap", featureKey: "sitemap", action: "view", implemented: true },
      { slug: "robots", label: "Robots.txt", featureKey: "robots_txt", action: "view", implemented: true },
    ],
  },
  {
    title: "AI Search",
    items: [
      { slug: "ai-overview", label: "AI Search Intelligence", featureKey: "ai_overview", action: "view", implemented: true },
      { slug: "eeat", label: "E-E-A-T / Trust", featureKey: "eeat", action: "view", implemented: true },
    ],
  },
  {
    title: "Research",
    items: [
      { slug: "keywords", label: "Keywords / SERP", featureKey: "serp_tracking", action: "view", implemented: true },
      { slug: "competitors", label: "Competitors", featureKey: "competitors", action: "view", implemented: true },
    ],
  },
  {
    title: "Performance",
    items: [
      { slug: "search-console", label: "Search Console", featureKey: "search_console", action: "view", implemented: true },
      { slug: "google-analytics", label: "Google Analytics", featureKey: "google_analytics", action: "view", implemented: true },
    ],
  },
  {
    title: "Reports",
    items: [
      { slug: "reports", label: "Reports & Re-test", featureKey: "reports", action: "view", implemented: true },
    ],
  },
];

export const ALL_WORKSPACE_ITEMS: WorkspaceNavItem[] = WORKSPACE_NAV.flatMap((g) => g.items);

export function getWorkspaceItem(slug: string): WorkspaceNavItem | undefined {
  return ALL_WORKSPACE_ITEMS.find((i) => i.slug === slug);
}
