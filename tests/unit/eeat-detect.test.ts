import { describe, it, expect } from "vitest";
import {
  scoreAuthorSignal,
  hasArticleAuthorSchema,
  findAboutPage,
  findContactPage,
  findPrivacyPage,
  findTermsPage,
  scoreAboutPage,
  scoreHttps,
  computeSiteTrust,
} from "@/lib/eeat/detect";

describe("hasArticleAuthorSchema", () => {
  it("true when an Article-family schema has an author property", () => {
    expect(hasArticleAuthorSchema([{ schemaType: "BlogPosting", hasAuthorProperty: true }])).toBe(true);
  });

  it("false when the schema type is not Article-family", () => {
    expect(hasArticleAuthorSchema([{ schemaType: "Product", hasAuthorProperty: true }])).toBe(false);
  });

  it("false when Article-family schema has no author property", () => {
    expect(hasArticleAuthorSchema([{ schemaType: "Article", hasAuthorProperty: false }])).toBe(false);
  });
});

describe("scoreAuthorSignal", () => {
  it("scores 100 when all four markers are present", () => {
    const r = scoreAuthorSignal({
      hasAuthorByline: true,
      hasRelAuthorLink: true,
      hasVisibleDate: true,
      hasArticleAuthorSchema: true,
    });
    expect(r.score).toBe(100);
  });

  it("scores 0 when no markers are present", () => {
    const r = scoreAuthorSignal({
      hasAuthorByline: false,
      hasRelAuthorLink: false,
      hasVisibleDate: false,
      hasArticleAuthorSchema: false,
    });
    expect(r.score).toBe(0);
    expect(r.evidence).toMatch(/No visible byline/);
  });

  it("scores 50 with exactly two of four markers", () => {
    const r = scoreAuthorSignal({
      hasAuthorByline: true,
      hasRelAuthorLink: true,
      hasVisibleDate: false,
      hasArticleAuthorSchema: false,
    });
    expect(r.score).toBe(50);
  });
});

describe("findAboutPage / findContactPage / findPrivacyPage / findTermsPage — URL path matching", () => {
  it("matches /about", () => {
    expect(findAboutPage([{ url: "https://example.com/about", title: null }])).not.toBeNull();
  });

  it("matches /about-us (hyphen-split segment)", () => {
    expect(findAboutPage([{ url: "https://example.com/about-us", title: null }])).not.toBeNull();
  });

  it("does NOT match 'aboutface.com' style substring collisions in the hostname", () => {
    expect(findAboutPage([{ url: "https://aboutface.com/", title: null }])).toBeNull();
  });

  it("does NOT match a path segment that merely contains 'about' as a substring (e.g. /roundabout)", () => {
    expect(findAboutPage([{ url: "https://example.com/roundabout", title: null }])).toBeNull();
  });

  it("matches a title containing the word 'About'", () => {
    expect(findAboutPage([{ url: "https://example.com/who-we-are", title: "About Our Company" }])).not.toBeNull();
  });

  it("does not match a title where 'about' is only a substring of another word", () => {
    expect(findAboutPage([{ url: "https://example.com/x", title: "Roundabout Views" }])).toBeNull();
  });

  it("matches /contact-us", () => {
    expect(findContactPage([{ url: "https://example.com/contact-us", title: null }])).not.toBeNull();
  });

  it("matches /privacy-policy", () => {
    expect(findPrivacyPage([{ url: "https://example.com/privacy-policy", title: null }])).not.toBeNull();
  });

  it("matches /terms", () => {
    expect(findTermsPage([{ url: "https://example.com/terms", title: null }])).not.toBeNull();
  });

  it("returns null when no page in the list matches", () => {
    expect(findContactPage([{ url: "https://example.com/products", title: "Our Products" }])).toBeNull();
  });
});

describe("scoreAboutPage / scoreHttps", () => {
  it("scores 100 when a page is found", () => {
    expect(scoreAboutPage({ url: "https://example.com/about", title: "About" }).score).toBe(100);
  });

  it("scores 0 when no page is found", () => {
    expect(scoreAboutPage(null).score).toBe(0);
  });

  it("scoreHttps reflects the passed-in fact, not a re-detection", () => {
    expect(scoreHttps(true).score).toBe(100);
    expect(scoreHttps(false).score).toBe(0);
  });
});

describe("computeSiteTrust", () => {
  it("computes an equal-weight average across About/Contact/Privacy/HTTPS/Author", () => {
    const result = computeSiteTrust(
      {
        aboutPage: { url: "https://example.com/about", title: "About" },
        contactPage: { url: "https://example.com/contact", title: "Contact" },
        privacyPage: { url: "https://example.com/privacy", title: "Privacy" },
        termsPage: null,
      },
      true,
      [100, 50]
    );
    // about 100, contact 100, privacy 100, https 100, author avg 75 -> (100*4+75)/5 = 95
    expect(result.score).toBe(95);
    expect(result.unassessed.map((d) => d.key)).toEqual(["references", "experienceSignals"]);
  });

  it("author dimension is unassessed (not zero) when there are no content pages to average", () => {
    const result = computeSiteTrust(
      { aboutPage: null, contactPage: null, privacyPage: null, termsPage: null },
      false,
      []
    );
    const authorDim = result.dimensions.find((d) => d.key === "authorSignalSiteAverage");
    expect(authorDim?.status).toBe("unassessed");
    expect(authorDim?.score).toBeNull();
  });
});
