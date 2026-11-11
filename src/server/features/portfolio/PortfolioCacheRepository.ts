import { eq } from "drizzle-orm";
import { db } from "@/db";
import { portfolioCache } from "@/db/schema";

// Airspace fork: one stored portfolio per organization (see PortfolioService).

async function get(
  organizationId: string,
): Promise<{ payload: string; computedAt: string } | null> {
  const [row] = await db
    .select()
    .from(portfolioCache)
    .where(eq(portfolioCache.organizationId, organizationId))
    .limit(1);
  return row ?? null;
}

async function put(organizationId: string, payload: string, computedAt: string) {
  await db
    .insert(portfolioCache)
    .values({ organizationId, payload, computedAt })
    .onConflictDoUpdate({
      target: portfolioCache.organizationId,
      set: { payload, computedAt },
    });
}

async function clear(organizationId: string) {
  await db
    .delete(portfolioCache)
    .where(eq(portfolioCache.organizationId, organizationId));
}

export const PortfolioCacheRepository = { get, put, clear };
