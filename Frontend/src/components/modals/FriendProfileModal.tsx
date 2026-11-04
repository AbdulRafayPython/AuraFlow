// A friend's full profile (Discord's profile modal): their banner, avatar,
// name and About me, plus tabs for what you share: the communities you are
// both in and the friends you have in common. All from GET /api/status/user/<name>;
// nothing is made up. Actions: Message, voice / video call, ⋯ Remove / Block.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Ban, MessageCircle, MoreHorizontal, Phone, UserMinus, Video } from "lucide-react";
import type { Friend } from "@/types";
import { statusService, type UserProfile } from "@/services/statusService";
import { API_SERVER } from "@/config/api";
import { cn, getAvatarUrl } from "@/lib/utils";
import { ResponsiveModal, ResponsiveModalContent } from "@/components/ui/responsive-modal";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ProfileCard from "@/components/profile/ProfileCard";
import { PRESENCE_LABEL, lastSeenText } from "@/components/friends/presence";

interface FriendProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  friend: Friend | null;
  onMessage?: (friendId: number) => void;
  onCall?: (friend: Friend, kind: "audio" | "video") => void;
  canCall?: boolean;
  /** These confirm first (the page owns the confirm dialog). */
  onRemove?: (friend: Friend) => void;
  onBlock?: (friend: Friend) => void;
}

type Tab = "about" | "communities" | "friends";

const assetUrl = (path?: string | null) => (!path ? null : /^https?:\/\//.test(path) ? path : `${API_SERVER}${path}`);
const iconBtn = "flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--theme-bg-tertiary))] text-foreground transition-colors duration-100 hover:bg-[hsl(var(--theme-bg-hover))] disabled:cursor-not-allowed disabled:opacity-50";

export default function FriendProfileModal({
  isOpen, onClose, friend, onMessage, onCall, canCall = true, onRemove, onBlock,
}: FriendProfileModalProps) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<Tab>("about");

  useEffect(() => {
    if (!isOpen || !friend) return;
    let live = true;
    setProfile(null);
    setFailed(false);
    setTab("about");
    statusService.getUserProfile(friend.username)
      .then((p) => { if (live) setProfile(p); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [isOpen, friend]);

  if (!friend) return null;
  const seen = friend.status === "offline" ? lastSeenText(friend.last_seen) : null;
  const communities = profile?.shared_communities ?? [];
  const mutual = profile?.mutual_friends ?? [];
  const memberSince = profile?.member_since
    ? new Date(profile.member_since).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    : null;

  const tabBtn = (key: Tab, label: string) => (
    <button
      key={key}
      type="button"
      role="tab"
      aria-selected={tab === key}
      onClick={() => setTab(key)}
      className={cn(
        "-mb-px border-b-2 px-1 pb-2 text-sm font-medium transition-colors duration-100",
        tab === key ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );

  return (
    <ResponsiveModal open={isOpen} onOpenChange={(o) => { if (!o) onClose(); }}>
      <ResponsiveModalContent size="md" className="overflow-y-auto p-0">
        <ProfileCard
          displayName={profile?.display_name || friend.display_name}
          username={friend.username}
          avatarUrl={profile?.avatar_url || friend.avatar_url || friend.avatar}
          bannerUrl={profile?.banner_url}
          bannerColor={profile?.banner_color}
          status={friend.status}
          statusText={friend.custom_status || (seen ? `Offline · last seen ${seen}` : PRESENCE_LABEL[friend.status])}
          className="rounded-none"
        >
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => { onMessage?.(friend.id); onClose(); }}
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground transition-opacity duration-100 hover:opacity-90"
            >
              <MessageCircle className="h-4 w-4" /> Message
            </button>
            <button type="button" className={iconBtn} disabled={!canCall} aria-label="Voice call" title="Voice call"
                    onClick={() => { onCall?.(friend, "audio"); onClose(); }}>
              <Phone className="h-4 w-4" />
            </button>
            <button type="button" className={iconBtn} disabled={!canCall} aria-label="Video call" title="Video call"
                    onClick={() => { onCall?.(friend, "video"); onClose(); }}>
              <Video className="h-4 w-4" />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className={iconBtn} aria-label="More"><MoreHorizontal className="h-4 w-4" /></button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onSelect={() => { onRemove?.(friend); onClose(); }} className="text-destructive focus:bg-destructive/10 focus:text-destructive">
                  <UserMinus /> Remove Friend
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => { onBlock?.(friend); onClose(); }} className="text-destructive focus:bg-destructive/10 focus:text-destructive">
                  <Ban /> Block
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div role="tablist" aria-label="Profile" className="mt-5 flex gap-5 border-b border-border">
            {tabBtn("about", "About me")}
            {tabBtn("communities", profile ? `Mutual communities (${communities.length})` : "Mutual communities")}
            {tabBtn("friends", profile ? `Mutual friends (${mutual.length})` : "Mutual friends")}
          </div>

          <div className="min-h-[140px] pt-3" data-testid={`profile-tab-${tab}`}>
            {failed ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Could not load the rest of the profile.</p>
            ) : !profile ? (
              <div role="status" aria-label="Loading profile" className="space-y-2 pt-1">
                <div className="h-4 w-2/3 rounded bg-[hsl(var(--theme-bg-tertiary))] animate-skeleton" />
                <div className="h-4 w-1/2 rounded bg-[hsl(var(--theme-bg-tertiary))] animate-skeleton" />
              </div>
            ) : tab === "about" ? (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">About me</p>
                  <p className="mt-1 whitespace-pre-line break-words text-sm text-foreground">
                    {profile.bio || <span className="text-muted-foreground">{friend.display_name} hasn't written anything yet.</span>}
                  </p>
                </div>
                {memberSince && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Member since</p>
                    <p className="mt-1 text-sm text-foreground">{memberSince}</p>
                  </div>
                )}
              </div>
            ) : tab === "communities" ? (
              communities.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">You are not in any community together yet.</p>
              ) : (
                <ul className="-mx-2">
                  {communities.map((c) => {
                    const logo = assetUrl(c.logo_url);
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => { onClose(); if (c.public_id) navigate(`/community/${c.public_id}`); }}
                          disabled={!c.public_id}
                          className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors duration-100 hover:bg-[hsl(var(--theme-bg-hover))]"
                        >
                          {logo ? (
                            <img src={logo} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                          ) : (
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: c.color || "#5865F2" }}>
                              {c.icon || c.name.slice(0, 2).toUpperCase()}
                            </span>
                          )}
                          <span className="truncate text-sm font-medium text-foreground">{c.name}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )
            ) : mutual.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No friends in common yet.</p>
            ) : (
              <ul className="-mx-2">
                {mutual.map((m) => (
                  <li key={m.username} className="flex items-center gap-3 rounded-md px-2 py-2">
                    <img src={getAvatarUrl(m.avatar_url, m.username)} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">{m.display_name}</span>
                      <span className="block truncate text-xs text-muted-foreground">@{m.username}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </ProfileCard>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
