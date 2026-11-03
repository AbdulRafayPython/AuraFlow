// "Share to the marketplace", in steps: what people read (Basics), how it looks (Look:
// persona avatar and banner, from the gallery or an upload), what it brings (Details: the
// overview, and exactly what is and is not shared), then a review with the real card.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Loader2, Lock, Plug, Store, Upload, Wrench } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import agentBuilderService, { errorMessage } from '@/services/agentBuilderService';
import marketplaceService, { CATEGORY_LABELS } from '@/services/marketplaceService';
import { toolLabel } from '@/lib/agentBuilder';
import { cn } from '@/lib/utils';
import {
  BANNER_GALLERY, ListingCard, PERSONA_GALLERY, listingImageUrl,
} from '@/components/agent-marketplace/ListingVisuals';
import type { BuilderAgent, MarketplaceCategory, MarketplaceListing } from '@/types/agentBuilder';
import { btnGhost, btnPrimary, hintCls, inputCls, labelCls } from './styles';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: BuilderAgent;
}

type Step = 'basics' | 'look' | 'details' | 'review';
const STEPS: { id: Step; label: string }[] = [
  { id: 'basics', label: 'Basics' },
  { id: 'look', label: 'Look' },
  { id: 'details', label: 'Details' },
  { id: 'review', label: 'Review' },
];

/** A persona that suits each category, used until the publisher picks one. */
const DEFAULT_PERSONA: Record<MarketplaceCategory, string> = {
  support: 'support', community: 'host', productivity: 'planner', learning: 'tutor', fun: 'party', other: 'translator',
};

const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

function ImageChoice({ selected, onClick, src, label, wide = false }: { selected: boolean; onClick: () => void; src: string; label: string; wide?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'relative overflow-hidden rounded-lg ring-offset-2 ring-offset-[hsl(var(--theme-bg-elevated))] transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        wide ? 'aspect-[16/9]' : 'aspect-square',
        selected && 'ring-2 ring-primary',
      )}
    >
      <img src={src} alt="" className="h-full w-full object-cover" />
      {selected && (
        <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="h-3.5 w-3.5" />
        </span>
      )}
    </button>
  );
}

const ShareAgentDialog: React.FC<Props> = ({ open, onOpenChange, agent }) => {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>('basics');
  const [title, setTitle] = useState(agent.name);
  const [tagline, setTagline] = useState('');
  const [description, setDescription] = useState(agent.description ?? '');
  const [category, setCategory] = useState<MarketplaceCategory>('other');
  const [overview, setOverview] = useState('');
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState<'icon' | 'banner' | null>(null);
  const [mcpNames, setMcpNames] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const iconInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setStep('basics');
    setTitle(agent.name);
    setTagline('');
    setDescription(agent.description ?? '');
    setCategory('other');
    setOverview('');
    setIconUrl(null);
    setBannerUrl(null);
    setMcpNames(null);
    agentBuilderService.mcpServers(agent.id)
      .then((servers) => setMcpNames(servers.filter((s) => s.enabled).map((s) => s.name)))
      .catch(() => setMcpNames([]));
  }, [open, agent.id, agent.name, agent.description]);

  const sharedTools = agent.tools.filter((t) => !t.startsWith('mcp_'));
  const persona = iconUrl ?? `/agents/personas/${DEFAULT_PERSONA[category]}.webp`;
  const banner = bannerUrl ?? `/agents/banners/${category}.webp`;
  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const basicsOk = title.trim().length >= 2 && title.trim().length <= 60 && tagline.length <= 80 && description.length <= 300;

  const preview: MarketplaceListing = useMemo(() => ({
    id: 'preview', title: title.trim() || agent.name, description, category, status: 'published', installs: 0,
    publisher: null, mine: true, instructions: '', tools: sharedTools, model_tier: 'fast', triggers: [], rating: null,
    rating_count: 0, my_rating: null, updated_at: null, tagline, overview, icon_url: persona, banner_url: banner,
    connections: (mcpNames ?? []).map((name) => ({ kind: 'mcp' as const, name })),
  }), [title, agent.name, description, category, sharedTools, tagline, overview, persona, banner, mcpNames]);

  const upload = (kind: 'icon' | 'banner') => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast({ title: 'Choose an image file', variant: 'destructive' });
    if (file.size > IMAGE_MAX_BYTES) return toast({ title: 'Images must be 5 MB or smaller', variant: 'destructive' });
    setUploading(kind);
    try {
      const url = await marketplaceService.uploadMedia(file);
      if (kind === 'icon') setIconUrl(url); else setBannerUrl(url);
    } catch (err) {
      toast({ title: 'Upload failed', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setUploading(null);
    }
  };

  const share = async () => {
    setBusy(true);
    try {
      await marketplaceService.publish(agent.id, {
        title: title.trim(), tagline: tagline.trim(), description: description.trim(), category,
        overview: overview.trim(), icon_url: persona, banner_url: banner,
      });
      toast({ title: 'Shared to the marketplace', description: 'Share again after changes to update the listing.' });
      onOpenChange(false);
    } catch (e) {
      toast({ title: 'Could not share', description: errorMessage(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const next = () => setStep(STEPS[Math.min(stepIndex + 1, STEPS.length - 1)].id);
  const back = () => setStep(STEPS[Math.max(stepIndex - 1, 0)].id);

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden bg-[hsl(var(--theme-bg-elevated))] p-0 text-[hsl(var(--theme-text-primary))]">
        <DialogHeader className="border-b border-border px-6 pb-4 pt-5">
          <DialogTitle>Share to the marketplace</DialogTitle>
          <DialogDescription>Make a listing people can find and add.</DialogDescription>
          <ol className="mt-3 flex items-center gap-2" aria-label={`Step ${stepIndex + 1} of ${STEPS.length}`}>
            {STEPS.map((s, i) => (
              <li key={s.id} className="flex items-center gap-2">
                <span className={cn(
                  'flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium',
                  i === stepIndex ? 'bg-primary text-primary-foreground' : i < stepIndex ? 'bg-primary/15 text-primary' : 'bg-[hsl(var(--theme-bg-tertiary))] text-muted-foreground',
                )}>
                  {i < stepIndex ? <Check className="h-3 w-3" /> : i + 1} {s.label}
                </span>
                {i < STEPS.length - 1 && <span aria-hidden className="h-px w-4 bg-border" />}
              </li>
            ))}
          </ol>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {step === 'basics' && (
            <div className="space-y-4">
              <div>
                <label className={labelCls} htmlFor="share-title">Name</label>
                <input id="share-title" className={inputCls} value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div>
                <label className={labelCls} htmlFor="share-tagline">Tagline <span className="font-normal">({tagline.length}/80)</span></label>
                <input id="share-tagline" className={inputCls} value={tagline} maxLength={80} placeholder="One line people see on the card" onChange={(e) => setTagline(e.target.value)} />
              </div>
              <div>
                <label className={labelCls} htmlFor="share-desc">Short description <span className="font-normal">({description.length}/300)</span></label>
                <textarea id="share-desc" className={inputCls} rows={3} value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} />
                <p className={hintCls}>Say what it does in a sentence or two. Used in search.</p>
              </div>
              <div>
                <label className={labelCls} htmlFor="share-cat">Category</label>
                <select id="share-cat" className={inputCls} value={category} onChange={(e) => setCategory(e.target.value as MarketplaceCategory)}>
                  {Object.entries(CATEGORY_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </div>
            </div>
          )}

          {step === 'look' && (
            <div className="space-y-6">
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Avatar</h3>
                  <button type="button" className={btnGhost} onClick={() => iconInput.current?.click()} disabled={uploading !== null}>
                    {uploading === 'icon' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload your own
                  </button>
                  <input ref={iconInput} type="file" accept="image/*" className="hidden" onChange={upload('icon')} />
                </div>
                <div role="radiogroup" aria-label="Avatar" className="grid grid-cols-6 gap-2">
                  {iconUrl?.startsWith('/uploads/') && (
                    <ImageChoice selected src={listingImageUrl(iconUrl)} label="Your upload" onClick={() => undefined} />
                  )}
                  {PERSONA_GALLERY.map((p) => (
                    <ImageChoice key={p.id} selected={persona === p.url} src={p.url} label={p.label} onClick={() => setIconUrl(p.url)} />
                  ))}
                </div>
              </section>
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Banner</h3>
                  <button type="button" className={btnGhost} onClick={() => bannerInput.current?.click()} disabled={uploading !== null}>
                    {uploading === 'banner' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload your own
                  </button>
                  <input ref={bannerInput} type="file" accept="image/*" className="hidden" onChange={upload('banner')} />
                </div>
                <div role="radiogroup" aria-label="Banner" className="grid grid-cols-3 gap-2">
                  {bannerUrl?.startsWith('/uploads/') && (
                    <ImageChoice wide selected src={listingImageUrl(bannerUrl)} label="Your upload" onClick={() => undefined} />
                  )}
                  {BANNER_GALLERY.map((b) => (
                    <ImageChoice key={b.id} wide selected={banner === b.url} src={b.url} label={b.label} onClick={() => setBannerUrl(b.url)} />
                  ))}
                </div>
              </section>
              <section>
                <h3 className="mb-2 text-sm font-semibold text-foreground">How it looks</h3>
                <div className="max-w-xs"><ListingCard l={preview} onOpen={() => undefined} /></div>
              </section>
            </div>
          )}

          {step === 'details' && (
            <div className="space-y-6">
              <div>
                <label className={labelCls} htmlFor="share-overview">Overview <span className="font-normal">({overview.length}/2000)</span></label>
                <textarea
                  id="share-overview"
                  className={inputCls}
                  rows={6}
                  value={overview}
                  maxLength={2000}
                  placeholder="What it does, who it is for, and how to get started after adding it."
                  onChange={(e) => setOverview(e.target.value)}
                />
                <p className={hintCls}>Shown on the listing page. Leave it empty to use the short description.</p>
              </div>

              <section className="rounded-lg border border-border p-4">
                <h3 className="text-sm font-semibold text-foreground">What people get</h3>
                <ul className="mt-2 space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>
                      <span className="text-foreground">Its instructions, triggers and {sharedTools.length} {sharedTools.length === 1 ? 'tool' : 'tools'}</span>
                      {sharedTools.length > 0 && <span className="block text-muted-foreground">{sharedTools.map(toolLabel).join(', ')}</span>}
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Plug className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>
                      {mcpNames === null ? (
                        <span className="text-muted-foreground">Checking its connections…</span>
                      ) : mcpNames.length ? (
                        <>
                          <span className="text-foreground">The names of its MCP connections: {mcpNames.join(', ')}</span>
                          <span className="block text-muted-foreground">People connect their own account after adding it.</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">No MCP connections.</span>
                      )}
                    </span>
                  </li>
                </ul>
                <h3 className="mt-4 text-sm font-semibold text-foreground">What stays with you</h3>
                <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                  Knowledge files, channels, its avatar, and every connection's address, token and login. Its API keys and webhooks too.
                </p>
              </section>
            </div>
          )}

          {step === 'review' && (
            <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_240px]">
              <dl className="space-y-3 text-sm">
                <div><dt className="text-xs text-muted-foreground">Name</dt><dd className="text-foreground">{title.trim()}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Tagline</dt><dd className="text-foreground">{tagline.trim() || '—'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Category</dt><dd className="text-foreground">{CATEGORY_LABELS[category]}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Overview</dt><dd className="line-clamp-4 whitespace-pre-line text-foreground">{overview.trim() || description.trim() || '—'}</dd></div>
                <p className="text-xs text-muted-foreground">Anyone on AuraFlow can see and add it. You can remove it from the marketplace at any time.</p>
              </dl>
              <ListingCard l={preview} onOpen={() => undefined} />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-6 py-3">
          {stepIndex > 0 ? (
            <button type="button" className={btnGhost} onClick={back} disabled={busy}><ArrowLeft className="h-4 w-4" /> Back</button>
          ) : (
            <button type="button" className={btnGhost} onClick={() => onOpenChange(false)}>Cancel</button>
          )}
          {step === 'review' ? (
            <button type="button" className={btnPrimary} disabled={busy || !basicsOk} onClick={() => void share()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Store className="h-4 w-4" />} Share to the marketplace
            </button>
          ) : (
            <button type="button" className={btnPrimary} disabled={(step === 'basics' && !basicsOk) || uploading !== null} onClick={next}>
              Continue
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ShareAgentDialog;
