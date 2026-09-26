/**
 * Phase 17 — Limitation / Usage Management (read.md §12/§13). Initial
 * reference set of limit_definitions, seeded the same idempotent way
 * `ensureRbacSeed()` seeds `FEATURE_CATALOG` into `features`. Unlike the
 * feature catalog, this is NOT a closed, code-only registry — an admin can
 * add further limit_definitions from `/admin/limits` at any time (see
 * limit-admin.ts). This file only guarantees a sensible starting set exists
 * on a fresh database, matching read.md §12's example list verbatim.
 */

export type LimitDefinitionSeed = {
  key: string;
  name: string;
  description: string;
  unit: string;
  periodType: "day" | "week" | "month" | "lifetime";
};

export const LIMIT_DEFINITION_CATALOG: LimitDefinitionSeed[] = [
  { key: "max_websites", name: "Maximum Websites", description: "Total websites a user may add.", unit: "count", periodType: "lifetime" },
  { key: "max_pages_per_audit", name: "Maximum Pages Per Audit", description: "Pages crawled in a single audit run.", unit: "count", periodType: "lifetime" },
  { key: "max_audits_per_month", name: "Maximum Audits Per Month", description: "Audit runs started per month.", unit: "count", periodType: "month" },
  { key: "max_team_members", name: "Maximum Team Members", description: "Team members on the account.", unit: "count", periodType: "lifetime" },
  { key: "max_reports", name: "Maximum Reports", description: "Reports generated per month.", unit: "count", periodType: "month" },
  { key: "max_exports", name: "Maximum Exports", description: "Report exports per month.", unit: "count", periodType: "month" },
  { key: "max_ai_requests", name: "Maximum AI Requests", description: "Combined LLM+SLM requests per month.", unit: "requests", periodType: "month" },
  { key: "max_llm_requests", name: "Maximum LLM Requests", description: "LLM-assisted analysis requests per month.", unit: "requests", periodType: "month" },
  { key: "max_slm_requests", name: "Maximum SLM Requests", description: "SLM-assisted analysis requests per month.", unit: "requests", periodType: "month" },
  { key: "max_serp_queries", name: "Maximum SERP Queries", description: "SERP lookups per month.", unit: "requests", periodType: "month" },
  { key: "max_gsc_requests", name: "Maximum GSC Requests", description: "Google Search Console API calls per month.", unit: "requests", periodType: "month" },
  { key: "max_storage", name: "Maximum Storage", description: "Stored report/crawl data.", unit: "MB", periodType: "lifetime" },
];
