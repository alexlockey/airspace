// Airspace fork: pure matching of a project's domain to the Search Console
// site and GA4 property a service account can see. Kept free of I/O so the
// rules are unit-tested and the binding service stays thin.

export function normaliseHost(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  const withoutScheme = trimmed.replace(/^sc-domain:/, "");
  try {
    const url = new URL(
      /^[a-z]+:\/\//.test(withoutScheme)
        ? withoutScheme
        : `https://${withoutScheme}`,
    );
    return url.hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/** Prefer the domain property (covers every subdomain and protocol), then
 * the https URL-prefix property, then any URL-prefix property on the host.
 * Unverified entries are never usable. */
export function matchGscSite(
  projectDomain: string,
  sites: { siteUrl: string; permissionLevel: string }[],
): string | null {
  const host = normaliseHost(projectDomain);
  if (!host) return null;
  const usable = sites.filter(
    (s) => s.permissionLevel !== "siteUnverifiedUser",
  );
  const domainProperty = usable.find((s) => s.siteUrl === `sc-domain:${host}`);
  if (domainProperty) return domainProperty.siteUrl;
  const prefixes = usable.filter(
    (s) =>
      !s.siteUrl.startsWith("sc-domain:") && normaliseHost(s.siteUrl) === host,
  );
  const https = prefixes.find((s) => s.siteUrl.startsWith("https://"));
  return (https ?? prefixes[0])?.siteUrl ?? null;
}

export type Ga4Candidate = {
  propertyId: string;
  displayName: string;
  streamUris: string[];
};

/** A property matches when one of its web streams points at the project's
 * host. Several matches (e.g. a staging property) resolve to the one with a
 * single stream on that host, then the first. */
export function matchGa4Property(
  projectDomain: string,
  candidates: Ga4Candidate[],
): Ga4Candidate | null {
  const host = normaliseHost(projectDomain);
  if (!host) return null;
  const matches = candidates.filter((c) =>
    c.streamUris.some((uri) => normaliseHost(uri) === host),
  );
  if (matches.length <= 1) return matches[0] ?? null;
  return (
    matches.find((c) => !/staging|test|dev/i.test(c.displayName)) ??
    matches[0] ??
    null
  );
}
