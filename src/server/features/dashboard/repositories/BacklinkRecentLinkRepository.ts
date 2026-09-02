import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { backlinkRecentLinks } from "@/db/schema";

// Airspace fork: storage for the newest links captured with each daily
// backlink snapshot. The set is replaced wholesale per refresh, so the table
// never grows past RECENT_LINKS_STORED rows per project.

export type BacklinkRecentLink = typeof backlinkRecentLinks.$inferSelect;
export type BacklinkRecentLinkInsert = typeof backlinkRecentLinks.$inferInsert;

async function replaceForProject(
  projectId: string,
  rows: BacklinkRecentLinkInsert[],
): Promise<void> {
  await db
    .delete(backlinkRecentLinks)
    .where(eq(backlinkRecentLinks.projectId, projectId));
  if (rows.length > 0) {
    await db.insert(backlinkRecentLinks).values(rows);
  }
}

/** Newest first. Domain-guarded like the snapshot reads: after a domain
 * change, the previous domain's links must not show as the new one's. */
async function listForProject(
  projectId: string,
  options: { domain?: string | null; limit?: number } = {},
): Promise<BacklinkRecentLink[]> {
  const { domain, limit = 50 } = options;
  return db
    .select()
    .from(backlinkRecentLinks)
    .where(
      domain
        ? and(
            eq(backlinkRecentLinks.projectId, projectId),
            eq(backlinkRecentLinks.domain, domain),
          )
        : eq(backlinkRecentLinks.projectId, projectId),
    )
    .orderBy(desc(backlinkRecentLinks.firstSeen), desc(backlinkRecentLinks.id))
    .limit(limit);
}

export const BacklinkRecentLinkRepository = {
  replaceForProject,
  listForProject,
};
