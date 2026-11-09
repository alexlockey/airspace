import { createGa4AdminClient } from "@/server/lib/ga4Client";
import { createGscClient } from "@/server/lib/gscClient";
import {
  GOOGLE_SERVICE_ACCOUNT_ID,
  getServiceAccountKey,
} from "@/server/lib/googleServiceAccount";
import { GscConnectionRepository } from "@/server/features/gsc/repositories/GscConnectionRepository";
import { Ga4ConnectionRepository } from "@/server/features/ga4/repositories/Ga4ConnectionRepository";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import {
  matchGa4Property,
  matchGscSite,
  type Ga4Candidate,
} from "@/server/features/google/serviceAccountMatching";

// Airspace fork: binds every project to the Search Console site and GA4
// property the service account can see, so connections survive without a
// human login. Runs from the cron tick (throttled) and on demand via MCP.
// A project the service account cannot see keeps whatever connection it has.

const BIND_INTERVAL_MS = 6 * 60 * 60 * 1000;
let lastBindAt = 0;

export type BindingReport = {
  configured: boolean;
  serviceAccountEmail: string | null;
  gsc: {
    bound: { project: string; siteUrl: string; changed: boolean }[];
    unmatched: string[];
    error: string | null;
  };
  ga4: {
    bound: { project: string; propertyId: string; changed: boolean }[];
    unmatched: string[];
    error: string | null;
  };
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function bindGsc(
  projects: Awaited<ReturnType<typeof ProjectRepository.listActiveWithDomain>>,
  email: string,
  report: BindingReport,
) {
  const client = createGscClient({
    userId: GOOGLE_SERVICE_ACCOUNT_ID,
    gscAccountId: GOOGLE_SERVICE_ACCOUNT_ID,
  });
  let sites;
  try {
    sites = await client.listSites();
  } catch (error) {
    report.gsc.error = errorText(error);
    return;
  }
  for (const project of projects) {
    const siteUrl = project.domain ? matchGscSite(project.domain, sites) : null;
    if (!siteUrl) {
      report.gsc.unmatched.push(project.domain ?? project.name);
      continue;
    }
    const existing = await GscConnectionRepository.getByProjectId(project.id);
    const changed =
      existing?.gscAccountId !== GOOGLE_SERVICE_ACCOUNT_ID ||
      existing?.siteUrl !== siteUrl;
    if (changed) {
      await GscConnectionRepository.upsert({
        projectId: project.id,
        organizationId: project.organizationId,
        siteUrl,
        connectedByUserId:
          existing?.connectedByUserId ?? GOOGLE_SERVICE_ACCOUNT_ID,
        gscAccountId: GOOGLE_SERVICE_ACCOUNT_ID,
        connectedAccountEmail: email,
      });
    }
    report.gsc.bound.push({ project: project.name, siteUrl, changed });
  }
}

async function loadGa4Candidates(
  admin: ReturnType<typeof createGa4AdminClient>,
): Promise<Ga4Candidate[]> {
  const properties = await admin.listProperties();
  return Promise.all(
    properties.map(async (property) => {
      const streams = await admin
        .listDataStreams(property.propertyId)
        .catch(() => []);
      return {
        propertyId: property.propertyId,
        displayName: property.displayName,
        streamUris: streams
          .map((s) => s.webStreamData?.defaultUri)
          .filter((uri): uri is string => Boolean(uri)),
      };
    }),
  );
}

async function bindGa4(
  projects: Awaited<ReturnType<typeof ProjectRepository.listActiveWithDomain>>,
  email: string,
  report: BindingReport,
) {
  const admin = createGa4AdminClient({
    userId: GOOGLE_SERVICE_ACCOUNT_ID,
    ga4AccountId: GOOGLE_SERVICE_ACCOUNT_ID,
  });
  let candidates: Ga4Candidate[];
  try {
    candidates = await loadGa4Candidates(admin);
  } catch (error) {
    report.ga4.error = errorText(error);
    return;
  }
  for (const project of projects) {
    const match = project.domain
      ? matchGa4Property(project.domain, candidates)
      : null;
    if (!match) {
      report.ga4.unmatched.push(project.domain ?? project.name);
      continue;
    }
    const existing = await Ga4ConnectionRepository.getByProjectId(project.id);
    const changed =
      existing?.ga4AccountId !== GOOGLE_SERVICE_ACCOUNT_ID ||
      existing?.propertyId !== match.propertyId;
    if (changed) {
      const property = await admin.getProperty(match.propertyId);
      await Ga4ConnectionRepository.upsert({
        projectId: project.id,
        organizationId: project.organizationId,
        propertyId: match.propertyId,
        propertyDisplayName: property.displayName,
        propertyTimeZone: property.timeZone,
        propertyCurrencyCode: property.currencyCode,
        connectedByUserId:
          existing?.connectedByUserId ?? GOOGLE_SERVICE_ACCOUNT_ID,
        ga4AccountId: GOOGLE_SERVICE_ACCOUNT_ID,
        connectedAccountEmail: email,
      });
    }
    report.ga4.bound.push({
      project: project.name,
      propertyId: match.propertyId,
      changed,
    });
  }
}

async function bindAll(): Promise<BindingReport> {
  const key = await getServiceAccountKey();
  const report: BindingReport = {
    configured: Boolean(key),
    serviceAccountEmail: key?.client_email ?? null,
    gsc: { bound: [], unmatched: [], error: null },
    ga4: { bound: [], unmatched: [], error: null },
  };
  if (!key) return report;
  const projects = await ProjectRepository.listActiveWithDomain();
  await bindGsc(projects, key.client_email, report);
  await bindGa4(projects, key.client_email, report);
  lastBindAt = Date.now();
  return report;
}

/** Cron entry point: at most once every six hours per process. */
async function bindIfDue(): Promise<BindingReport | null> {
  if (Date.now() - lastBindAt < BIND_INTERVAL_MS) return null;
  lastBindAt = Date.now();
  return bindAll();
}

export const ServiceAccountBindingService = { bindAll, bindIfDue };
