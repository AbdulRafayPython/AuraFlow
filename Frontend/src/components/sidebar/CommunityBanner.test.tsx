import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CommunityBanner } from "./CommunityBanner";
import { bannerHeight, bannerTextColor, BANNER_IMAGE_HEIGHT, BANNER_COLOR_HEIGHT } from "@/lib/communityBanner";

describe("CommunityBanner", () => {
  it("shows the uploaded banner image with a scrim for the overlaid name", () => {
    const html = renderToStaticMarkup(
      <CommunityBanner community={{ name: "FYP Hub", banner_url: "https://cdn.example/banner.webp" }} />,
    );
    expect(html).toContain('src="https://cdn.example/banner.webp"');
    expect(html).toContain("bg-black/35");
    expect(html).toContain(`height:${BANNER_IMAGE_HEIGHT}px`);
  });

  it("falls back to the community colour with its initials", () => {
    const html = renderToStaticMarkup(<CommunityBanner community={{ name: "FYP Hub", color: "#3B82F6" }} />);
    expect(html).not.toContain("<img");
    expect(html).toContain("background-color:#3B82F6");
    expect(html).toContain(">FH<");
    expect(html).toContain(`height:${BANNER_COLOR_HEIGHT}px`);
  });

  it("sizes the header overlay and picks a readable name colour", () => {
    expect(bannerHeight({ name: "a", banner_url: "/b.png" })).toBe(BANNER_IMAGE_HEIGHT);
    expect(bannerHeight({ name: "a" })).toBe(BANNER_COLOR_HEIGHT);
    expect(bannerTextColor({ name: "a", banner_url: "/b.png" })).toBe("#fff");
    expect(bannerTextColor({ name: "a", color: "#FDE68A" })).toBe("#111");
  });
});
