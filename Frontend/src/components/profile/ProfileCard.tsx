// A person's profile card (Discord's user profile): banner (picture, or their
// colour), big avatar with status, name, @username, About me, then whatever
// the caller adds (shared communities, buttons). Used by the profile settings
// preview and by the friend profile modal, so both always look the same.
import React from "react";
import { getAvatarUrl, cn } from "@/lib/utils";
import { API_SERVER } from "@/config/api";

type Presence = "online" | "idle" | "dnd" | "offline";

const DOT: Record<Presence, string> = {
  online: "bg-success",
  idle: "bg-warning",
  dnd: "bg-destructive",
  offline: "bg-[hsl(var(--theme-text-muted))]",
};

/** Uploaded banners are served by the API; previews are blob/data URLs. */
export const bannerSrc = (url?: string | null) =>
  !url ? null : url.startsWith("/uploads/") ? `${API_SERVER}${url}` : url;

export default function ProfileCard({
  displayName, username, avatarUrl, bannerUrl, bannerColor, bio, status, statusText, children, className,
}: {
  displayName: string;
  username: string;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  bannerColor?: string | null;
  bio?: string | null;
  status?: Presence;
  /** e.g. "Idle · last seen 2h ago" or a custom status. */
  statusText?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const banner = bannerSrc(bannerUrl);
  return (
    <div className={cn("overflow-hidden rounded-xl bg-[hsl(var(--theme-bg-elevated))]", className)} data-testid="profile-card">
      <div
        className={cn("h-28 w-full bg-cover bg-center", !banner && !bannerColor && "bg-primary")}
        style={banner ? { backgroundImage: `url("${banner}")` } : bannerColor ? { backgroundColor: bannerColor } : undefined}
        aria-hidden
      />
      <div className="px-4 pb-4">
        <div className="-mt-12">
          <span className="relative inline-block">
            <img
              src={getAvatarUrl(avatarUrl ?? undefined, username)}
              alt=""
              className="h-24 w-24 rounded-full border-[6px] border-[hsl(var(--theme-bg-elevated))] bg-[hsl(var(--theme-bg-elevated))] object-cover"
            />
            {status && (
              <span className={cn("absolute bottom-1.5 right-1.5 h-5 w-5 rounded-full border-4 border-[hsl(var(--theme-bg-elevated))]", DOT[status])} />
            )}
          </span>
        </div>
        <h3 className="mt-2 break-words text-xl font-semibold leading-tight text-foreground">{displayName || username}</h3>
        <p className="text-sm text-muted-foreground">@{username}</p>
        {statusText && <p className="mt-1 text-sm text-[hsl(var(--theme-text-secondary))]">{statusText}</p>}

        {bio && (
          <div className="mt-3 rounded-lg bg-[hsl(var(--theme-bg-secondary))] p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">About me</p>
            <p className="mt-1 whitespace-pre-line break-words text-sm text-foreground">{bio}</p>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
