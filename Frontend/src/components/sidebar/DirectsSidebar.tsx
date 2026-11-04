import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bot, Plus, Users, X } from "lucide-react";
import { cn, getAvatarUrl, formatMessagePreview } from "@/lib/utils";
import { useFriends } from "@/contexts/FriendsContext";
import { useDirectMessages } from "@/contexts/DirectMessagesContext";
import { useRealtime } from "@/hooks/useRealtime";
import { useUnreadCounts } from "@/hooks/useUnreadCounts";
import { usePresence, type Presence } from "@/hooks/usePresence";
import authService from "@/services/authService";
import { Icon } from "@/components/app/Icon";
import { OPEN_PALETTE_EVENT } from "@/components/app/CommandPalette";
import { SidebarListSkeleton } from "@/components/chat/MessageListSkeleton";
import AgentLogo from "@/components/ai-agents/AgentLogo";
import { PRESENCE_DOT } from "@/lib/presence";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AccountMenu } from "./AccountMenu";

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

// Conversations closed with the row's ×: user id -> when. A newer message brings it back.
const HIDDEN_KEY = "auraflow:hidden-dms";

function readHidden(): Record<number, number> {
  try {
    return JSON.parse(localStorage.getItem(HIDDEN_KEY) || "{}");
  } catch {
    return {};
  }
}

const openPalette = () => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));

function PersonAvatar({ username, url, presence }: { username: string; url?: string; presence: Presence }) {
  return (
    <span className="relative h-8 w-8 shrink-0">
      <img src={getAvatarUrl(url, username)} alt="" className="h-8 w-8 rounded-full object-cover" />
      <span
        aria-label={presence}
        className={cn(
          "absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[3px] border-[hsl(var(--theme-sidebar-bg))]",
          PRESENCE_DOT[presence],
        )}
      />
    </span>
  );
}

function NavItem({ label, icon, active, badge, onClick }: { label: string; icon: typeof Users; active: boolean; badge?: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-10 w-full items-center gap-3 rounded-md px-2 text-left text-sm font-medium transition-colors duration-150",
        active
          ? "bg-[hsl(var(--theme-bg-active))] text-foreground"
          : "text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] hover:text-foreground",
      )}
    >
      <Icon icon={icon} size="lg" filled={active} />
      <span className="flex-1">{label}</span>
      {!!badge && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[hsl(0_68%_46%)] px-1.5 text-xs font-semibold text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

/**
 * Discord-style DM home sidebar: "Find or start a conversation" (opens the
 * Ctrl+K palette), Friends and Agents, then every conversation, newest first.
 * The open conversation comes from the URL, so exactly one row is active.
 * (Communities live only on the rail; the friends list lives on /friends.)
 */
export default function DirectsSidebar({ frozen = false, fluid = false }: DirectsSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { pendingRequests = [] } = useFriends();
  const { selectFriend, isLoadingFriends } = useRealtime();
  const { conversations } = useDirectMessages();
  const { markDMRead, getDMUnread } = useUnreadCounts();
  const presenceOf = usePresence();

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [hidden, setHidden] = useState<Record<number, number>>(readHidden);

  useEffect(() => {
    authService
      .getMe()
      .then(setCurrentUser)
      .catch((error) => console.error("Failed to load user data:", error));
  }, []);

  const activePublicId = location.pathname.startsWith("/dm/") ? location.pathname.slice(4).split("/")[0] : null;

  const hide = (userId: number) => {
    const next = { ...hidden, [userId]: Date.now() };
    setHidden(next);
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable: hidden for this session only */
    }
  };

  const visibleConversations = conversations
    .filter((conv) => {
      if (!conv.last_message) return false;
      if (conv.user?.public_id && conv.user.public_id === activePublicId) return true;
      const hiddenAt = hidden[conv.user_id];
      return !hiddenAt || new Date(conv.last_message_time || 0).getTime() > hiddenAt;
    })
    .sort((a, b) => new Date(b.last_message_time || 0).getTime() - new Date(a.last_message_time || 0).getTime());

  return (
    <aside
      aria-label="Direct messages"
      className={cn(
        "flex h-full flex-col border-r border-border",
        fluid ? "w-full" : "w-sidebar shrink-0",
        frozen && "pointer-events-none",
      )}
      style={{ background: "var(--theme-sidebar-gradient)" }}
    >
      <div className="flex h-12 shrink-0 items-center border-b border-border px-2.5">
        <button
          type="button"
          onClick={openPalette}
          title="Find or start a conversation (Ctrl+K)"
          className="flex h-7 w-full items-center rounded-md bg-[hsl(var(--theme-input-bg))] px-2 text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className="flex-1 truncate">Find or start a conversation</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        <nav aria-label="Messages" className="space-y-0.5">
          <NavItem
            label="Friends"
            icon={Users}
            active={location.pathname === "/friends"}
            badge={pendingRequests.length}
            onClick={() => navigate("/friends")}
          />
          <NavItem label="Agents" icon={Bot} active={false} onClick={() => navigate("/agents")} />
        </nav>

        <div className="mt-4 flex items-center justify-between px-2 pb-1">
          <h3 className="text-xs font-medium text-muted-foreground">Direct messages</h3>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={openPalette}
                aria-label="New message"
                className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
              >
                <Icon icon={Plus} size="md" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">New message</TooltipContent>
          </Tooltip>
        </div>

        {isLoadingFriends && conversations.length === 0 ? (
          <SidebarListSkeleton rows={5} />
        ) : visibleConversations.length === 0 ? (
          <p className="px-2 py-2 text-sm text-muted-foreground">No conversations yet. Start one with a friend.</p>
        ) : (
          <div role="list" className="space-y-0.5">
            {visibleConversations.map((conv) => {
              const isActive = !!conv.user.public_id && conv.user.public_id === activePublicId;
              const unread = getDMUnread(conv.user_id);
              const name = conv.user.display_name || conv.user.username;
              return (
                <div
                  key={conv.user_id}
                  role="listitem"
                  className={cn(
                    "group relative flex items-center rounded-md transition-colors duration-150",
                    isActive
                      ? "bg-[hsl(var(--theme-bg-active))] text-foreground"
                      : "text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] hover:text-foreground",
                  )}
                >
                  <button
                    type="button"
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => {
                      selectFriend(conv.user_id);
                      markDMRead(conv.user_id);
                      if (conv.user.public_id) navigate(`/dm/${conv.user.public_id}`);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-3 px-2 py-1.5 text-left"
                  >
                    {conv.user.is_bot ? (
                      <AgentLogo size="sm" avatarUrl={conv.user.avatar_url} username={conv.user.username} name={name} />
                    ) : (
                      <PersonAvatar username={conv.user.username} url={conv.user.avatar_url} presence={presenceOf(conv.user.username, conv.user_id)} />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className={cn("flex items-center gap-1 text-sm", unread > 0 ? "font-semibold text-foreground" : "font-medium")}>
                        <span className="truncate">{name}</span>
                        {conv.user.is_bot && (
                          <span className="shrink-0 rounded bg-[hsl(var(--theme-bg-tertiary))] px-1 text-xs font-semibold text-muted-foreground">APP</span>
                        )}
                      </span>
                      <span className={cn("block truncate text-xs", unread > 0 ? "text-foreground" : "text-muted-foreground")}>
                        {conv.last_message.sender_id === currentUser?.id ? "You: " : ""}
                        {formatMessagePreview(conv.last_message)}
                      </span>
                    </span>
                    {unread > 0 && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[hsl(0_68%_46%)] px-1.5 text-xs font-semibold text-white group-hover:hidden">
                        {unread > 99 ? "99+" : unread}
                      </span>
                    )}
                  </button>
                  {!isActive && (
                    <button
                      type="button"
                      onClick={() => hide(conv.user_id)}
                      aria-label={`Close conversation with ${name}`}
                      title="Close"
                      className="mr-1 hidden h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:flex group-hover:flex"
                    >
                      <Icon icon={X} size="md" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {/* Desktop: the floating user dock (AppShell) sits here. Mobile drawer: the panel. */}
      <div aria-hidden className="hidden h-[72px] shrink-0 md:block" />
      <AccountMenu variant="panel" className="md:hidden" />
    </aside>
  );
}
