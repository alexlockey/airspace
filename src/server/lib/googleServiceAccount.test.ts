import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildServiceAccountAssertion,
  clearServiceAccountTokenCache,
  isServiceAccountId,
  mintServiceAccountToken,
  parseServiceAccountKey,
  ServiceAccountNotConfiguredError,
  type ServiceAccountKey,
} from "@/server/lib/googleServiceAccount";

async function generateKey() {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const pkcs8 = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", pair.privateKey),
  );
  let binary = "";
  for (const byte of pkcs8) binary += String.fromCharCode(byte);
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(binary)}\n-----END PRIVATE KEY-----\n`;
  const key: ServiceAccountKey = {
    client_email: "robot@example-project.iam.gserviceaccount.com",
    private_key: pem,
  };
  return { key, publicKey: pair.publicKey };
}

function decodeSegment(segment: string): unknown {
  const padded = segment.replaceAll("-", "+").replaceAll("_", "/");
  return JSON.parse(atob(padded + "=".repeat((4 - (padded.length % 4)) % 4)));
}

function bytesFromBase64Url(segment: string): ArrayBuffer {
  const padded = segment.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0)).buffer;
}

describe("googleServiceAccount", () => {
  beforeEach(() => clearServiceAccountTokenCache());

  it("recognises only the sentinel account id", () => {
    expect(isServiceAccountId("service-account")).toBe(true);
    expect(isServiceAccountId("106580514268460028458")).toBe(false);
    expect(isServiceAccountId(null)).toBe(false);
  });

  it("parses a base64 key and rejects junk", () => {
    const json = JSON.stringify({
      client_email: "robot@x.iam.gserviceaccount.com",
      private_key:
        "-----BEGIN PRIVATE KEY-----\nAAA\n-----END PRIVATE KEY-----",
    });
    expect(parseServiceAccountKey(btoa(json))?.client_email).toBe(
      "robot@x.iam.gserviceaccount.com",
    );
    expect(parseServiceAccountKey("not-base64-json")).toBeNull();
    expect(parseServiceAccountKey(undefined)).toBeNull();
  });

  it("signs an RS256 assertion Google can verify", async () => {
    const { key, publicKey } = await generateKey();
    const jwt = await buildServiceAccountAssertion(
      key,
      "https://www.googleapis.com/auth/webmasters.readonly",
      1_800_000_000_000,
    );
    const [header, claims, signature] = jwt.split(".");
    expect(decodeSegment(header ?? "")).toEqual({ alg: "RS256", typ: "JWT" });
    expect(decodeSegment(claims ?? "")).toMatchObject({
      iss: key.client_email,
      aud: "https://oauth2.googleapis.com/token",
      iat: 1_800_000_000,
      exp: 1_800_003_600,
    });
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      bytesFromBase64Url(signature ?? ""),
      new TextEncoder().encode(`${header}.${claims}`),
    );
    expect(valid).toBe(true);
  });

  it("mints once per scope and reuses the token until near expiry", async () => {
    const { key } = await generateKey();
    const fetchImpl = vi.fn(async () =>
      Response.json({ access_token: "tok-1", expires_in: 3600 }),
    );
    let clock = 1_800_000_000_000;
    const deps = { key, fetchImpl, now: () => clock };
    expect(await mintServiceAccountToken("scope-a", deps)).toBe("tok-1");
    expect(await mintServiceAccountToken("scope-a", deps)).toBe("tok-1");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    clock += 3_550_000; // inside the one-minute margin
    await mintServiceAccountToken("scope-a", deps);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("fails clearly when no key is configured", async () => {
    await expect(
      mintServiceAccountToken("scope-a", { key: null }),
    ).rejects.toBeInstanceOf(ServiceAccountNotConfiguredError);
  });
});
