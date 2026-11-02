import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Search } from "lucide-react";
import { cn, getAvatarUrl, formatMessagePreview } from "@/lib/utils";
import { useFriends } from "@/contexts/FriendsContext";
import { useDirectMessages } from "@/contexts/DirectMessagesContext";
import { useRealtime } from "@/hooks/useRealtime";
import { useUnreadCounts } from "@/hooks/useUnreadCounts";
import authService from "@/services/authService";
import { socketService } from "@/services/socketService";
import FriendProfileModal from "@/components/modals/FriendProfileModal";
import { Icon } from "@/components/app/Icon";
import { SidebarListSkeleton } from "@/components/chat/MessageListSkeleton";
import AgentLogo from "@/components/ai-agents/AgentLogo";

export interface CommunityFormData {
  name: string;
  description: string;
  icon: string;
  color: string;
}

interface DirectsSidebarProps {
  /** A sibling modal is open: freeze this panel like the old sidebar did. */
  frozen?: boolean;
  /** Fill the container (mobile drawer) instead of the fixed 260px width. */
  fluid?: boolean;
}

const PRESENCE_DOT: Record<string, string> = {
  online: "bg-success",
  idle: "bg-warning",
  dnd: "bg-destructive",
  offline: "bg-muted-foreground",
};

const initialsOf = (name: string) =>
  (name || "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

function PersonAvatar({ name, username, url, presence }: { name: string; username: string; url?: string; presence: string }) {
  return (
    <div className="relative h-8 w-8 shrink-0">
      {url ? (
        <img src={getAvatarUrl(url, username)} alt="" className="h-8 w-8 rounded-md object-cover" />
      ) : (
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[hsl(var(--theme-bg-tertiary))] text-xs font-semibold text-foreground">
          {initialsOf(name)}
        </div>
      )}
      <span
        aria-label={presence}
        className={cn(
          "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[hsl(var(--theme-sidebar-bg))]",
          PRESENCE_DOT[presence] || PRESENCE_DOT.offline,
        )}
      />
    </div>
  );
}

/**
 * Contextual sidebar for everything that is not a community: recent
 * conversations and friends. (Communities live only on the rail.)
 */
export default function DirectsSidebar({ frozen = false, fluid = false }: DirectsSidebarProps) {
  const navigate = useNavigate();
  const { friends = [] } = useFriends();
  const { selectFriend, currentFriend, userStatuses, isLoadingFriends } = useRealtime();
  const { conversations } = useDirectMessages();
  const { markDMRead, getDMUnread } = useUnreadCounts();

  // Bulk presence from socket (friend_id -> status string)
  const [bulkPresence, setBulkPresence] = useState<Record<number, string>>({});
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [showFriendProfileModal, setShowFriendProfileModal] = useState(false);
  const [selectedFriendForModal, setSelectedFriendForModal] = useState<any>(null);
  const [expanded, setExpanded] = useState({ conversations: true, friends: true });
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    authService
      .getMe()
      .then(setCurrentUser)
      .catch((error) => console.error("Failed to load user data:", error));
  }, []);

  // Subscribe to bulk friend presence snapshots
  useEffect(() => {
    const unsub = socketService.onFriendsBulkStatus((data: Record<number, string>) => {
      setBulkPresence(data);
    });
    return unsub;
  }, []);

  // Prefer bulk socket data, fall back to the userStatuses map
  const getFriendPresence = (username: string, friendId?: number): string => {
    if (friendId && bulkPresence[friendId]) return bulkPresence[friendId];
    return userStatuses.get(username) || "offline";
  };

  const query = searchQuery.toLowerCase();
  const filteredFriends = friends.filter(
    (f) => f.display_name?.toLowerCase().includes(query) || f.username?.toLowerCase().includes(query),
  );
  const recentConversations = conversations
    .filter(
      (conv) =>
        conv.last_message &&
        (conv.user?.display_name?.toLowerCase().includes(query) || conv.user?.username?.toLowerCase().includes(query)),
    )
    .sort((a, b) => new Date(b.last_message_time || 0).getTime() - new Date(a.last_message_time || 0).getTime())
    .slice(0, 8);

  const toggle = (section: keyof typeof expanded) => setExpanded((prev) => ({ ...prev, [section]: !prev[section] }));

  const sectionHeader = (label: string, section: keyof typeof expanded) => (
    <button
      type="button"
      onClick={() => toggle(section)}
      aria-expanded={expanded[section]}
      className="flex w-full items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-[hsl(var(--theme-bg-hover))] hover:text-foreground"
    >
      <Icon icon={ChevronDown} size="sm" className={cn("transition-transform duration-150", !expanded[section] && "-rotate-90")} />
      {label}
    </button>
  );

  return (
    <>
      <aside
        aria-label="Direct messages"
        className={cn(
          "flex h-full flex-col border-r border-border",
          fluid ? "w-full" : "w-sidebar shrink-0",
          frozen && "pointer-events-none",
        )}
        style={{ background: "var(--theme-sidebar-gradient)" }}
      >
        <div className="flex h-12 shrink-0 items-center border-b border-border px-4">
          <h2 className="truncate text-base font-semibold text-foreground">Direct messages</h2>
        </div>

        <div className="px-3 pt-3">
          <div className="relative">
            <Icon icon={Search} size="md" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Find a conversation"
              aria-label="Find a conversation"
              className="h-8 w-full rounded-md border border-border bg-[hsl(var(--theme-input-bg))] pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-3">
          {/* Recent conversations */}
          <div className="mb-3">
            {sectionHeader("Recent", "conversations")}
            {expanded.conversations && (
              <div className="mt-1 space-y-0.5">
                {recentConversations.length === 0 ? (
                  <p className="px-2 py-2 text-sm text-muted-foreground">
                    {searchQuery ? "No conversations found" : "No conversations yet"}
                  </p>
                ) : (
                  recentConversations.map((conv) => {
                    const presence = getFriendPresence(conv.user.username, conv.user_id);
                    const isActive = currentFriend?.id === conv.user_id;
                    const unread = getDMUnread(conv.user_id);
                    const name = conv.user.display_name || conv.user.username;
                    return (
                      <button
                        key={conv.user_id}
                        type="button"
                        onClick={() => {
                          selectFriend(conv.user_id);
                          markDMRead(conv.user_id);
                          if (conv.user.public_id) navigate(`/dm/${conv.user.public_id}`);
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-150",
                          isActive
                            ? "bg-[hsl(var(--theme-bg-active))] text-foreground"
                            : "text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] hover:text-foreground",
                        )}
                      >
                        {conv.user.is_bot ? (
                          <AgentLogo size="sm" avatarUrl={conv.user.avatar_url} username={conv.user.username} name={name} />
                        ) : (
                          <PersonAvatar name={name} username={conv.user.username} url={conv.user.avatar_url} presence={presence} />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className={cn("flex items-center gap-1 truncate text-sm", unread > 0 ? "font-semibold text-foreground" : "font-medium")}>
                            <span className="truncate">{name}</span>
                            {conv.user.is_bot && (
                              <span className="shrink-0 rounded bg-[hsl(var(--theme-bg-tertiary))] px-1 text-xs font-semibold text-muted-foreground">APP</span>
                            )}
                          </div>
                          {conv.last_message && (
                            <div className={cn("truncate text-xs", unread > 0 ? "text-foreground" : "text-muted-foreground")}>
                              {conv.last_message.sender_id === currentUser?.id ? "You: " : ""}
                              {formatMessagePreview(conv.last_message)}
                            </div>
                          )}
                        </div>
                        {unread > 0 && (
                          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                            {unread > 99 ? "99+" : unread}
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Friends */}
          <div>
            {sectionHeader(`Friends (${filteredFriends.length})`, "friends")}
            {expanded.friends && (
              <div className="mt-1 space-y-0.5">
                {isLoadingFriends && friends.length === 0 ? (
                  <SidebarListSkeleton rows={3} />
                ) : filteredFriends.length === 0 ? (
                  <p className="px-2 py-2 text-sm text-muted-foreground">
                    {searchQuery ? "No friends found" : "No friends yet. Add one from the Friends page."}
                  </p>
                ) : (
                  filteredFriends.map((friend) => {
                    const presence = getFriendPresence(friend.username, friend.id);
                    return (
                      <button
                        key={friend.id}
                        type="button"
                        onClick={() => {
                          setSelectedFriendForModal(friend);
                          setShowFriendProfileModal(true);
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[hsl(var(--theme-text-secondary))] transition-colors duration-150 hover:bg-[hsl(var(--theme-bg-hover))] hover:text-foreground"
                      >
                        <PersonAvatar name={friend.display_name} username={friend.username} url={friend.avatar_url} presence={presence} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{friend.display_name}</div>
                          {friend.custom_status && (
                            <div className="truncate text-xs text-muted-foreground">{friend.custom_status}</div>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      </aside>

      <FriendProfileModal
        isOpen={showFriendProfileModal}
        onClose={() => {
          setShowFriendProfileModal(false);
          setSelectedFriendForModal(null);
        }}
        friend={selectedFriendForModal}
        onMessage={(friendId) => {
          selectFriend(friendId);
          const friend = friends.find((f) => f.id === friendId);
          if (friend?.public_id) navigate(`/dm/${friend.public_id}`);
          setShowFriendProfileModal(false);
        }}
      />
    </>
  );
}
