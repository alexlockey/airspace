import { describe, expect, it } from "vitest";
import {
  matchGa4Property,
  matchGscSite,
  normaliseHost,
} from "@/server/features/google/serviceAccountMatching";

describe("normaliseHost", () => {
  it("strips scheme, www and the sc-domain prefix", () => {
    expect(normaliseHost("https://www.FindATrainingProvider.co.uk/")).toBe(
      "findatrainingprovider.co.uk",
    );
    expect(normaliseHost("sc-domain:boltjobs.com")).toBe("boltjobs.com");
    expect(normaliseHost("boltjobs.com")).toBe("boltjobs.com");
    expect(normaliseHost("")).toBeNull();
  });
});

describe("matchGscSite", () => {
  const sites = [
    {
      siteUrl: "https://www.findatrainingprovider.co.uk/",
      permissionLevel: "siteOwner",
    },
    {
      siteUrl: "sc-domain:findatrainingprovider.co.uk",
      permissionLevel: "siteRestrictedUser",
    },
    { siteUrl: "http://grantsbakery.co.uk/", permissionLevel: "siteFullUser" },
    { siteUrl: "https://grantsbakery.co.uk/", permissionLevel: "siteFullUser" },
    {
      siteUrl: "sc-domain:unverified.com",
      permissionLevel: "siteUnverifiedUser",
    },
  ];

  it("prefers the domain property over URL prefixes", () => {
    expect(matchGscSite("findatrainingprovider.co.uk", sites)).toBe(
      "sc-domain:findatrainingprovider.co.uk",
    );
  });

  it("falls back to the https URL-prefix property", () => {
    expect(matchGscSite("www.grantsbakery.co.uk", sites)).toBe(
      "https://grantsbakery.co.uk/",
    );
  });

  it("never binds an unverified or unknown site", () => {
    expect(matchGscSite("unverified.com", sites)).toBeNull();
    expect(matchGscSite("leanpreneur.co", sites)).toBeNull();
  });
});

describe("matchGa4Property", () => {
  it("matches on the web stream host and skips staging duplicates", () => {
    const candidates = [
      {
        propertyId: "properties/1",
        displayName: "Bolt Jobs staging",
        streamUris: ["https://staging.boltjobs.com"],
      },
      {
        propertyId: "properties/2",
        displayName: "Bolt Jobs (staging copy)",
        streamUris: ["https://www.boltjobs.com"],
      },
      {
        propertyId: "properties/3",
        displayName: "Bolt Jobs",
        streamUris: ["https://boltjobs.com/"],
      },
      {
        propertyId: "properties/4",
        displayName: "Grants",
        streamUris: ["https://grantsbakery.co.uk"],
      },
    ];
    expect(matchGa4Property("boltjobs.com", candidates)?.propertyId).toBe(
      "properties/3",
    );
    expect(matchGa4Property("leanpreneur.co", candidates)).toBeNull();
  });
});
