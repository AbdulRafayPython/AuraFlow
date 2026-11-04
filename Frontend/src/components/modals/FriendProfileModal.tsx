// A friend's profile (Discord's user profile card): a colour banner, the big
// avatar with their status, name and @username, their custom status, and the
// actions: Message, voice and video call, and a ⋯ menu for Remove / Block.
// Only real data is shown (no placeholder stats).
import { MessageCircle, MoreHorizontal, Phone, Ban, UserMinus, Video } from "lucide-react";
import type { Friend } from "@/types";
import { getAvatarUrl } from "@/lib/utils";
import { ResponsiveModal, ResponsiveModalContent } from "@/components/ui/responsive-modal";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PRESENCE_DOT, PRESENCE_LABEL, lastSeenText } from "@/components/friends/presence";

interface FriendProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  friend: Friend | null;
  onMessage?: (friendId: number) => void;
  /** Starts a call; the page asks first if one is already running. */
  onCall?: (friend: Friend, kind: "audio" | "video") => void;
  canCall?: boolean;
  /** These confirm first (the page owns the confirm dialog). */
  onRemove?: (friend: Friend) => void;
  onBlock?: (friend: Friend) => void;
}

const iconBtn = "flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--theme-bg-tertiary))] text-foreground transition-colors duration-100 hover:bg-[hsl(var(--theme-bg-hover))] disabled:cursor-not-allowed disabled:opacity-50";

export default function FriendProfileModal({
  isOpen, onClose, friend, onMessage, onCall, canCall = true, onRemove, onBlock,
}: FriendProfileModalProps) {
  if (!friend) return null;
  const seen = friend.status === "offline" ? lastSeenText(friend.last_seen) : null;

  return (
    <ResponsiveModal open={isOpen} onOpenChange={(o) => { if (!o) onClose(); }}>
      <ResponsiveModalContent size="sm" className="overflow-hidden p-0">
        <div className="h-24 bg-primary" aria-hidden />
        <div className="px-5 pb-5">
          <div className="-mt-12 flex items-end justify-between">
            <span className="relative">
              <img
                src={getAvatarUrl(friend.avatar_url, friend.username)}
                alt=""
                className="h-24 w-24 rounded-full border-[6px] border-[hsl(var(--theme-bg-elevated))] object-cover"
              />
              <span
                title={PRESENCE_LABEL[friend.status]}
                className={`absolute bottom-1.5 right-1.5 h-5 w-5 rounded-full border-4 border-[hsl(var(--theme-bg-elevated))] ${PRESENCE_DOT[friend.status]}`}
              />
            </span>
          </div>

          <h2 className="mt-3 text-xl font-semibold leading-tight text-foreground">{friend.display_name}</h2>
          <p className="text-sm text-muted-foreground">@{friend.username}</p>

          <div className="mt-4 rounded-lg bg-[hsl(var(--theme-bg-secondary))] p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
            <p className="mt-1 flex items-center gap-2 text-sm text-foreground">
              <span className={`h-2.5 w-2.5 rounded-full ${PRESENCE_DOT[friend.status]}`} aria-hidden />
              {PRESENCE_LABEL[friend.status]}
              {seen && <span className="text-muted-foreground">· last seen {seen}</span>}
            </p>
            {friend.custom_status && (
              <p className="mt-2 text-sm text-[hsl(var(--theme-text-secondary))]">{friend.custom_status}</p>
            )}
          </div>

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
                <button type="button" className={iconBtn} aria-label="More">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
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
        </div>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
