// "Add Friend" (Discord): a short explanation, one search box with the send
// button inside it, and live results underneath with an Add button on each.
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, Search, UserPlus } from "lucide-react";
import { channelService } from "@/services/channelService";
import { useToast } from "@/hooks/use-toast";
import { getAvatarUrl } from "@/lib/utils";
import type { User as UserType } from "@/types";

interface Props {
  /** Sends a request by username; throws with a readable message on failure. */
  onSendRequest: (username: string) => Promise<void>;
  /** Usernames you are already friends with (shown as "Friends" instead of Add). */
  friendUsernames?: string[];
}

export default function AddFriendPanel({ onSendRequest, friendUsernames = [] }: Props) {
  const { toast } = useToast();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<UserType[]>([]);
  const [searching, setSearching] = useState(false);
  const [sendingName, setSendingName] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const friends = new Set(friendUsernames.map((u) => u.toLowerCase()));

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const search = useCallback((value: string) => {
    setTerm(value);
    if (timer.current) clearTimeout(timer.current);
    if (value.trim().length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    timer.current = setTimeout(async () => {
      try {
        setResults(await channelService.searchUsers(value.trim()));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, []);

  const send = async (username: string) => {
    const name = username.trim().replace(/^@/, "");
    if (!name) return;
    setSendingName(name);
    try {
      await onSendRequest(name);
      setSent((s) => new Set(s).add(name.toLowerCase()));
      toast({ title: `Friend request sent to ${name}`, variant: "success" });
    } catch (e) {
      // The API says why (already friends, no such user…); fall back to the HTTP message.
      const err = e as { response?: { data?: { message?: string; error?: string } }; message?: string };
      const why = err.response?.data?.message || err.response?.data?.error || err.message;
      toast({ title: "Could not send the request", description: why, variant: "destructive" });
    } finally {
      setSendingName(null);
    }
  };

  const typed = term.trim().replace(/^@/, "");

  return (
    <section aria-labelledby="add-friend-title" data-testid="add-friend">
      <h2 id="add-friend-title" className="text-base font-semibold text-foreground">Add Friend</h2>
      <p className="mt-1 text-sm text-muted-foreground">You can add friends with their AuraFlow username.</p>

      <form
        className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-[hsl(var(--theme-input-bg))] py-1.5 pl-3 pr-1.5 focus-within:border-primary"
        onSubmit={(e) => { e.preventDefault(); void send(typed); }}
      >
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          value={term}
          onChange={(e) => search(e.target.value)}
          placeholder="Type a username"
          aria-label="Username"
          autoFocus
          className="h-9 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          disabled={!typed || sendingName !== null}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-opacity duration-100 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sendingName === typed && typed ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          <span className="hidden sm:inline">Send Friend Request</span><span className="sm:hidden">Send</span>
        </button>
      </form>

      {(searching || results.length > 0 || typed.length >= 2) && (
        <div className="mt-4">
          <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {searching ? "Searching…" : `People — ${results.length}`}
          </p>
          {!searching && results.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">Nobody found with “{typed}”. Check the spelling, or send the request by exact username.</p>
          ) : (
            <ul>
              {results.map((u) => {
                const key = u.username.toLowerCase();
                const isFriend = friends.has(key);
                const isSent = sent.has(key);
                return (
                  <li key={u.id} className="flex items-center gap-3 rounded-lg border-t border-border px-3 py-2.5 first:border-t-0 hover:bg-[hsl(var(--theme-bg-hover)/0.6)]">
                    <img src={getAvatarUrl(u.avatar_url, u.username)} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">{u.display_name || u.username}</span>
                      <span className="block truncate text-xs text-muted-foreground">@{u.username}</span>
                    </span>
                    {isFriend ? (
                      <span className="text-xs font-medium text-muted-foreground">Friends</span>
                    ) : isSent ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-success"><Check className="h-3.5 w-3.5" /> Sent</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void send(u.username)}
                        disabled={sendingName !== null}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[hsl(var(--theme-bg-tertiary))] px-3 text-sm font-medium text-foreground hover:bg-[hsl(var(--theme-bg-hover))] disabled:opacity-50"
                      >
                        {sendingName === u.username ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Add
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
