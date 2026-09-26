import { GA4_ACCOUNT_SUMMARIES_URL, GA4_RUN_REPORT_URL_TEMPLATE } from "./config";

export class Ga4ApiError extends Error {
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
    throw new Ga4ApiError(`Google Analytics API request failed: ${res.status} ${body}`, res.status);
  }

  return res.json();
}

/**
 * `GET accountSummaries` — Google Analytics Admin API v1beta. Lists every
 * GA4 account (and its nested properties) the connected Google account has
 * access to, per Google's documented response shape:
 * `{ accountSummaries: [{ account, displayName, propertySummaries: [{ property, displayName }] }] }`.
 * This is the GA4 analogue of GSC's `sites.list` — the property-picker UI
 * lists real properties from the user's own Google account, never
 * platform-operator data.
 */
export async function fetchGa4AccountSummaries(accessToken: string): Promise<unknown> {
  return googleFetch(`${GA4_ACCOUNT_SUMMARIES_URL}?pageSize=200`, accessToken);
}

/**
 * `POST {property}:runReport` — Google Analytics Data API v1beta, the GA4
 * reporting API (distinct from the deprecated Universal Analytics Reporting
 * API). `propertyId` must be the bare numeric ID or "properties/{id}" form;
 * this normalizes to "properties/{id}" for the request path.
 */
export async function runGa4Report(accessToken: string, propertyId: string, body: unknown): Promise<unknown> {
  const property = propertyId.startsWith("properties/") ? propertyId : `properties/${propertyId}`;
  const url = GA4_RUN_REPORT_URL_TEMPLATE.replace("{property}", property);
  return googleFetch(url, accessToken, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
