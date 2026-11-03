import { cn, readableTextOn } from "@/lib/utils";
import { API_SERVER } from "@/config/api";
import { BANNER_COLOR_HEIGHT, BANNER_IMAGE_HEIGHT, type BannerCommunity } from "@/lib/communityBanner";

const assetUrl = (path: string) => (/^https?:\/\//.test(path) ? path : `${API_SERVER}${path}`);

const initialsOf = (name: string) =>
  name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

/**
 * Discord-style community banner at the top of the channel sidebar. The
 * uploaded banner image fills it; without one, the community colour does,
 * with its logo (or initials) in the corner. The community name is not part
 * of the banner: the sticky menu button above it overlays the top 48px.
 */
export function CommunityBanner({ community, className }: { community: BannerCommunity; className?: string }) {
  if (community.banner_url) {
    return (
      <div className={cn("relative w-full shrink-0 overflow-hidden", className)} style={{ height: BANNER_IMAGE_HEIGHT }}>
        <img src={assetUrl(community.banner_url)} alt="" className="h-full w-full object-cover" />
        {/* Scrim behind the overlaid name so it reads on any image. */}
        <div aria-hidden className="absolute inset-x-0 top-0 h-12 bg-black/35" />
      </div>
    );
  }

  const color = community.color || "#8B5CF6";
  return (
    <div
      className={cn("relative w-full shrink-0", className)}
      style={{ height: BANNER_COLOR_HEIGHT, backgroundColor: color }}
    >
      <span
        aria-hidden
        className="absolute bottom-3 left-4 flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-black/20 text-sm font-semibold"
        style={{ color: readableTextOn(color) }}
      >
        {community.logo_url ? (
          <img src={assetUrl(community.logo_url)} alt="" className="h-full w-full object-cover" />
        ) : (
          community.icon || initialsOf(community.name)
        )}
      </span>
    </div>
  );
}

export default CommunityBanner;
