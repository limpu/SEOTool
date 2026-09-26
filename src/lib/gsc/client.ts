import { GSC_SEARCH_ANALYTICS_URL_TEMPLATE, GSC_SITES_LIST_URL } from "./config";

export class GscApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

async function googleFetch(url: string, accessToken: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GscApiError(`Google Search Console API request failed: ${res.status} ${body}`, res.status);
  }

  return res.json();
}

/**
 * `GET sites` — lists the Search Console properties the connected Google
 * account has any level of access to (per Google's documented
 * `sites.list` response shape: `{ siteEntry: [{ siteUrl, permissionLevel }] }`).
 */
export async function fetchGscSites(accessToken: string): Promise<unknown> {
  return googleFetch(GSC_SITES_LIST_URL, accessToken);
}

export interface SearchAnalyticsQueryParams {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  dimensions: ("query" | "page")[];
  rowLimit?: number;
}

/**
 * `POST searchAnalytics/query` — the Search Analytics report. Returns the
 * raw Google response shape (`{ rows: [{ keys, clicks, impressions, ctr,
 * position }] }`); use `parseSearchAnalyticsResponse` to turn it into typed,
 * persistable rows.
 */
export async function fetchSearchAnalytics(
  accessToken: string,
  siteUrl: string,
  params: SearchAnalyticsQueryParams
): Promise<unknown> {
  const url = GSC_SEARCH_ANALYTICS_URL_TEMPLATE.replace("{siteUrl}", encodeURIComponent(siteUrl));
  return googleFetch(url, accessToken, {
    method: "POST",
    body: JSON.stringify({
      startDate: params.startDate,
      endDate: params.endDate,
      dimensions: params.dimensions,
      rowLimit: params.rowLimit ?? 500,
    }),
  });
}
