import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BANNER_GALLERY, PERSONA_GALLERY, ListingAvatar, bannerFor, listingImageUrl, usedBy } from "./ListingVisuals";

describe("marketplace listing visuals", () => {
  it("serves gallery images from the web app and uploads from the API", () => {
    expect(listingImageUrl("/agents/personas/support.webp")).toBe("/agents/personas/support.webp");
    expect(listingImageUrl("/uploads/agent-listings/x.png")).toMatch(/\/uploads\/agent-listings\/x\.png$/);
  });

  it("falls back to the category banner when a listing has none", () => {
    expect(bannerFor({ banner_url: null, category: "learning" })).toBe("/agents/banners/learning.webp");
    expect(bannerFor({ banner_url: "/agents/banners/fun.webp", category: "learning" })).toBe("/agents/banners/fun.webp");
  });

  it("offers one banner per category and a set of personas", () => {
    expect(BANNER_GALLERY.map((b) => b.id)).toEqual(["support", "community", "productivity", "learning", "fun", "other"]);
    expect(PERSONA_GALLERY.length).toBeGreaterThanOrEqual(12);
    expect(PERSONA_GALLERY.every((p) => p.url.startsWith("/agents/personas/"))).toBe(true);
  });

  it("shows the persona when set", () => {
    const html = renderToStaticMarkup(<ListingAvatar l={{ icon_url: "/agents/personas/tutor.webp", title: "Study Buddy", category: "learning" }} />);
    expect(html).toContain('src="/agents/personas/tutor.webp"');
  });

  it("describes how often it was added", () => {
    expect(usedBy(0)).toBe("New");
    expect(usedBy(1)).toBe("Added 1 time");
    expect(usedBy(4)).toBe("Added 4 times");
  });
});
