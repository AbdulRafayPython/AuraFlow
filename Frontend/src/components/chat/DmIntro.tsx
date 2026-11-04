// The top of a DM, like the start of a conversation in Discord: their big
// avatar and name, "This is the beginning…", what you share (communities and
// friends, both real data from GET /api/status/user/<name>) and the friend
// actions that fit right now. In a brand-new DM, Orbi waves underneath with a
// one-click "Wave" that sends 👋.
import { useEffect, useState } from "react";
import { statusService, type UserProfile } from "@/services/statusService";
import { useFriends } from "@/contexts/FriendsContext";
import { useConfirm } from "@/components/modals/ConfirmDialog";
import { useToast } from "@/hooks/use-toast";
import { API_SERVER } from "@/config/api";
import { cn, getAvatarUrl } from "@/lib/utils";
import WaveMascot from "./WaveMascot";

interface DmIntroProps {
  userId: number;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  /** An agent's DM: its logo instead of a photo, and no friend actions. */
  botAvatar?: React.ReactNode;
  /** Show Orbi and the Wave button (the DM has no messages yet). */
  empty: boolean;
  onWave: () => Promise<void> | void;
  onOpenProfile: () => void;
}

const assetUrl = (path?: string | null) => (!path ? null : /^https?:\/\//.test(path) ? path : `${API_SERVER}${path}`);
const btn = "inline-flex h-8 items-center rounded-[4px] px-4 text-sm font-medium transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-60";
const grey = "bg-[hsl(var(--theme-bg-tertiary))] text-foreground hover:bg-[hsl(var(--theme-bg-hover))]";

export default function DmIntro({
  userId, username, displayName, avatarUrl, botAvatar, empty, onWave, onOpenProfile,
}: DmIntroProps) {
  const { friends, pendingRequests, sendFriendRequest, acceptFriendRequest, removeFriend, blockUser } = useFriends();
  const confirm = useConfirm();
  const { toast } = useToast();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [waving, setWaving] = useState(false);
  const [requested, setRequested] = useState(false);

  useEffect(() => {
    if (botAvatar) return;
    let live = true;
    setProfile(null);
    setRequested(false);
    statusService.getUserProfile(username).then((p) => { if (live) setProfile(p); }).catch(() => {});
    return () => { live = false; };
  }, [username, botAvatar]);

  const isFriend = friends.some((f) => f.id === userId);
  const incoming = pendingRequests.find((r) => r.sender_id === userId);
  const sent = requested || profile?.friendship_status === "pending_sent";
  const communities = profile?.shared_communities ?? [];
  const mutualFriends = profile?.mutual_friends_count ?? 0;

  const run = async (work: () => Promise<unknown>, done: string, failed: string) => {
    setBusy(true);
    try {
      await work();
      toast({ title: done, variant: "success" });
    } catch {
      toast({ title: failed, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Remove ${displayName}?`,
      description: "You can still message each other here, and you can add them again later.",
      confirmText: "Remove Friend",
      danger: true,
    });
    if (ok) await run(() => removeFriend(userId), `${displayName} removed from friends`, "Could not remove friend");
  };

  const block = async () => {
    const ok = await confirm({
      title: `Block ${displayName}?`,
      description: "They won't be able to message you, and they are removed from your friends.",
      confirmText: "Block",
      danger: true,
    });
    if (ok) await run(() => blockUser(userId), `${displayName} is blocked`, "Could not block");
  };

  const wave = async () => {
    setWaving(true);
    try { await onWave(); } finally { setWaving(false); }
  };

  return (
    <section className="af-dm-intro px-4 pb-4 pt-6" aria-label={`Start of your conversation with ${displayName}`} data-testid="dm-intro">
      {botAvatar ?? (
        <img
          src={getAvatarUrl(avatarUrl ?? undefined, username)}
          alt=""
          className="h-20 w-20 rounded-full object-cover"
        />
      )}
      <h2 className="mt-3 break-words text-[32px] font-bold leading-10 text-foreground">{displayName}</h2>
      <p className="text-xl font-medium leading-7 text-[hsl(var(--theme-text-secondary))]">{username}</p>
      <p className="mt-2 text-base text-muted-foreground">
        {botAvatar ? (
          <>This is the start of your conversation with <strong className="font-semibold text-foreground">{displayName}</strong>. Only you can see what it says here.</>
        ) : (
          <>This is the beginning of your direct message history with <strong className="font-semibold text-foreground">{displayName}</strong>.</>
        )}
      </p>

      {!botAvatar && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
          {profile && (
            <button
              type="button"
              onClick={onOpenProfile}
              className="flex items-center gap-2 text-sm text-muted-foreground transition-colors duration-100 hover:text-foreground"
            >
              {communities.length > 0 && (
                <span className="flex -space-x-1.5" aria-hidden>
                  {communities.slice(0, 3).map((c) => {
                    const logo = assetUrl(c.logo_url);
                    return logo ? (
                      <img key={c.id} src={logo} alt="" className="h-6 w-6 rounded-full border-2 border-[hsl(var(--theme-bg-primary))] object-cover" />
                    ) : (
                      <span
                        key={c.id}
                        className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-[hsl(var(--theme-bg-primary))] text-xs font-semibold text-white"
                        style={{ backgroundColor: c.color || "hsl(var(--primary))" }}
                      >
                        {(c.icon && c.icon.length <= 2 ? c.icon : c.name.slice(0, 1)).toUpperCase()}
                      </span>
                    );
                  })}
                </span>
              )}
              <span className="hover:underline">
                {communities.length === 0
                  ? "No communities in common"
                  : `${communities.length} Mutual ${communities.length === 1 ? "Community" : "Communities"}`}
              </span>
              {mutualFriends > 0 && (
                <>
                  <span className="h-1 w-1 rounded-full bg-muted-foreground" aria-hidden />
                  <span className="hover:underline">{mutualFriends} Mutual {mutualFriends === 1 ? "Friend" : "Friends"}</span>
                </>
              )}
            </button>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {isFriend ? (
              <button type="button" className={cn(btn, grey)} disabled={busy} onClick={() => void remove()}>Remove Friend</button>
            ) : incoming ? (
              <button type="button" className={cn(btn, "bg-primary text-primary-foreground hover:opacity-90")} disabled={busy}
                      onClick={() => void run(() => acceptFriendRequest(incoming.id), `You and ${displayName} are now friends`, "Could not accept the request")}>
                Accept Friend Request
              </button>
            ) : sent ? (
              <button type="button" className={cn(btn, grey)} disabled>Friend Request Sent</button>
            ) : profile ? (
              <button type="button" className={cn(btn, "bg-primary text-primary-foreground hover:opacity-90")} disabled={busy}
                      onClick={() => void run(async () => { await sendFriendRequest(username); setRequested(true); }, `Friend request sent to ${displayName}`, "Could not send the request")}>
                Add Friend
              </button>
            ) : null}
            <button type="button" className={cn(btn, grey)} disabled={busy} onClick={() => void block()}>Block</button>
          </div>
        </div>
      )}

      {empty && (
        <div className="mt-10 flex flex-col items-center text-center" data-testid="dm-wave">
          <WaveMascot className="h-32 w-32" />
          <p className="mt-2 text-sm text-muted-foreground">Say hi to {displayName} — a wave is a good start.</p>
          <button
            type="button"
            onClick={() => void wave()}
            disabled={waving}
            className={cn(btn, "mt-3 h-10 gap-2 bg-primary px-5 text-primary-foreground hover:opacity-90")}
          >
            <span aria-hidden>👋</span> Wave to {displayName}
          </button>
        </div>
      )}
    </section>
  );
}
