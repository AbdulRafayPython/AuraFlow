// Discord-style profile column for a DM: shown in the right pane next to the
// conversation (avatar, presence, about, member since, shared communities).
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, Users } from "lucide-react";
import { statusService, type UserProfile } from "@/services/statusService";
import { usePresence } from "@/hooks/usePresence";
import { cn, getAvatarUrl } from "@/lib/utils";
import { API_SERVER } from "@/config/api";
import { Icon } from "@/components/app/Icon";
import { PRESENCE_DOT } from "@/lib/presence";
import { bannerSrc } from "@/components/profile/ProfileCard";

const PRESENCE_LABEL = { online: "Online", idle: "Idle", dnd: "Do not disturb", offline: "Offline" } as const;

export function ProfilePane({ username, userId }: { username: string; userId: number }) {
  const navigate = useNavigate();
  const presenceOf = usePresence();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setProfile(null);
    setError(false);
    statusService
      .getUserProfile(username)
      .then((p) => !cancelled && setProfile(p))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [username]);

  if (error) {
    return <p className="p-4 text-sm text-muted-foreground">Could not load this profile.</p>;
  }
  if (!profile) {
    return (
      <div className="space-y-3 p-4" aria-busy>
        <div className="h-20 w-20 rounded-full bg-[hsl(var(--theme-bg-tertiary))]" />
        <div className="h-4 w-32 rounded bg-[hsl(var(--theme-bg-tertiary))]" />
        <div className="h-3 w-24 rounded bg-[hsl(var(--theme-bg-tertiary))]" />
      </div>
    );
  }

  const presence = presenceOf(profile.username, userId, profile.status);
  const memberSince = profile.member_since
    ? new Date(profile.member_since).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
    : null;

  return (
    <div className="pb-4">
      <div className="h-16 bg-[hsl(var(--theme-bg-tertiary))]" style={bannerSrc(profile.banner_url) ? { backgroundImage: `url("${bannerSrc(profile.banner_url)}")`, backgroundSize: "cover", backgroundPosition: "center" } : profile.banner_color ? { backgroundColor: profile.banner_color } : undefined} />
      <div className="-mt-10 px-4">
        <span className="relative block h-20 w-20 rounded-full border-[6px] border-[hsl(var(--theme-bg-elevated))]">
          <img src={getAvatarUrl(profile.avatar_url, profile.username)} alt="" className="h-full w-full rounded-full object-cover" />
          <span
            aria-label={PRESENCE_LABEL[presence]}
            className={cn("absolute bottom-0 right-0 h-5 w-5 rounded-full border-4 border-[hsl(var(--theme-bg-elevated))]", PRESENCE_DOT[presence])}
          />
        </span>
      </div>

      <div className="px-4 pt-2">
        <h3 className="text-lg font-semibold leading-tight text-foreground">{profile.display_name || profile.username}</h3>
        <p className="text-sm text-muted-foreground">@{profile.username}</p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={cn("h-2 w-2 rounded-full", PRESENCE_DOT[presence])} />
          {profile.custom_status ? (
            <span className="truncate text-foreground">
              {profile.custom_status_emoji} {profile.custom_status}
            </span>
          ) : (
            PRESENCE_LABEL[presence]
          )}
        </p>
      </div>

      <div className="mx-4 my-3 rounded-lg border border-border p-3 space-y-3">
        {profile.bio && (
          <section>
            <h4 className="mb-1 text-xs font-medium text-muted-foreground">About me</h4>
            <p className="whitespace-pre-wrap text-sm text-foreground">{profile.bio}</p>
          </section>
        )}
        {memberSince && (
          <section>
            <h4 className="mb-1 text-xs font-medium text-muted-foreground">Member since</h4>
            <p className="flex items-center gap-1.5 text-sm text-foreground">
              <Icon icon={Clock} size="sm" className="text-muted-foreground" /> {memberSince}
            </p>
          </section>
        )}
        {profile.mutual_friends_count > 0 && (
          <p className="flex items-center gap-1.5 text-sm text-foreground">
            <Icon icon={Users} size="sm" className="text-muted-foreground" />
            {profile.mutual_friends_count} mutual friend{profile.mutual_friends_count !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {profile.shared_communities.length > 0 && (
        <section className="px-4">
          <h4 className="mb-1 text-xs font-medium text-muted-foreground">
            Mutual communities — {profile.shared_communities.length}
          </h4>
          <ul className="space-y-0.5">
            {profile.shared_communities.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => c.public_id && navigate(`/community/${c.public_id}`)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-[hsl(var(--theme-bg-hover))]"
                >
                  {c.logo_url ? (
                    <img src={c.logo_url.startsWith("http") ? c.logo_url : `${API_SERVER}${c.logo_url}`} alt="" className="h-6 w-6 rounded-md object-cover" />
                  ) : (
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-md text-xs font-semibold text-white"
                      style={{ backgroundColor: c.color }}
                    >
                      {c.icon}
                    </span>
                  )}
                  <span className="truncate">{c.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default ProfilePane;
