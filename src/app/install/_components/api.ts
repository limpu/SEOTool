"use client";

/**
 * The wizard's one HTTP helper.
 *
 * Note what it does NOT do: it never attaches an install token. The token
 * lives in an httpOnly cookie set by `POST /api/install/verify-token` and is
 * sent by the browser automatically, so it never enters page JavaScript —
 * which means an XSS anywhere in this page cannot read it. Every installer
 * route re-verifies that cookie's value against the file on disk on every
 * request, and checks the database lock before it even looks at the cookie.
 *
 * A 404 from any installer route means the installation was completed (by
 * this tab or another one) and the installer no longer exists. The wizard
 * reloads rather than trying to interpret it: the server will then render the
 * genuine 404 page, which is the correct end state.
 */

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T;
}

export async function installerPost<T = Record<string, unknown>>(
  path: string,
  body: Record<string, unknown> = {}
): Promise<ApiResult<T>> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (res.status === 404) {
    window.location.reload();
    // Unreachable in practice; keeps the type honest for the caller.
    return { ok: false, status: 404, data: {} as T };
  }

  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}

export async function installerGet<T = Record<string, unknown>>(path: string): Promise<ApiResult<T>> {
  const res = await fetch(path, { headers: { "cache-control": "no-store" } });
  if (res.status === 404) {
    window.location.reload();
    return { ok: false, status: 404, data: {} as T };
  }
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}

/**
 * Pull an error message out of any installer response.
 *
 * The routes are consistent about this — `error` for a refusal, `message` for
 * an outcome — but a defensive fallback matters here specifically because the
 * alternative is showing the operator an empty red box, which is worse than
 * a generic sentence.
 */
export function errorMessage(data: unknown, fallback = "That did not work."): string {
  if (data && typeof data === "object") {
    const d = data as { error?: unknown; message?: unknown };
    if (typeof d.error === "string" && d.error) return d.error;
    if (typeof d.message === "string" && d.message) return d.message;
  }
  return fallback;
}
