// components/modals/CreateCommunityModal.tsx
//
// Creating a community, the Discord way: one dialog, one decision per screen.
//   1. Template      — what the community is for (sets its starting channels)
//   2. Who can join? — Public (listed in Discover) or Private (invite-only)
//   3. Customize     — icon, name, description, optional banner
//   4. Rules         — public only: what joiners accept before joining
// Back keeps everything entered. Nothing is created until the last button.
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle, ArrowLeft, Camera, Check, ChevronRight, Globe, Hash, ImagePlus, Loader2, Lock, Plus, Volume2,
} from "lucide-react";
import { channelService } from "@/services/channelService";
import { useRealtime } from "@/hooks/useRealtime";
import { useAuth } from "@/contexts/AuthContext";
import { cn, readableTextOn } from "@/lib/utils";
import type { Community, CommunityTemplate, CommunityVisibility } from "@/types";
import { ResponsiveModal, ResponsiveModalContent, ResponsiveModalTitle } from "@/components/ui/responsive-modal";
import { COMMUNITY_TEMPLATES, templateById, type TemplateChannel } from "@/lib/communityTemplates";
import { PrivacyChoice, RulesEditor } from "@/components/community/CommunityPrivacy";

interface CreateCommunityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateCommunity: (data: CommunityFormData) => Promise<Community>;
}

export interface CommunityFormData {
  name: string;
  description: string;
  icon: string;
  color: string;
  visibility: CommunityVisibility;
  template: CommunityTemplate;
  /** Sent only for public communities. */
  rules?: string[];
}

type Step = "template" | "privacy" | "customize" | "rules";

const COLORS = ["#8B5CF6", "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#EC4899", "#06B6D4", "#64748B"];
const NAME_MIN = 2;
const NAME_MAX = 50;
const DESCRIPTION_MAX = 200;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const iconFromName = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0] || "AF").slice(0, 2).toUpperCase();
};

function ChannelChips({ channels }: { channels: TemplateChannel[] }) {
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
      {channels.map((ch) => (
        <span key={`${ch.type}-${ch.name}`} className="inline-flex items-center gap-0.5">
          {ch.type === "voice" ? <Volume2 className="h-3 w-3" /> : <Hash className="h-3 w-3" />}
          {ch.name}
        </span>
      ))}
    </span>
  );
}

export default function CreateCommunityModal({ isOpen, onClose, onCreateCommunity }: CreateCommunityModalProps) {
  const navigate = useNavigate();
  const { reloadCommunities } = useRealtime();
  const { user } = useAuth();
  const defaultName = `${(user?.display_name || user?.username || "My").split(" ")[0]}'s community`;

  const [step, setStep] = useState<Step>("template");
  const [direction, setDirection] = useState<1 | -1>(1);
  const [template, setTemplate] = useState<CommunityTemplate>("own");
  const [visibility, setVisibility] = useState<CommunityVisibility>("public");
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [rules, setRules] = useState<string[]>(templateById("own").rules);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<false | "creating" | "uploading">(false);
  const logoInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  const logoPreview = useMemo(() => (logoFile ? URL.createObjectURL(logoFile) : null), [logoFile]);
  const bannerPreview = useMemo(() => (bannerFile ? URL.createObjectURL(bannerFile) : null), [bannerFile]);
  useEffect(() => () => { if (logoPreview) URL.revokeObjectURL(logoPreview); }, [logoPreview]);
  useEffect(() => () => { if (bannerPreview) URL.revokeObjectURL(bannerPreview); }, [bannerPreview]);

  // Fresh start every time the dialog opens.
  useEffect(() => {
    if (!isOpen) return;
    setStep("template");
    setDirection(1);
    setTemplate("own");
    setVisibility("public");
    setName(defaultName);
    setDescription("");
    setColor(COLORS[0]);
    setRules(templateById("own").rules);
    setLogoFile(null);
    setBannerFile(null);
    setError("");
    setBusy(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const steps: Step[] = visibility === "public" ? ["template", "privacy", "customize", "rules"] : ["template", "privacy", "customize"];
  const stepIndex = steps.indexOf(step);
  const isLast = stepIndex === steps.length - 1;

  const go = (next: Step, dir: 1 | -1) => {
    setError("");
    setDirection(dir);
    setStep(next);
  };
  const back = () => stepIndex > 0 && go(steps[stepIndex - 1], -1);

  const nameError =
    name.trim().length < NAME_MIN ? `Name must be at least ${NAME_MIN} characters.` : name.trim().length > NAME_MAX ? `Name can be at most ${NAME_MAX} characters.` : "";
  const cleanRules = rules.map((r) => r.trim()).filter(Boolean);

  const pickImage = (setter: (f: File | null) => void) => (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Choose an image file (PNG, JPG, WebP or GIF).");
    if (file.size > IMAGE_MAX_BYTES) return setError("Images must be 5 MB or smaller.");
    setError("");
    setter(file);
  };

  const create = async () => {
    if (nameError) {
      go("customize", -1);
      setError(nameError);
      return;
    }
    setError("");
    setBusy("creating");
    try {
      const created = await onCreateCommunity({
        name: name.trim(),
        description: description.trim(),
        icon: iconFromName(name),
        color,
        visibility,
        template,
        rules: visibility === "public" ? cleanRules : undefined,
      });
      if (created?.id && (logoFile || bannerFile)) {
        setBusy("uploading");
        try {
          if (logoFile) await channelService.uploadCommunityLogo(created.id, logoFile);
          if (bannerFile) await channelService.uploadCommunityBanner(created.id, bannerFile);
        } catch (uploadErr: any) {
          // The community exists; say so instead of looking like nothing happened.
          setError(`Community created, but the image upload failed: ${uploadErr?.response?.data?.error || uploadErr?.message || "upload failed"}. You can add it in Community settings.`);
        }
      }
      await reloadCommunities();
      if (created?.id) navigate(`/community/${created.id}`);
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || "Couldn't create the community. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const title: Record<Step, [string, string]> = {
    template: ["Create your community", "A community is where your group talks, shares and gets things done. Start from scratch or a template."],
    privacy: ["Who can join?", "This decides whether people can find your community. You can change it later in Community settings."],
    customize: ["Customize your community", "Give it a name and an icon. You can change them later."],
    rules: ["Set the rules", "People read and accept these before they join. Keep them short and clear."],
  };
  const tpl = templateById(template);
  const shownLogo = logoPreview;
  const fg = readableTextOn(color);

  return (
    <ResponsiveModal open={isOpen} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <ResponsiveModalContent size="md" className="flex flex-col">
        {/* Progress */}
        <div className="flex items-center justify-center gap-1.5 pt-5" aria-label={`Step ${stepIndex + 1} of ${steps.length}`}>
          {steps.map((s, i) => (
            <span key={s} className={cn("h-1 rounded-full transition-all duration-150", i === stepIndex ? "w-6 bg-primary" : i < stepIndex ? "w-3 bg-primary/60" : "w-3 bg-[hsl(var(--theme-bg-tertiary))]")} />
          ))}
        </div>

        <div className="px-6 pt-4 text-center">
          <ResponsiveModalTitle className="text-xl font-bold text-foreground">{title[step][0]}</ResponsiveModalTitle>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">{title[step][1]}</p>
        </div>

        <div
          key={step}
          className={cn(
            "min-h-0 flex-1 overflow-y-auto px-6 pb-2 pt-5 animate-in fade-in duration-150 motion-reduce:animate-none",
            direction === 1 ? "slide-in-from-right-2" : "slide-in-from-left-2",
          )}
        >
          {step === "template" && (
            <div className="space-y-2">
              {(() => {
                const own = COMMUNITY_TEMPLATES[0];
                return (
                  <button
                    type="button"
                    onClick={() => { setTemplate(own.id); setRules(own.rules); go("privacy", 1); }}
                    className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-[hsl(var(--theme-bg-hover))]"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Plus className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-foreground">{own.label}</span>
                      <span className="block text-xs text-muted-foreground">{own.hint}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                );
              })()}
              <h3 className="px-1 pt-3 text-xs font-medium text-muted-foreground">Start from a template</h3>
              {COMMUNITY_TEMPLATES.slice(1).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => { setTemplate(item.id); setRules(item.rules); go("privacy", 1); }}
                  className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-[hsl(var(--theme-bg-hover))]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground">{item.label}</span>
                    <span className="mb-1 block text-xs text-muted-foreground">{item.hint}</span>
                    <ChannelChips channels={item.channels} />
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}

          {step === "privacy" && <PrivacyChoice value={visibility} onChange={setVisibility} />}

          {step === "customize" && (
            <div className="space-y-5">
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => logoInput.current?.click()}
                  aria-label={shownLogo ? "Change icon" : "Upload an icon"}
                  className={cn(
                    "relative flex h-20 w-20 items-center justify-center rounded-2xl text-xl font-bold transition-opacity hover:opacity-90",
                    !shownLogo && "border-2 border-dashed border-muted-foreground",
                  )}
                  style={shownLogo ? undefined : { backgroundColor: `${color}26`, color }}
                >
                  {shownLogo ? (
                    <img src={shownLogo} alt="" className="h-full w-full rounded-2xl object-cover" />
                  ) : (
                    <span className="flex flex-col items-center gap-0.5 text-xs font-semibold">
                      <Camera className="h-5 w-5" /> Upload
                    </span>
                  )}
                  <span className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Plus className="h-4 w-4" />
                  </span>
                </button>
                <input ref={logoInput} type="file" accept="image/*" className="hidden" onChange={pickImage(setLogoFile)} />
                {shownLogo && (
                  <button type="button" onClick={() => setLogoFile(null)} className="mt-2 text-xs text-muted-foreground hover:text-foreground">
                    Remove icon
                  </button>
                )}
              </div>

              <div>
                <label htmlFor="community-name" className="mb-1.5 flex items-center justify-between text-xs font-semibold text-foreground">
                  <span>Community name <span className="text-destructive">*</span></span>
                  <span className={cn("font-normal", name.length > NAME_MAX ? "text-destructive" : "text-muted-foreground")}>{name.length}/{NAME_MAX}</span>
                </label>
                <input
                  id="community-name"
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={NAME_MAX + 10}
                  aria-invalid={!!nameError}
                  className="h-10 w-full rounded-md border border-border bg-[hsl(var(--theme-input-bg))] px-3 text-sm text-foreground outline-none focus:border-primary"
                />
                {name && nameError && <p className="mt-1 text-xs text-destructive">{nameError}</p>}
              </div>

              <div>
                <label htmlFor="community-description" className="mb-1.5 flex items-center justify-between text-xs font-semibold text-foreground">
                  <span>Description <span className="font-normal text-muted-foreground">(optional)</span></span>
                  <span className="font-normal text-muted-foreground">{description.length}/{DESCRIPTION_MAX}</span>
                </label>
                <textarea
                  id="community-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_MAX))}
                  rows={2}
                  placeholder="What is this community about?"
                  className="w-full resize-none rounded-md border border-border bg-[hsl(var(--theme-input-bg))] px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {visibility === "public" ? "Shown on Discover and before people join." : "Shown to members."}
                </p>
              </div>

              <div>
                <span className="mb-1.5 block text-xs font-semibold text-foreground">Banner <span className="font-normal text-muted-foreground">(optional)</span></span>
                <button
                  type="button"
                  onClick={() => bannerInput.current?.click()}
                  className="relative flex h-24 w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-border text-sm text-muted-foreground transition-colors hover:bg-[hsl(var(--theme-bg-hover))]"
                  style={bannerPreview ? undefined : { backgroundColor: `${color}1a` }}
                >
                  {bannerPreview ? (
                    <img src={bannerPreview} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <span className="flex items-center gap-2"><ImagePlus className="h-4 w-4" /> Add a banner image</span>
                  )}
                </button>
                <input ref={bannerInput} type="file" accept="image/*" className="hidden" onChange={pickImage(setBannerFile)} />
                {bannerPreview && (
                  <button type="button" onClick={() => setBannerFile(null)} className="mt-1 text-xs text-muted-foreground hover:text-foreground">
                    Remove banner
                  </button>
                )}
              </div>

              <div>
                <span className="mb-1.5 block text-xs font-semibold text-foreground">Colour</span>
                <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Colour">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={color === c}
                      aria-label={c}
                      onClick={() => setColor(c)}
                      className={cn("flex h-7 w-7 items-center justify-center rounded-full ring-offset-2 ring-offset-[hsl(var(--theme-bg-primary))]", color === c && "ring-2 ring-foreground")}
                      style={{ backgroundColor: c, color: readableTextOn(c) }}
                    >
                      {color === c && <Check className="h-4 w-4" />}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Used where there is no icon or banner.</p>
              </div>

              {/* What people will see */}
              <div>
                <span className="mb-1.5 block text-xs font-semibold text-foreground">Preview</span>
                <div className="overflow-hidden rounded-lg border border-border bg-[hsl(var(--theme-bg-secondary))]">
                  <div className="h-14" style={bannerPreview ? undefined : { backgroundColor: color }}>
                    {bannerPreview && <img src={bannerPreview} alt="" className="h-full w-full object-cover" />}
                  </div>
                  <div className="relative px-3 pb-3 pt-6">
                    <span
                      className="absolute -top-5 left-3 flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border-[3px] border-[hsl(var(--theme-bg-secondary))] text-xs font-bold"
                      style={shownLogo ? undefined : { backgroundColor: color, color: fg }}
                    >
                      {shownLogo ? <img src={shownLogo} alt="" className="h-full w-full object-cover" /> : iconFromName(name)}
                    </span>
                    <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-foreground">
                      {name.trim() || defaultName}
                      {visibility === "private" ? <Lock className="h-3.5 w-3.5 text-muted-foreground" /> : <Globe className="h-3.5 w-3.5 text-muted-foreground" />}
                    </p>
                    <p className="line-clamp-1 text-xs text-muted-foreground">{description.trim() || "No description yet."}</p>
                    <div className="mt-1.5"><ChannelChips channels={tpl.channels} /></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === "rules" && <RulesEditor rules={rules} onChange={setRules} />}

          {error && (
            <p role="alert" className="mt-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-border bg-[hsl(var(--theme-bg-secondary))] px-6 py-3">
          {stepIndex > 0 ? (
            <button type="button" onClick={back} disabled={!!busy} className="flex h-9 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-[hsl(var(--theme-text-secondary))] hover:text-foreground disabled:opacity-50">
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">Step 1 of {steps.length}</span>
          )}
          {step === "template" ? null : (
            <button
              type="button"
              onClick={isLast ? create : () => go(steps[stepIndex + 1], 1)}
              disabled={!!busy || (step === "customize" && !!nameError)}
              className="flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy === "creating" ? "Creating…" : busy === "uploading" ? "Uploading images…" : isLast ? "Create community" : "Continue"}
            </button>
          )}
        </div>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
