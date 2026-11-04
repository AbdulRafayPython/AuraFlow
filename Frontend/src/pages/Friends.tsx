// Friends (/friends), laid out like Discord's Friends page and AuraFlow's Your
// agents: a top bar with Online / All / Pending / Blocked and an "Add Friend"
// tab, a search box, uppercase labels with counts ("ONLINE — 3"), and rows with
// the avatar + status, name, what they are up to, and round buttons that show
// on hover (Message, Call, ⋯). Add Friend opens on the page, not in a modal.
import { useMemo, useState } from "react";
import {
  Ban, Check, MessageCircle, MoreHorizontal, Phone, Search, UserMinus, UserRound, Users, Video, X,
} from "lucide-react";
import { useFriends } from "@/contexts/FriendsContext";
import { useDirectMessages } from "@/contexts/DirectMessagesContext";
import { useCall, type CallPeer } from "@/contexts/CallContext";
import { useToast } from "@/hooks/use-toast";
import { getAvatarUrl, cn } from "@/lib/utils";
import type { Friend } from "@/types";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConfirm } from "@/components/modals/ConfirmDialog";
import FriendProfileModal from "@/components/modals/FriendProfileModal";
import AddFriendPanel from "@/components/friends/AddFriendPanel";
import { PRESENCE_DOT, PRESENCE_LABEL, isOnline, lastSeenText } from "@/components/friends/presence";

type Tab = "online" | "all" | "pending" | "blocked" | "add";

interface FriendsProps {
  onOpenDM?: (friendId: number) => void;
}

const LABEL = "px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground";
const roundBtn = "flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-secondary))] transition-colors duration-100 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50";

/** One person in a list: avatar (+ status dot), name, a second line, and actions on the right. */
function PersonRow({ name, username, avatarUrl, status, subtitle, onOpen, actions, testId }: {
  name: string;
  username: string;
  avatarUrl?: string | null;
  status?: Friend["status"];
  subtitle: React.ReactNode;
  onOpen?: () => void;
  actions: React.ReactNode;
  testId?: string;
}) {
  return (
    <li data-testid={testId} className="group relative border-t border-border first:border-t-0 hover:border-transparent [&+li]:hover:border-transparent">
      <div className="-mx-1 flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors duration-100 group-hover:bg-[hsl(var(--theme-bg-hover))]">
        <button type="button" onClick={onOpen} disabled={!onOpen}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default">
          <span className="relative shrink-0">
            <img src={getAvatarUrl(avatarUrl ?? undefined, username)} alt="" className="h-9 w-9 rounded-full object-cover" />
            {status && (
              <span title={PRESENCE_LABEL[status]}
                    className={cn("absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[3px] border-[hsl(var(--theme-bg-primary))] transition-colors duration-100 group-hover:border-[hsl(var(--theme-bg-hover))]", PRESENCE_DOT[status])} />
            )}
          </span>
          <span className="min-w-0">
            <span className="flex items-baseline gap-1.5">
              <span className="truncate text-base font-semibold text-foreground">{name}</span>
              <span className="hidden truncate text-sm text-muted-foreground opacity-0 transition-opacity duration-100 group-hover:opacity-100 sm:inline">@{username}</span>
            </span>
            <span className="block truncate text-sm text-muted-foreground">{subtitle}</span>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      </div>
    </li>
  );
}

export default function Friends({ onOpenDM }: FriendsProps) {
  const {
    friends, pendingRequests = [], sentRequests = [], blockedUsers = [],
    acceptFriendRequest, rejectFriendRequest, cancelFriendRequest, removeFriend, blockUser, unblockUser, sendFriendRequest,
  } = useFriends();
  const { selectConversation } = useDirectMessages();
  const { initiateCall, callState } = useCall();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>("online");
  const [query, setQuery] = useState("");
  const [profile, setProfile] = useState<Friend | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const canCall = callState === "idle";

  const message = async (friendId: number) => {
    try {
      if (onOpenDM) onOpenDM(friendId);
      else await selectConversation(friendId);
    } catch {
      toast({ title: "Could not open the conversation", variant: "destructive" });
    }
  };

  const call = (f: Friend, kind: "audio" | "video") => {
    if (!canCall) {
      toast({ title: "You are already in a call", variant: "info" });
      return;
    }
    const peer: CallPeer = { id: f.id, username: f.username, display_name: f.display_name, avatar_url: f.avatar_url || f.avatar || null };
    initiateCall(peer, kind);
  };

  const run = async (key: string, work: () => Promise<void>, done: string, failed: string) => {
    setBusy(key);
    try {
      await work();
      toast({ title: done, variant: "success" });
    } catch {
      toast({ title: failed, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const askRemove = async (f: Friend) => {
    const ok = await confirm({
      title: `Remove ${f.display_name}?`,
      description: "You will no longer be friends. You can send a new request later.",
      confirmText: "Remove Friend",
      danger: true,
    });
    if (ok) await run(`remove-${f.id}`, () => removeFriend(f.id), `${f.display_name} was removed`, "Could not remove this friend");
  };

  const askBlock = async (f: { id: number; display_name: string }) => {
    const ok = await confirm({
      title: `Block ${f.display_name}?`,
      description: "They can't message you or send you friend requests. They are also removed from your friends.",
      confirmText: "Block",
      danger: true,
    });
    if (ok) await run(`block-${f.id}`, () => blockUser(f.id), `${f.display_name} is blocked`, "Could not block");
  };

  const q = query.trim().toLowerCase();
  const matches = (name: string, username: string) => !q || name.toLowerCase().includes(q) || username.toLowerCase().includes(q);

  const online = useMemo(() => friends.filter(isOnline), [friends]);
  const shownFriends = (tab === "online" ? online : friends)
    .filter((f) => matches(f.display_name, f.username))
    .sort((a, b) => Number(isOnline(b)) - Number(isOnline(a)) || a.display_name.localeCompare(b.display_name));
  const incoming = pendingRequests.filter((r) => matches(r.display_name || r.username, r.username));
  const outgoing = sentRequests.filter((r) => matches(r.display_name || r.username, r.username));
  const blocked = blockedUsers.filter((b) => matches(b.blocked_user.display_name || b.blocked_user.username, b.blocked_user.username));

  const tabBtn = (key: Tab, label: string, badge?: number) => (
    <button
      key={key}
      type="button"
      role="tab"
      aria-selected={tab === key}
      onClick={() => { setTab(key); setQuery(""); }}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors duration-100",
        tab === key ? "bg-[hsl(var(--theme-bg-active))] text-foreground" : "text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] hover:text-foreground",
      )}
    >
      {label}
      {badge ? <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-xs font-semibold leading-none text-white">{badge}</span> : null}
    </button>
  );

  const empty = (title: string, text: string) => (
    <div className="flex flex-col items-center px-6 py-14 text-center" data-testid="friends-empty">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[hsl(var(--theme-bg-tertiary))] text-muted-foreground">
        <Users className="h-7 w-7" />
      </span>
      <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{text}</p>
      <button type="button" onClick={() => setTab("add")}
              className="mt-4 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
        Add Friend
      </button>
    </div>
  );

  const friendRow = (f: Friend) => {
    const seen = f.status === "offline" ? lastSeenText(f.last_seen) : null;
    return (
      <PersonRow
        key={f.id}
        testId="friend-row"
        name={f.display_name}
        username={f.username}
        avatarUrl={f.avatar_url || f.avatar}
        status={f.status}
        subtitle={f.custom_status || (seen ? `Offline · last seen ${seen}` : PRESENCE_LABEL[f.status])}
        onOpen={() => setProfile(f)}
        actions={
          <>
            <button type="button" className={cn(roundBtn, "hover:bg-[hsl(var(--theme-bg-hover))]")} aria-label={`Message ${f.display_name}`} title="Message"
                    onClick={() => void message(f.id)}>
              <MessageCircle className="h-4 w-4" />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className={cn(roundBtn, "hover:bg-[hsl(var(--theme-bg-hover))]")} aria-label={`More for ${f.display_name}`} title="More">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onSelect={() => setProfile(f)}><UserRound /> View Profile</DropdownMenuItem>
                <DropdownMenuItem disabled={!canCall} onSelect={() => call(f, "audio")}><Phone /> Start Voice Call</DropdownMenuItem>
                <DropdownMenuItem disabled={!canCall} onSelect={() => call(f, "video")}><Video /> Start Video Call</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void askRemove(f)} className="text-destructive focus:bg-destructive/10 focus:text-destructive">
                  <UserMinus /> Remove Friend
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void askBlock(f)} className="text-destructive focus:bg-destructive/10 focus:text-destructive">
                  <Ban /> Block
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
    );
  };

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      {/* Top bar (Discord's Friends header) */}
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border pl-16 pr-4 md:pl-4">
        <h1 className="flex shrink-0 items-center gap-2 text-base font-semibold text-foreground">
          <Users className="h-5 w-5 text-muted-foreground" /> Friends
        </h1>
        <span className="hidden h-6 w-px bg-border sm:block" aria-hidden />
        <div role="tablist" aria-label="Show" className="flex min-w-0 items-center gap-1 overflow-x-auto scrollbar-none">
          {tabBtn("online", "Online")}
          {tabBtn("all", "All")}
          {tabBtn("pending", "Pending", pendingRequests.length)}
          {tabBtn("blocked", "Blocked")}
          <button
            type="button"
            role="tab"
            aria-selected={tab === "add"}
            onClick={() => setTab("add")}
            className={cn(
              "ml-1 inline-flex h-8 shrink-0 items-center rounded-md px-2.5 text-sm font-medium transition-colors duration-100",
              tab === "add" ? "bg-transparent text-[hsl(var(--theme-text-accent))]" : "bg-primary text-primary-foreground hover:opacity-90",
            )}
          >
            Add Friend
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 pb-10 pt-4 sm:px-6">
          {tab === "add" ? (
            <AddFriendPanel onSendRequest={sendFriendRequest} friendUsernames={friends.map((f) => f.username)} />
          ) : (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search"
                  aria-label="Search friends"
                  className="h-9 w-full rounded-md bg-[hsl(var(--theme-input-bg))] pl-9 pr-9 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary [&::-webkit-search-cancel-button]:hidden"
                />
                {query && (
                  <button type="button" onClick={() => setQuery("")} aria-label="Clear search"
                          className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {(tab === "online" || tab === "all") && (
                <section className="mt-5">
                  <h2 className={LABEL}>{tab === "online" ? "Online" : "All friends"} — {shownFriends.length}</h2>
                  {shownFriends.length > 0 ? (
                    <ul>{shownFriends.map(friendRow)}</ul>
                  ) : q ? (
                    <p className="px-3 py-6 text-center text-sm text-muted-foreground">No friends match “{query.trim()}”.</p>
                  ) : friends.length === 0 ? (
                    empty("No friends yet", "Add someone by their username and they will show up here.")
                  ) : (
                    empty("No one's around right now", "None of your friends are online. Check All to see everyone.")
                  )}
                </section>
              )}

              {tab === "pending" && (
                <>
                  {incoming.length + outgoing.length === 0 && !q
                    ? empty("No pending requests", "Friend requests you get or send wait here until someone answers.")
                    : null}
                  {incoming.length > 0 && (
                    <section className="mt-5">
                      <h2 className={LABEL}>Received — {incoming.length}</h2>
                      <ul>
                        {incoming.map((r) => (
                          <PersonRow
                            key={r.id}
                            testId="request-row"
                            name={r.display_name || r.username}
                            username={r.username}
                            avatarUrl={r.avatar_url}
                            subtitle="Wants to be your friend"
                            actions={
                              <>
                                <button type="button" disabled={busy !== null} aria-label={`Accept ${r.username}`} title="Accept"
                                        className={cn(roundBtn, "hover:bg-success/15 hover:text-success")}
                                        onClick={() => void run(`acc-${r.id}`, () => acceptFriendRequest(r.id), `You and ${r.display_name || r.username} are now friends`, "Could not accept")}>
                                  <Check className="h-4 w-4" />
                                </button>
                                <button type="button" disabled={busy !== null} aria-label={`Ignore ${r.username}`} title="Ignore"
                                        className={cn(roundBtn, "hover:bg-destructive/15 hover:text-destructive")}
                                        onClick={() => void run(`rej-${r.id}`, () => rejectFriendRequest(r.id), "Request ignored", "Could not ignore")}>
                                  <X className="h-4 w-4" />
                                </button>
                              </>
                            }
                          />
                        ))}
                      </ul>
                    </section>
                  )}
                  {outgoing.length > 0 && (
                    <section className="mt-5">
                      <h2 className={LABEL}>Sent — {outgoing.length}</h2>
                      <ul>
                        {outgoing.map((r) => (
                          <PersonRow
                            key={r.id}
                            testId="request-row"
                            name={r.display_name || r.username}
                            username={r.username}
                            avatarUrl={r.avatar_url}
                            subtitle="Waiting for them to accept"
                            actions={
                              <button type="button" disabled={busy !== null} aria-label={`Cancel request to ${r.username}`} title="Cancel request"
                                      className={cn(roundBtn, "hover:bg-destructive/15 hover:text-destructive")}
                                      onClick={() => void run(`can-${r.id}`, () => cancelFriendRequest(r.id), "Request cancelled", "Could not cancel")}>
                                <X className="h-4 w-4" />
                              </button>
                            }
                          />
                        ))}
                      </ul>
                    </section>
                  )}
                  {q && incoming.length + outgoing.length === 0 && (
                    <p className="px-3 py-6 text-center text-sm text-muted-foreground">No requests match “{query.trim()}”.</p>
                  )}
                </>
              )}

              {tab === "blocked" && (
                <section className="mt-5">
                  <h2 className={LABEL}>Blocked — {blocked.length}</h2>
                  {blocked.length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                      {q ? `No one matches “${query.trim()}”.` : "You haven't blocked anyone."}
                    </p>
                  ) : (
                    <ul>
                      {blocked.map((b) => (
                        <PersonRow
                          key={b.id}
                          testId="blocked-row"
                          name={b.blocked_user.display_name || b.blocked_user.username}
                          username={b.blocked_user.username}
                          avatarUrl={b.blocked_user.avatar_url}
                          subtitle="Blocked"
                          actions={
                            <button
                              type="button"
                              disabled={busy !== null}
                              className="inline-flex h-8 items-center rounded-md bg-[hsl(var(--theme-bg-tertiary))] px-3 text-sm font-medium text-foreground hover:bg-[hsl(var(--theme-bg-hover))] disabled:opacity-50"
                              onClick={async () => {
                                const name = b.blocked_user.display_name || b.blocked_user.username;
                                const ok = await confirm({ title: `Unblock ${name}?`, description: "They will be able to message you and send friend requests again.", confirmText: "Unblock" });
                                if (ok) await run(`unb-${b.blocked_user.id}`, () => unblockUser(b.blocked_user.id), `${name} is unblocked`, "Could not unblock");
                              }}
                            >
                              Unblock
                            </button>
                          }
                        />
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </main>

      <FriendProfileModal
        isOpen={profile !== null}
        onClose={() => setProfile(null)}
        friend={profile}
        onMessage={(id) => void message(id)}
        onCall={call}
        canCall={canCall}
        onRemove={(f) => void askRemove(f)}
        onBlock={(f) => void askBlock(f)}
      />
    </div>
  );
}
