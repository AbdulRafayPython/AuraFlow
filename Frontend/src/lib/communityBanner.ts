import { readableTextOn } from "@/lib/utils";

/** Banner heights: an uploaded image (Discord's ~16:9 for the sidebar width), or the colour fallback. */
export const BANNER_IMAGE_HEIGHT = 136;
export const BANNER_COLOR_HEIGHT = 88;

export interface BannerCommunity {
  name: string;
  icon?: string;
  color?: string;
  logo_url?: string;
  banner_url?: string;
}

export function bannerHeight(community?: BannerCommunity | null): number {
  return community?.banner_url ? BANNER_IMAGE_HEIGHT : BANNER_COLOR_HEIGHT;
}

/** Text colour for the community name while it sits on the banner. */
export function bannerTextColor(community?: BannerCommunity | null): string {
  return community?.banner_url ? "#fff" : readableTextOn(community?.color);
}

