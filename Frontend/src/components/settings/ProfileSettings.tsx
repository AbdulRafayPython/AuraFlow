// Settings → Profile, like Discord's "Profiles": the form on the left (display
// name, avatar, banner picture or colour, About me) and a live preview of your
// profile card on the right. Nothing saves until "Save changes" in the
// unsaved-changes bar; "Undo" puts everything back.
import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Mail, Trash2, User as UserIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import ProfileCard from "@/components/profile/ProfileCard";
import { SaveBar } from "@/components/agent-builder/AgentSettingsParts";

const NAME_MAX = 32;
const BIO_MAX = 190;
const AVATAR_MAX = 8 * 1024 * 1024;
const BANNER_MAX = 10 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const COLORS = ["#5865F2", "#3BA55C", "#FAA61A", "#ED4245", "#EB459E", "#1ABC9C", "#9B59B6", "#2C2F33"];

const input = "w-full rounded-lg border border-border bg-[hsl(var(--theme-input-bg))] px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary";
const btn = "inline-flex h-9 items-center gap-1.5 rounded-md px-3.5 text-sm font-medium transition-colors duration-100 disabled:opacity-50";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-border py-5 first:pt-0 last:border-b-0">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</h3>
      {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default function ProfileSettings() {
  const { user, updateProfile } = useAuth();
  const { toast } = useToast();
  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  const saved = useMemo(() => ({
    displayName: user?.display_name || user?.username || "",
    bio: user?.bio || "",
    bannerColor: user?.banner_color || "",
  }), [user?.display_name, user?.username, user?.bio, user?.banner_color]);

  const [displayName, setDisplayName] = useState(saved.displayName);
  const [bio, setBio] = useState(saved.bio);
  const [bannerColor, setBannerColor] = useState(saved.bannerColor);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [removeBanner, setRemoveBanner] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setDisplayName(saved.displayName);
    setBio(saved.bio);
    setBannerColor(saved.bannerColor);
    setAvatarFile(null);
    setBannerFile(null);
    setRemoveAvatar(false);
    setRemoveBanner(false);
  };
  useEffect(reset, [saved]); // eslint-disable-line react-hooks/exhaustive-deps

  // Previews for picked files (revoked when replaced).
  const avatarPreview = useMemo(() => (avatarFile ? URL.createObjectURL(avatarFile) : null), [avatarFile]);
  const bannerPreview = useMemo(() => (bannerFile ? URL.createObjectURL(bannerFile) : null), [bannerFile]);
  useEffect(() => () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview); }, [avatarPreview]);
  useEffect(() => () => { if (bannerPreview) URL.revokeObjectURL(bannerPreview); }, [bannerPreview]);

  if (!user) return null;

  const hasOwnAvatar = !!user.avatar_url && !user.avatar_url.includes("dicebear");
  const shownAvatar = avatarPreview ?? (removeAvatar ? null : user.avatar_url);
  const shownBanner = bannerPreview ?? (removeBanner ? null : user.banner_url);

  const dirty = displayName.trim() !== saved.displayName || bio.trim() !== saved.bio || bannerColor !== saved.bannerColor
    || !!avatarFile || !!bannerFile || removeAvatar || removeBanner;
  const nameProblem = !displayName.trim() ? "Display name cannot be empty" : null;

  const pick = (file: File | undefined, max: number, set: (f: File) => void, what: string) => {
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      toast({ title: `Use a PNG, JPG, GIF or WEBP ${what}`, variant: "destructive" });
      return;
    }
    if (file.size > max) {
      toast({ title: `The ${what} must be under ${max / (1024 * 1024)} MB`, variant: "destructive" });
      return;
    }
    set(file);
  };

  const save = async () => {
    if (nameProblem) {
      toast({ title: nameProblem, variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await updateProfile({
        display_name: displayName.trim() !== saved.displayName ? displayName.trim() : undefined,
        bio: bio.trim() !== saved.bio ? bio.trim() : undefined,
        banner_color: bannerColor !== saved.bannerColor ? bannerColor : undefined,
        avatar: avatarFile ?? undefined,
        banner: bannerFile ?? undefined,
        remove_avatar: removeAvatar && !avatarFile ? true : undefined,
        remove_banner: removeBanner && !bannerFile ? true : undefined,
      });
      setAvatarFile(null);
      setBannerFile(null);
      setRemoveAvatar(false);
      setRemoveBanner(false);
      toast({ title: "Profile saved", variant: "success" });
    } catch (e) {
      toast({ title: "Could not save your profile", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative" data-testid="profile-settings">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Form */}
        <div>
          <Field label="Display name" hint="How people see you. Your username stays the same.">
            <input
              className={input}
              value={displayName}
              maxLength={NAME_MAX}
              onChange={(e) => setDisplayName(e.target.value)}
              aria-label="Display name"
            />
            <p className={cn("mt-1 text-xs", nameProblem ? "text-destructive" : "text-muted-foreground")}>
              {nameProblem ?? `${displayName.length}/${NAME_MAX}`}
            </p>
          </Field>

          <Field label="Avatar" hint="A square picture works best. PNG, JPG, GIF or WEBP, up to 8 MB.">
            <div className="flex flex-wrap gap-2">
              <button type="button" className={cn(btn, "bg-primary text-primary-foreground hover:opacity-90")} onClick={() => avatarInput.current?.click()}>
                <ImagePlus className="h-4 w-4" /> Change avatar
              </button>
              {(avatarFile || (hasOwnAvatar && !removeAvatar)) && (
                <button type="button" className={cn(btn, "text-foreground hover:underline")}
                        onClick={() => { setAvatarFile(null); setRemoveAvatar(hasOwnAvatar); }}>
                  Remove avatar
                </button>
              )}
            </div>
            <input ref={avatarInput} type="file" accept={IMAGE_TYPES.join(",")} className="hidden"
                   onChange={(e) => { pick(e.target.files?.[0], AVATAR_MAX, (f) => { setAvatarFile(f); setRemoveAvatar(false); }, "avatar"); e.target.value = ""; }} />
          </Field>

          <Field label="Profile banner" hint="A wide picture across the top of your profile (about 3:1). Or pick a colour.">
            <div className="flex flex-wrap gap-2">
              <button type="button" className={cn(btn, "bg-primary text-primary-foreground hover:opacity-90")} onClick={() => bannerInput.current?.click()}>
                <ImagePlus className="h-4 w-4" /> Change banner
              </button>
              {(bannerFile || (user.banner_url && !removeBanner)) && (
                <button type="button" className={cn(btn, "text-foreground hover:underline")}
                        onClick={() => { setBannerFile(null); setRemoveBanner(!!user.banner_url); }}>
                  <Trash2 className="h-4 w-4" /> Remove banner
                </button>
              )}
            </div>
            <input ref={bannerInput} type="file" accept={IMAGE_TYPES.join(",")} className="hidden"
                   onChange={(e) => { pick(e.target.files?.[0], BANNER_MAX, (f) => { setBannerFile(f); setRemoveBanner(false); }, "banner"); e.target.value = ""; }} />

            <p className="mt-4 text-sm font-medium text-foreground">Banner colour</p>
            <p className="text-xs text-muted-foreground">{shownBanner ? "Shown when you remove the picture." : "Shown across the top of your profile."}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Banner colour">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={bannerColor.toLowerCase() === c.toLowerCase()}
                  aria-label={c}
                  onClick={() => setBannerColor(c)}
                  className={cn("h-8 w-8 rounded-md border-2 transition-transform duration-100 hover:scale-105",
                    bannerColor.toLowerCase() === c.toLowerCase() ? "border-foreground" : "border-transparent")}
                  style={{ backgroundColor: c }}
                />
              ))}
              <label className="relative flex h-8 items-center gap-2 rounded-md border border-border px-2 text-xs text-muted-foreground hover:text-foreground">
                <span className="h-4 w-4 rounded" style={{ backgroundColor: bannerColor || "hsl(var(--primary))" }} />
                Custom
                <input type="color" value={bannerColor || "#5865f2"} onChange={(e) => setBannerColor(e.target.value)}
                       className="absolute inset-0 cursor-pointer opacity-0" aria-label="Custom banner colour" />
              </label>
              {bannerColor && (
                <button type="button" onClick={() => setBannerColor("")} className="text-xs text-muted-foreground hover:text-foreground hover:underline">
                  Use default
                </button>
              )}
            </div>
          </Field>

          <Field label="About me" hint="A line or two about you. People see it on your profile.">
            <textarea
              className={cn(input, "min-h-[96px] resize-y leading-relaxed")}
              value={bio}
              maxLength={BIO_MAX}
              onChange={(e) => setBio(e.target.value)}
              placeholder="CS student who loves algorithms and chai."
              aria-label="About me"
            />
            <p className="mt-1 text-right text-xs text-muted-foreground">{bio.length}/{BIO_MAX}</p>
          </Field>

          <Field label="Account">
            <dl className="space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <UserIcon className="h-4 w-4 text-muted-foreground" />
                <dt className="w-24 text-muted-foreground">Username</dt>
                <dd className="truncate text-foreground">@{user.username}</dd>
              </div>
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <dt className="w-24 text-muted-foreground">Email</dt>
                <dd className="truncate text-foreground">{user.email || "Not set"}</dd>
              </div>
            </dl>
          </Field>
        </div>

        {/* Live preview */}
        <aside className="lg:sticky lg:top-4 lg:self-start" aria-label="Preview">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</p>
          <ProfileCard
            displayName={displayName.trim() || user.username}
            username={user.username}
            avatarUrl={shownAvatar}
            bannerUrl={shownBanner}
            bannerColor={bannerColor || null}
            bio={bio.trim() || null}
            status="online"
            className="border border-border"
          />
        </aside>
      </div>

      {dirty && <SaveBar saving={saving} onReset={reset} onSave={() => void save()} />}
    </div>
  );
}
