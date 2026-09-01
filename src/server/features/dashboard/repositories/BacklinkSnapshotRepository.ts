import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { backlinkSnapshots } from "@/db/schema";

type BacklinkSnapshot = typeof backlinkSnapshots.$inferSelect;

async function getLatestForProject(
  projectId: string,
): Promise<BacklinkSnapshot | null> {
  const rows = await db
    .select()
    .from(backlinkSnapshots)
    .where(eq(backlinkSnapshots.projectId, projectId))
    // id, not capturedAt: autoincrement is monotonic and immune to the
    // sqlite-vs-pg timestamp text-format difference.
    .orderBy(desc(backlinkSnapshots.id))
    .limit(1);
  return rows[0] ?? null;
}

// Airspace fork: recent history for portfolio sparklines, oldest first.
// Domain-guarded like getBacklinkSummary's consumer: after a project changes
// domain, the old domain's series must not render as the new one's history.
async function listRecentForProject(
  projectId: string,
  options: { domain?: string | null; limit?: number } = {},
): Promise<BacklinkSnapshot[]> {
  const { domain, limit = 30 } = options;
  const rows = await db
    .select()
    .from(backlinkSnapshots)
    .where(
      domain
        ? and(
            eq(backlinkSnapshots.projectId, projectId),
            eq(backlinkSnapshots.domain, domain),
          )
        : eq(backlinkSnapshots.projectId, projectId),
    )
    .orderBy(desc(backlinkSnapshots.id))
    .limit(limit);
  return rows.toReversed();
}

async function insert(
  values: typeof backlinkSnapshots.$inferInsert,
): Promise<BacklinkSnapshot> {
  const [row] = await db.insert(backlinkSnapshots).values(values).returning();
  if (!row) {
    throw new Error("Failed to insert backlink_snapshot");
  }
  return row;
}

export const BacklinkSnapshotRepository = {
  getLatestForProject,
  listRecentForProject,
  insert,
};
