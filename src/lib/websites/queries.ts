import { cache } from "react";
import { db } from "@/lib/db";
import { websites } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { getActiveWebsiteId } from "./active-website";

export type Website = typeof websites.$inferSelect;

// Phase 28: competitor entries are rows in this same table (see the schema
// comment on `websites.isCompetitor`) but must never appear in the user's
// own website list/switcher, and are excluded from anything that counts
// against the Phase 17 "Maximum Websites" limit — so every "list the user's
// own sites" query filters `isCompetitor = false`.
export const listUserWebsites = cache(async (userId: string): Promise<Website[]> => {
  return db
    .select()
    .from(websites)
    .where(and(eq(websites.userId, userId), eq(websites.isCompetitor, false)))
    .orderBy(desc(websites.createdAt));
});

export async function getWebsiteForUser(userId: string, websiteId: string): Promise<Website | null> {
  const [site] = await db
    .select()
    .from(websites)
    .where(and(eq(websites.id, websiteId), eq(websites.userId, userId), eq(websites.isCompetitor, false)))
    .limit(1);
  return site ?? null;
}

/** Same ownership check as `getWebsiteForUser`, but for a competitor row (or any website row) regardless of `isCompetitor`. */
export async function getAnyWebsiteRowForUser(userId: string, websiteId: string): Promise<Website | null> {
  const [site] = await db
    .select()
    .from(websites)
    .where(and(eq(websites.id, websiteId), eq(websites.userId, userId)))
    .limit(1);
  return site ?? null;
}

/** Lists a user's competitor entries registered against a given owned website. */
export async function listCompetitorsForWebsite(userId: string, websiteId: string): Promise<Website[]> {
  return db
    .select()
    .from(websites)
    .where(
      and(
        eq(websites.userId, userId),
        eq(websites.isCompetitor, true),
        eq(websites.competitorForWebsiteId, websiteId)
      )
    )
    .orderBy(desc(websites.createdAt));
}

/** A single competitor row, ownership- and parent-verified. */
export async function getCompetitorForUser(
  userId: string,
  parentWebsiteId: string,
  competitorId: string
): Promise<Website | null> {
  const [site] = await db
    .select()
    .from(websites)
    .where(
      and(
        eq(websites.id, competitorId),
        eq(websites.userId, userId),
        eq(websites.isCompetitor, true),
        eq(websites.competitorForWebsiteId, parentWebsiteId)
      )
    )
    .limit(1);
  return site ?? null;
}

/**
 * Resolves the user's "active" website: whichever the cookie points to, as
 * long as they still own it, otherwise falls back to their most recently
 * created site. Returns null if the user has no websites yet.
 */
export const getActiveWebsite = cache(async (userId: string): Promise<Website | null> => {
  const sites = await listUserWebsites(userId);
  if (sites.length === 0) return null;

  const activeId = await getActiveWebsiteId();
  if (activeId) {
    const match = sites.find((s) => s.id === activeId);
    if (match) return match;
  }

  return sites[0];
});
