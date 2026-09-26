import { cookies } from "next/headers";

const COOKIE_NAME = "active_website_id";

/**
 * The active-website cookie is just a UUID pointer, not a credential — every
 * read of it is re-verified against the database for ownership before use,
 * so it doesn't need to be HttpOnly/Secure.
 */
export async function getActiveWebsiteId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value ?? null;
}

export async function setActiveWebsiteId(id: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, id, {
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function clearActiveWebsiteId(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
}
