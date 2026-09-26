import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "./session";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
};

/**
 * Authoritative current-user lookup for Server Components / Route Handlers.
 * Verifies the session against the database (respects revocation), unlike
 * the lightweight JWT-only check performed in edge middleware.
 *
 * Wrapped in React's `cache()` so layout + page both calling this in the
 * same request share one DB round trip instead of querying twice.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session) return null;

  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      emailVerified: users.emailVerified,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  return user ?? null;
});

/** Redirects to /login when there is no authenticated, valid session. */
export async function requireCurrentUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
