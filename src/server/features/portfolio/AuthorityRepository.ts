import { and, asc, eq, max, sql } from "drizzle-orm";
import { db } from "@/db";
import { domainAuthorityPoints } from "@/db/schema";

// Airspace fork: authority history per site (DataForSEO domain rank monthly,
// Ahrefs Domain Rating when captured). One row per project, source and date.

// D1 caps bound parameters at 100 per statement; 7 columns per row.
const UPSERT_CHUNK_ROWS = 10;

export type AuthoritySource = "dataforseo_rank" | "ahrefs_dr";
export type AuthorityPoint = typeof domainAuthorityPoints.$inferSelect;
export type AuthorityPointInsert = typeof domainAuthorityPoints.$inferInsert;

async function upsertPoints(rows: AuthorityPointInsert[]): Promise<void> {
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK_ROWS) {
    await db
      .insert(domainAuthorityPoints)
      .values(rows.slice(i, i + UPSERT_CHUNK_ROWS))
      .onConflictDoUpdate({
        target: [
          domainAuthorityPoints.projectId,
          domainAuthorityPoints.source,
          domainAuthorityPoints.date,
        ],
        set: {
          domain: sql`excluded.domain`,
          value: sql`excluded.value`,
          referringDomains: sql`excluded.referring_domains`,
          capturedAt: sql`excluded.captured_at`,
        },
      });
  }
}

/** Oldest first. Domain-guarded: after a domain change the old domain's
 * history must not read as the new one's. */
async function listForProject(
  projectId: string,
  domain: string | null,
): Promise<AuthorityPoint[]> {
  return db
    .select()
    .from(domainAuthorityPoints)
    .where(
      domain
        ? and(
            eq(domainAuthorityPoints.projectId, projectId),
            eq(domainAuthorityPoints.domain, domain),
          )
        : eq(domainAuthorityPoints.projectId, projectId),
    )
    .orderBy(asc(domainAuthorityPoints.date), asc(domainAuthorityPoints.id));
}

/** When this source was last fetched for the project (any date), or null. */
async function lastCapturedAt(
  projectId: string,
  source: AuthoritySource,
): Promise<string | null> {
  const [row] = await db
    .select({ value: max(domainAuthorityPoints.capturedAt) })
    .from(domainAuthorityPoints)
    .where(
      and(
        eq(domainAuthorityPoints.projectId, projectId),
        eq(domainAuthorityPoints.source, source),
      ),
    );
  return row?.value ?? null;
}

export const AuthorityRepository = {
  upsertPoints,
  listForProject,
  lastCapturedAt,
};
