/**
 * Central feature catalog — read-v2.md §10/§11: "Do not scatter hard-coded
 * permissions throughout the application. Use: features / permissions /
 * roles / role_permissions / user_roles." This file is the single place new
 * features get registered; everything else (permission seeding, the role
 * editor's matrix UI, access checks) reads from here rather than
 * duplicating the list.
 *
 * Keys are stable identifiers used in code (`hasPermission(user, "users", "edit")`)
 * — never rename an existing key, add a new one instead, since role_permissions
 * rows reference features by their seeded key.
 */

export const PERMISSION_ACTIONS = ["view", "create", "edit", "delete", "export"] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export type FeatureDefinition = {
  key: string;
  name: string;
  description: string;
  sortOrder: number;
};

// Matches read-v2.md §10's example matrix. Modules not yet built (On-Page SEO,
// PageSpeed, GEO, AEO, ...) are still registered here — a feature existing in
// the catalog is not a claim that its UI exists yet, only that access to it
// can be governed once it does. This avoids re-plumbing RBAC later.
export const FEATURE_CATALOG: FeatureDefinition[] = [
  { key: "dashboard", name: "Dashboard", description: "Main dashboard overview.", sortOrder: 10 },
  { key: "users", name: "Users", description: "Admin user management.", sortOrder: 20 },
  { key: "roles", name: "Roles", description: "Role & permission management.", sortOrder: 30 },
  { key: "packages", name: "Packages", description: "Subscription package management.", sortOrder: 35 },
  { key: "websites", name: "Websites", description: "Website management.", sortOrder: 40 },
  { key: "site_audit", name: "Site Audit", description: "Crawls and audit runs.", sortOrder: 50 },
  { key: "on_page_seo", name: "On-Page SEO", description: "On-page SEO analysis.", sortOrder: 60 },
  { key: "technical_seo", name: "Technical SEO", description: "Technical SEO analysis.", sortOrder: 70 },
  { key: "pagespeed", name: "PageSpeed", description: "Performance/Lighthouse analysis.", sortOrder: 80 },
  { key: "schema", name: "Schema", description: "Structured data analysis.", sortOrder: 90 },
  { key: "sitemap", name: "Sitemap", description: "Sitemap analysis.", sortOrder: 100 },
  { key: "robots_txt", name: "Robots.txt", description: "Robots.txt analysis.", sortOrder: 110 },
  { key: "ai_overview", name: "AI Overview", description: "AI Overview / AIO readiness.", sortOrder: 120 },
  { key: "geo", name: "GEO", description: "Generative Engine Optimization readiness.", sortOrder: 130 },
  { key: "aeo", name: "AEO", description: "Answer Engine Optimization readiness.", sortOrder: 140 },
  { key: "sxo", name: "SXO", description: "Search Experience Optimization.", sortOrder: 150 },
  { key: "llm", name: "LLM", description: "LLM-assisted analysis.", sortOrder: 160 },
  { key: "slm", name: "SLM", description: "SLM-assisted analysis.", sortOrder: 170 },
  { key: "reports", name: "Reports", description: "Report generation/export.", sortOrder: 180 },
  { key: "settings", name: "Settings", description: "Account/platform settings.", sortOrder: 190 },
  // Added for the Phase 35 website-workspace navigation refactor (read.md):
  // these modules already had real, working panel components + API routes
  // (Phases 20-30) but no dedicated feature key of their own to gate a
  // sidebar/route on, so they inherited nothing and had to stay "Soon".
  { key: "eeat", name: "E-E-A-T / Trust", description: "E-E-A-T and trust signal analysis.", sortOrder: 145 },
  { key: "search_console", name: "Search Console", description: "Google Search Console integration.", sortOrder: 185 },
  { key: "google_analytics", name: "Google Analytics", description: "Google Analytics 4 (GA4) integration.", sortOrder: 186 },
  { key: "serp_tracking", name: "SERP / Keyword Tracking", description: "SERP rank tracking for keywords.", sortOrder: 155 },
  { key: "competitors", name: "Competitors", description: "Competitor tracking and content gap analysis.", sortOrder: 165 },
];

export const FEATURE_KEYS = FEATURE_CATALOG.map((f) => f.key);
