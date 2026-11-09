import { z } from "zod";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";

// Airspace fork: Google service-account access for Search Console and GA4.
//
// Why: the self-hosted OAuth client sat in Google's "Testing" publishing
// status, which caps refresh tokens at seven days, so every connection died
// weekly and every session asked to "reconnect Search Console". A service
// account never expires and needs no human login. Connections bound to it
// carry GOOGLE_SERVICE_ACCOUNT_ID as their account id; the GSC and GA4
// clients check for that sentinel and mint a token here instead of asking
// Better Auth for a user grant. OAuth connections keep working unchanged.
//
// Configure with AIRSPACE_GOOGLE_SA_JSON_B64: the service-account key JSON,
// base64-encoded. Rotating the key is a .env edit plus a container restart.

export const GOOGLE_SERVICE_ACCOUNT_ID = "service-account";
export const GSC_SERVICE_ACCOUNT_SCOPE =
  "https://www.googleapis.com/auth/webmasters.readonly";
export const GA4_SERVICE_ACCOUNT_SCOPE =
  "https://www.googleapis.com/auth/analytics.readonly";

const SA_ENV_NAME = "AIRSPACE_GOOGLE_SA_JSON_B64";
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";
const TOKEN_LIFETIME_SECONDS = 3600;
// Refresh a minute early so a token never expires mid-request.
const EXPIRY_MARGIN_MS = 60_000;

const keySchema = z.object({
  client_email: z.string().email(),
  private_key: z.string().min(1),
  token_uri: z.string().url().optional(),
});

export type ServiceAccountKey = z.infer<typeof keySchema>;

export class ServiceAccountNotConfiguredError extends Error {
  constructor() {
    super(`${SA_ENV_NAME} is not set or is not a valid service-account key.`);
    this.name = "ServiceAccountNotConfiguredError";
  }
}

export class ServiceAccountTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServiceAccountTokenError";
  }
}

export function isServiceAccountId(id: string | null | undefined): boolean {
  return id === GOOGLE_SERVICE_ACCOUNT_ID;
}

export function parseServiceAccountKey(
  base64: string | undefined,
): ServiceAccountKey | null {
  if (!base64) return null;
  try {
    const parsed = keySchema.safeParse(JSON.parse(atob(base64.trim())));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function getServiceAccountKey(): Promise<ServiceAccountKey | null> {
  return parseServiceAccountKey(await getOptionalEnvValue(SA_ENV_NAME));
}

function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function base64UrlFromJson(value: unknown): string {
  return base64UrlFromBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** Signed RS256 JWT assertion for Google's jwt-bearer grant. */
export async function buildServiceAccountAssertion(
  key: ServiceAccountKey,
  scope: string,
  nowMs: number,
): Promise<string> {
  const iat = Math.floor(nowMs / 1000);
  const header = base64UrlFromJson({ alg: "RS256", typ: "JWT" });
  const claims = base64UrlFromJson({
    iss: key.client_email,
    scope,
    aud: key.token_uri ?? DEFAULT_TOKEN_URI,
    iat,
    exp: iat + TOKEN_LIFETIME_SECONDS,
  });
  const signingInput = `${header}.${claims}`;
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(key.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64UrlFromBytes(new Uint8Array(signature))}`;
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().optional(),
});

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/** Test hook: tokens are cached per scope for the life of the isolate. */
export function clearServiceAccountTokenCache(): void {
  tokenCache.clear();
}

export async function mintServiceAccountToken(
  scope: string,
  deps: {
    key?: ServiceAccountKey | null;
    fetchImpl?: typeof fetch;
    now?: () => number;
  } = {},
): Promise<string> {
  const now = deps.now ?? Date.now;
  const cached = tokenCache.get(scope);
  if (cached && cached.expiresAt - EXPIRY_MARGIN_MS > now()) {
    return cached.token;
  }
  const key = deps.key === undefined ? await getServiceAccountKey() : deps.key;
  if (!key) throw new ServiceAccountNotConfiguredError();

  const assertion = await buildServiceAccountAssertion(key, scope, now());
  const response = await (deps.fetchImpl ?? fetch)(
    key.token_uri ?? DEFAULT_TOKEN_URI,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }).toString(),
    },
  );
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ServiceAccountTokenError(
      `Google rejected the service-account token request (${response.status}): ${body.slice(0, 200)}`,
    );
  }
  const parsed = tokenResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ServiceAccountTokenError(
      "Google returned no access token for the service account.",
    );
  }
  tokenCache.set(scope, {
    token: parsed.data.access_token,
    expiresAt:
      now() + (parsed.data.expires_in ?? TOKEN_LIFETIME_SECONDS) * 1000,
  });
  return parsed.data.access_token;
}
