// Joining a community, the Discord way: look first, then agree to the rules,
// then join. Step 1 previews the community (banner, counts, channel names —
// never messages); step 2 shows its rules and needs an explicit "I agree"
// (only when the community has rules); then it joins and opens it.
import { useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, Check, Globe, Hash, Loader2, Lock, Volume2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn, readableTextOn } from "@/lib/utils";
import { API_SERVER } from "@/config/api";
import { channelService } from "@/services/channelService";
import type { Community, CommunityPreview } from "@/types";

const CHANNELS_SHOWN = 6;

const assetUrl = (path?: string | null) => (!path ? null : /^https?:\/\//.test(path) ? path : `${API_SERVER}${path}`);
const initialsOf = (name: string) => name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
const formatCount = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K` : String(n));

interface JoinCommunityDialogProps {
  /** The card the user clicked: shown at once while the full preview loads. */
  community: Community | null;
  onOpenChange: (open: boolean) => void;
  /** Joined (or already a member): open the community. */
  onJoined: (community: Community) => void;
}

type Step = "preview" | "rules";

export function JoinCommunityDialog({ community, onOpenChange, onJoined }: JoinCommunityDialogProps) {
  const [preview, setPreview] = useState<CommunityPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("preview");
  const [agreed, setAgreed] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const id = community?.id;
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setPreview(null);
    setLoadError(null);
    setStep("preview");
    setAgreed(false);
    setJoinError(null);
    channelService
      .getCommunityPreview(id)
      .then((p) => !cancelled && setPreview(p))
      .catch((e: Error) => !cancelled && setLoadError(e.message));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!community) return null;

  const c = { ...community, ...(preview ?? {}) };
  const rules = preview?.rules ?? [];
  const banner = assetUrl(c.banner_url);
  const logo = assetUrl(c.logo_url);
  const color = c.color || "#5865f2";
  const isPrivate = c.visibility === "private";

  const join = async () => {
    setJoining(true);
    setJoinError(null);
    try {
      await channelService.joinCommunity(c.id, { acceptedRules: rules.length > 0 ? agreed : undefined });
      onJoined(c);
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === "rules_required") {
        // Rules were added since the preview loaded: show them.
        try {
          setPreview(await channelService.getCommunityPreview(c.id));
        } catch {
          /* keep the current preview */
        }
        setStep("rules");
      }
      setJoinError(err.message);
    } finally {
      setJoining(false);
    }
  };

  const primary = (() => {
    if (preview?.is_member) return { label: "Open community", onClick: () => onJoined(c), disabled: false };
    if (step === "preview" && rules.length > 0)
      return { label: "Continue", onClick: () => setStep("rules"), disabled: !preview || preview.is_blocked || isPrivate };
    return {
      label: joining ? "Joining…" : "Join community",
      onClick: join,
      disabled: !preview || joining || preview.is_blocked || isPrivate || (rules.length > 0 && !agreed),
    };
  })();

  return (
    <Dialog open={!!community} onOpenChange={(open) => !joining && onOpenChange(open)}>
      <DialogContent
        className="max-w-[440px] gap-0 overflow-hidden rounded-xl border-border bg-[hsl(var(--theme-bg-secondary))] p-0 [&>button:last-child]:right-3 [&>button:last-child]:top-3 [&>button:last-child]:rounded-full [&>button:last-child]:bg-black/40 [&>button:last-child]:p-1.5 [&>button:last-child]:text-white [&>button:last-child]:opacity-100"
      >
        {/* Banner + logo */}
        <div className="relative h-28 shrink-0" style={banner ? undefined : { backgroundColor: color }}>
          {banner && <img src={banner} alt="" className="h-full w-full object-cover" />}
          <span
            className="absolute -bottom-8 left-5 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border-[5px] border-[hsl(var(--theme-bg-secondary))] text-lg font-bold"
            style={logo ? undefined : { backgroundColor: color, color: readableTextOn(color) }}
          >
            {logo ? <img src={logo} alt="" className="h-full w-full object-cover" /> : c.icon || initialsOf(c.name)}
          </span>
        </div>

        <div className="px-5 pb-5 pt-11">
          <DialogTitle className="text-xl font-semibold leading-tight text-foreground">
            {step === "rules" ? `Before you join ${c.name}` : c.name}
          </DialogTitle>

          {step === "preview" ? (
            <>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 font-medium text-foreground">
                  {isPrivate ? <Lock className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
                  {isPrivate ? "Private · Invite only" : "Public · Anyone can join"}
                </span>
                {preview && (
                  <>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-success" aria-hidden />
                      {formatCount(preview.online_count ?? 0)} online
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-muted-foreground" aria-hidden />
                      {formatCount(preview.member_count ?? 0)} {preview.member_count === 1 ? "member" : "members"}
                    </span>
                  </>
                )}
              </div>
              <DialogDescription className="mt-3 text-sm text-[hsl(var(--theme-text-secondary))]">
                {c.description || "No description yet."}
              </DialogDescription>

              {/* Channels (names only) */}
              <section className="mt-4 rounded-lg border border-border bg-[hsl(var(--theme-bg-primary))] p-3" aria-label="Channels">
                <h3 className="mb-2 text-xs font-medium text-muted-foreground">Channels</h3>
                {loadError ? (
                  <p className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4" /> {loadError}
                  </p>
                ) : !preview ? (
                  <div className="space-y-2" aria-busy>
                    {[70, 55, 62].map((w) => (
                      <div key={w} className="h-4 animate-skeleton rounded bg-[hsl(var(--theme-bg-tertiary))]" style={{ width: `${w}%` }} />
                    ))}
                  </div>
                ) : preview.channels.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No channels yet.</p>
                ) : (
                  <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
                    {preview.channels.slice(0, CHANNELS_SHOWN).map((ch) => (
                      <li key={`${ch.type}-${ch.name}`} className="flex min-w-0 items-center gap-1.5 text-sm text-[hsl(var(--theme-text-secondary))]">
                        {ch.type === "voice" ? <Volume2 className="h-4 w-4 shrink-0" /> : <Hash className="h-4 w-4 shrink-0" />}
                        <span className="truncate">{ch.name}</span>
                      </li>
                    ))}
                    {preview.channels.length > CHANNELS_SHOWN && (
                      <li className="text-sm text-muted-foreground">and {preview.channels.length - CHANNELS_SHOWN} more</li>
                    )}
                  </ul>
                )}
              </section>

              {preview?.is_blocked && (
                <p className="mt-3 flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" /> You can't join this community.
                </p>
              )}
              {isPrivate && !preview?.is_member && (
                <p className="mt-3 text-sm text-muted-foreground">Only people a community admin adds can join.</p>
              )}
              {rules.length > 0 && !preview?.is_member && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {rules.length === 1 ? "1 rule" : `${rules.length} rules`} to accept before joining.
                </p>
              )}
            </>
          ) : (
            <>
              <DialogDescription className="mt-2 text-sm text-[hsl(var(--theme-text-secondary))]">
                Read the community rules. You need to agree to them to join.
              </DialogDescription>
              <ol className="mt-4 max-h-64 space-y-2 overflow-y-auto rounded-lg border border-border bg-[hsl(var(--theme-bg-primary))] p-3">
                {rules.map((rule, i) => (
                  <li key={i} className="flex gap-3 text-sm text-foreground">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--theme-bg-tertiary))] text-xs font-semibold text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="min-w-0">{rule}</span>
                  </li>
                ))}
              </ol>
              <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 text-sm text-foreground hover:bg-[hsl(var(--theme-bg-hover))]">
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors",
                    agreed ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground",
                  )}
                  aria-hidden
                >
                  {agreed && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                </span>
                <input type="checkbox" className="sr-only" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                I've read and agree to the rules
              </label>
            </>
          )}

          {joinError && (
            <p role="alert" className="mt-3 flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" /> {joinError}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border bg-[hsl(var(--theme-bg-primary))] px-5 py-3">
          {step === "rules" ? (
            <button
              type="button"
              onClick={() => { setStep("preview"); setJoinError(null); }}
              disabled={joining}
              className="flex h-9 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-[hsl(var(--theme-text-secondary))] hover:text-foreground disabled:opacity-50"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-9 rounded-md px-3 text-sm font-medium text-[hsl(var(--theme-text-secondary))] hover:text-foreground"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={primary.onClick}
            disabled={primary.disabled}
            className="flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {joining && <Loader2 className="h-4 w-4 animate-spin" />}
            {primary.label}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default JoinCommunityDialog;
