// Agent Marketplace (/agents): browse agents people shared and add one to yourself or a community.
// Follows Discord's App Directory: a hero with search, category chips and shelves of banner
// cards; a listing page with a banner, a persona avatar, one clear "Add" button, and tabs for
// the overview, its tools and connections, its instructions and reviews. Everything shown comes
// from the listing (its snapshot, ratings and installs) or from what AuraFlow itself supports.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Bot, Check, ChevronRight, Eye, Hand, KeyRound, LayoutGrid, Loader2, Plug, Plus, Search, Share2, Sparkles,
  Star, Trash2, Webhook, X,
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useRealtime } from '@/hooks/useRealtime';
import { useToast } from '@/hooks/use-toast';
import agentBuilderService, { errorMessage } from '@/services/agentBuilderService';
import marketplaceService, { CATEGORY_LABELS, SORT_LABELS, type MarketplaceSort } from '@/services/marketplaceService';
import StarRating from '@/components/agent-builder/StarRating';
import { EmptyState, ErrorState } from '@/components/app/EmptyState';
import { Icon } from '@/components/app/Icon';
import { cn } from '@/lib/utils';
import { TRIGGER_LABELS, toolLabel } from '@/lib/agentBuilder';
import {
  ListingAvatar, ListingCard, bannerFor, usedBy,
} from '@/components/agent-marketplace/ListingVisuals';
import type { BuilderTool, MarketplaceCategory, MarketplaceListing, TriggerType } from '@/types/agentBuilder';

const PERSONAL = '';
const MINE = 'mine';
const MCP = 'mcp';
type Filter = '' | MarketplaceCategory | typeof MINE | typeof MCP;

const CATEGORY_HINTS: Record<MarketplaceCategory, string> = {
  support: 'Answer questions from your own documents and notes.',
  community: 'Welcome people and keep conversations going.',
  productivity: 'Reminders, recaps and keeping work on track.',
  learning: 'Study help, quizzes and course questions.',
  fun: 'Polls, games and icebreakers.',
  other: 'Translation and everything else.',
};

const btn = 'inline-flex h-9 items-center justify-center gap-2 rounded-md px-3.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';
const btnMain = `${btn} bg-primary text-primary-foreground hover:opacity-90`;
const btnQuiet = `${btn} border border-border text-foreground hover:bg-[hsl(var(--theme-bg-hover))]`;

const sortListings = (list: MarketplaceListing[], sort: MarketplaceSort) =>
  [...list].sort((a, b) => {
    if (sort === 'top_rated') return (b.rating ?? -1) - (a.rating ?? -1) || b.rating_count - a.rating_count || b.installs - a.installs;
    if (sort === 'newest') return (b.updated_at ?? '').localeCompare(a.updated_at ?? '');
    return b.installs - a.installs || (b.rating ?? 0) - (a.rating ?? 0);
  });

function Grid({ items, onOpen }: { items: MarketplaceListing[]; onOpen: (l: MarketplaceListing) => void }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((l) => <ListingCard key={l.id} l={l} onOpen={() => onOpen(l)} />)}
    </div>
  );
}

function Shelf({ title, hint, items, onOpen, onSeeAll }: {
  title: string; hint?: string; items: MarketplaceListing[]; onOpen: (l: MarketplaceListing) => void; onSeeAll?: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="mt-10">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
        </div>
        {onSeeAll && (
          <button type="button" onClick={onSeeAll} className="inline-flex shrink-0 items-center gap-0.5 text-sm font-medium text-[hsl(var(--theme-text-accent))] hover:underline">
            See all <Icon icon={ChevronRight} size="sm" />
          </button>
        )}
      </div>
      <Grid items={items} onOpen={onOpen} />
    </section>
  );
}

/* ─── Listing page ─────────────────────────────────────────────────────── */

type DetailTab = 'overview' | 'tools' | 'instructions' | 'reviews';

/** Ways any AuraFlow agent can be connected to other apps (set up after adding it). */
const CONNECT_WAYS = [
  {
    icon: Webhook,
    title: 'Webhooks',
    apps: 'Zapier · Make · n8n',
    text: 'AuraFlow calls your URL when the agent finishes a run or needs an approval, so another app can react.',
  },
  {
    icon: KeyRound,
    title: 'API keys',
    apps: 'Zapier · n8n · your own app',
    text: 'Another service can ask the agent to run, or post a message as the agent.',
  },
  {
    icon: Plug,
    title: 'MCP servers',
    apps: 'CRMs like HubSpot or Salesforce · Notion · Google Sheets',
    text: 'Give the agent tools from any service that offers an MCP server.',
  },
];

function ListingDetail({ l, tools, related, onBack, onAdd, onRate, onRemove, onOpen }: {
  l: MarketplaceListing;
  tools: BuilderTool[];
  related: MarketplaceListing[];
  onBack: () => void;
  onAdd: () => void;
  onRate: (stars: number) => void;
  onRemove: () => void;
  onOpen: (l: MarketplaceListing) => void;
}) {
  const [tab, setTab] = useState<DetailTab>('overview');
  useEffect(() => setTab('overview'), [l.id]);
  const meta = (name: string) => tools.find((t) => t.name === name);
  const triggers = (l.triggers as TriggerType[]).filter((t) => TRIGGER_LABELS[t]);
  const replyTriggers = triggers.length ? triggers : (['mention'] as TriggerType[]);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-12 pt-4 sm:px-6">
      <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-sm text-[hsl(var(--theme-text-accent))] hover:underline">
        <Icon icon={ArrowLeft} size="sm" /> Marketplace
      </button>

      {/* Banner + persona */}
      <div className="overflow-hidden rounded-xl border border-border bg-[hsl(var(--theme-bg-secondary))]">
        <img src={bannerFor(l)} alt="" className="h-40 w-full object-cover sm:h-52" />
        <div className="relative flex flex-col gap-4 px-5 pb-5 pt-16 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <ListingAvatar l={l} size="xl" className="absolute -top-14 left-5 border-[5px] border-[hsl(var(--theme-bg-secondary))] sm:left-6" />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-foreground">{l.title}</h1>
            <p className="mt-1 text-base text-[hsl(var(--theme-text-secondary))]">{l.tagline || l.description || 'No description yet.'}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Star className={cn('h-4 w-4', l.rating !== null && 'fill-warning text-warning')} />
                {l.rating !== null ? `${l.rating} · ${l.rating_count} ${l.rating_count === 1 ? 'rating' : 'ratings'}` : 'No ratings yet'}
              </span>
              <span>{usedBy(l.installs)}</span>
              <span>{CATEGORY_LABELS[l.category]}</span>
              <span>by {l.mine ? 'you' : l.publisher ?? 'a community member'}</span>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {l.status === 'published' ? (
              <button type="button" className={btnMain} onClick={onAdd}>
                <Icon icon={Plus} size="md" /> Add to AuraFlow
              </button>
            ) : (
              <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">Hidden from the marketplace. Agents already added keep working.</p>
            )}
            {l.mine && l.status === 'published' && (
              <button type="button" className={cn(btnQuiet, 'text-destructive')} onClick={onRemove}>
                <Icon icon={Trash2} size="md" /> Remove
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="min-w-0">
          <div role="tablist" aria-label="About this agent" className="flex gap-1 overflow-x-auto border-b border-border">
            {([['overview', 'Overview'], ['tools', 'Tools & connections'], ['instructions', 'Instructions'], ['reviews', 'Reviews']] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cn(
                  '-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                  tab === key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div role="tabpanel" className="pt-6">
            {tab === 'overview' && (
              <div className="space-y-8">
                <p className="whitespace-pre-line text-base leading-relaxed text-foreground">{l.overview || l.description || 'No description yet.'}</p>
                <div>
                  <h2 className="mb-3 text-base font-semibold text-foreground">What it can do</h2>
                  {l.tools.length ? (
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {l.tools.map((t) => (
                        <li key={t} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm text-foreground">
                          <Icon icon={Check} size="sm" className="text-success" /> {toolLabel(t)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">It answers from what it already knows. It does not take any actions.</p>
                  )}
                </div>
                <div>
                  <h2 className="mb-3 text-base font-semibold text-foreground">When it replies</h2>
                  <ul className="space-y-2">
                    {replyTriggers.map((t) => (
                      <li key={t} className="text-sm">
                        <span className="font-medium text-foreground">{TRIGGER_LABELS[t].label}.</span>{' '}
                        <span className="text-muted-foreground">{TRIGGER_LABELS[t].hint}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h2 className="mb-3 text-base font-semibold text-foreground">Get started</h2>
                  <ol className="space-y-2 text-sm text-foreground">
                    {[
                      'Add it. It starts switched off, so nothing happens yet.',
                      'Give it what it should know, like a FAQ or your notes (optional).',
                      'Try it in the test chat, then turn it on.',
                    ].map((step, i) => (
                      <li key={step} className="flex gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--theme-bg-tertiary))] text-xs font-semibold">{i + 1}</span>
                        <span className="pt-0.5">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            )}

            {tab === 'tools' && (
              <div className="space-y-8">
                <div>
                  <h2 className="mb-1 text-base font-semibold text-foreground">Built-in tools</h2>
                  <p className="mb-3 text-sm text-muted-foreground">What it can use inside AuraFlow, only in the places you add it.</p>
                  {l.tools.length ? (
                    <ul className="divide-y divide-border rounded-lg border border-border">
                      {l.tools.map((t) => {
                        const m = meta(t);
                        const reads = (m?.risk ?? 'read') === 'read';
                        return (
                          <li key={t} className="flex items-start gap-3 px-4 py-3">
                            <Icon icon={reads ? Eye : Hand} size="md" className="mt-0.5 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-foreground">{toolLabel(t)}</p>
                              {m?.description && <p className="text-sm text-muted-foreground">{m.description}</p>}
                            </div>
                            <span className={cn('shrink-0 rounded px-1.5 text-xs font-medium', reads ? 'bg-[hsl(var(--theme-bg-tertiary))] text-muted-foreground' : 'bg-warning/15 text-warning')}>
                              {reads ? 'Reads' : 'Asks you first'}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">None. It only replies with messages.</p>
                  )}
                  {l.tools.some((t) => (meta(t)?.risk ?? 'read') !== 'read') && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      "Asks you first" means you get a card with exactly what it wants to do, and you choose Approve or Reject.
                    </p>
                  )}
                </div>

                <div>
                  <h2 className="mb-1 text-base font-semibold text-foreground">Connections it needs</h2>
                  {l.connections.length ? (
                    <>
                      <p className="mb-3 text-sm text-muted-foreground">Its maker used these MCP servers. After adding it, connect your own account for each.</p>
                      <ul className="flex flex-wrap gap-2">
                        {l.connections.map((c) => (
                          <li key={c.name} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm text-foreground">
                            <Plug className="h-3.5 w-3.5 text-muted-foreground" /> {c.name} <span className="text-xs text-muted-foreground">MCP</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">None. It works with AuraFlow on its own.</p>
                  )}
                </div>

                <div>
                  <h2 className="mb-1 text-base font-semibold text-foreground">Connect it to other apps</h2>
                  <p className="mb-3 text-sm text-muted-foreground">Every AuraFlow agent can do this. Set it up after adding it, in the agent's Connections tab.</p>
                  <div className="grid gap-3 md:grid-cols-3">
                    {CONNECT_WAYS.map((w) => (
                      <div key={w.title} className="rounded-lg border border-border bg-[hsl(var(--theme-bg-secondary))] p-4">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary"><w.icon className="h-5 w-5" /></span>
                        <h3 className="mt-3 text-sm font-semibold text-foreground">{w.title}</h3>
                        <p className="mt-0.5 text-xs font-medium text-[hsl(var(--theme-text-secondary))]">{w.apps}</p>
                        <p className="mt-2 text-sm text-muted-foreground">{w.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === 'instructions' && (
              <div>
                <p className="mb-2 text-sm text-muted-foreground">These are the instructions its maker wrote. After you add it, you can change them.</p>
                <div className="whitespace-pre-wrap break-words rounded-lg border border-border bg-[hsl(var(--theme-bg-secondary))] p-4 text-sm text-foreground">
                  {l.instructions || 'No instructions.'}
                </div>
              </div>
            )}

            {tab === 'reviews' && (
              <div className="space-y-6">
                <div className="flex items-center gap-4 rounded-lg border border-border p-4">
                  <span className="text-4xl font-bold text-foreground">{l.rating ?? '–'}</span>
                  <div>
                    <StarRating value={l.rating} label={l.rating === null ? 'Not rated yet' : `Rated ${l.rating} out of 5`} />
                    <p className="text-sm text-muted-foreground">
                      {l.rating_count ? `${l.rating_count} ${l.rating_count === 1 ? 'rating' : 'ratings'}` : 'No ratings yet'}
                    </p>
                  </div>
                </div>
                {l.status === 'published' && !l.mine ? (
                  <div>
                    <h2 className="mb-1 text-base font-semibold text-foreground">Your rating</h2>
                    <StarRating value={l.my_rating} onRate={onRate} label="Your rating" />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {l.my_rating !== null ? 'Tap your star again to clear it.' : 'Tap a star to rate it.'}
                    </p>
                  </div>
                ) : l.mine ? (
                  <p className="text-sm text-muted-foreground">You can't rate your own agent.</p>
                ) : null}
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-6">
          <dl className="space-y-3 rounded-lg border border-border p-4 text-sm">
            <div><dt className="text-xs text-muted-foreground">Made by</dt><dd className="text-foreground">{l.mine ? 'You' : l.publisher ?? 'A community member'}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Category</dt><dd className="text-foreground">{CATEGORY_LABELS[l.category]}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Price</dt><dd className="text-foreground">Free</dd></div>
            <div><dt className="text-xs text-muted-foreground">Replies when</dt><dd className="text-foreground">{replyTriggers.map((t) => TRIGGER_LABELS[t].label).join(', ')}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Model</dt><dd className="capitalize text-foreground">{l.model_tier}</dd></div>
            {l.updated_at && (
              <div><dt className="text-xs text-muted-foreground">Updated</dt><dd className="text-foreground">{new Date(l.updated_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}</dd></div>
            )}
          </dl>
          {related.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-semibold text-foreground">You might also like</h2>
              <ul className="space-y-1">
                {related.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => onOpen(r)} className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-[hsl(var(--theme-bg-hover))]">
                      <ListingAvatar l={r} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">{r.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">{r.tagline || r.description}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────── */

const AgentMarketplace: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { communities } = useRealtime();
  const manageable = useMemo(() => communities.filter((c) => c.role === 'owner' || c.role === 'admin'), [communities]);
  const [params, setParams] = useSearchParams();
  const filter = (params.get('c') ?? '') as Filter;
  const openId = params.get('agent');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<MarketplaceSort>('popular');
  const [listings, setListings] = useState<MarketplaceListing[] | null>(null);
  const [tools, setTools] = useState<BuilderTool[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<MarketplaceListing | null>(null);
  const [where, setWhere] = useState(PERSONAL);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [mine, all] = await Promise.all([marketplaceService.browse({ mine: true }), marketplaceService.browse({})]);
      const byId = new Map<string, MarketplaceListing>();
      [...all, ...mine].forEach((l) => byId.set(l.id, l));
      setListings([...byId.values()]);
    } catch (e) {
      setListings([]);
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { agentBuilderService.tools().then(setTools).catch(() => setTools([])); }, []);

  const go = (next: { c?: Filter; agent?: string | null }) => {
    const p = new URLSearchParams(params);
    if (next.c !== undefined) { if (next.c) p.set('c', next.c); else p.delete('c'); }
    if (next.agent !== undefined) { if (next.agent) p.set('agent', next.agent); else p.delete('agent'); }
    setParams(p);
    document.querySelector('[data-marketplace-scroll]')?.scrollTo({ top: 0 });
  };

  const published = useMemo(() => (listings ?? []).filter((l) => l.status === 'published'), [listings]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    published.forEach((l) => { c[l.category] = (c[l.category] ?? 0) + 1; });
    return c;
  }, [published]);
  const withMcp = published.filter((l) => l.connections.length > 0).length;
  const totalInstalls = published.reduce((n, l) => n + l.installs, 0);

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    let list = filter === MINE ? (listings ?? []).filter((l) => l.mine) : published;
    if (filter === MCP) list = list.filter((l) => l.connections.length > 0);
    else if (filter && filter !== MINE) list = list.filter((l) => l.category === filter);
    if (q) list = list.filter((l) => `${l.title} ${l.tagline} ${l.description} ${CATEGORY_LABELS[l.category]} ${l.connections.map((c) => c.name).join(' ')}`.toLowerCase().includes(q));
    return sortListings(list, sort);
  }, [listings, published, filter, q, sort]);

  const featured = useMemo(() => [...published].sort((a, b) => (b.rating ?? 0) * 10 + b.installs - ((a.rating ?? 0) * 10 + a.installs)).slice(0, 3), [published]);
  const topRated = useMemo(() => published.filter((l) => l.rating !== null && !featured.includes(l)).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 3), [published, featured]);
  const newest = useMemo(() => sortListings(published.filter((l) => !featured.includes(l)), 'newest').slice(0, 3), [published, featured]);
  const selected = openId ? (listings ?? []).find((l) => l.id === openId) ?? null : null;
  const related = selected ? published.filter((l) => l.category === selected.category && l.id !== selected.id).slice(0, 4) : [];

  const add = async () => {
    if (!adding) return;
    setBusy(true);
    try {
      const agent = await marketplaceService.install(adding.id, { community_id: where || null });
      toast({ title: `${agent.name} added`, description: 'It is switched off for now. Try it, then turn it on.' });
      setAdding(null);
      navigate(`/agents/${agent.id}`);
    } catch (e) {
      toast({ title: 'Could not add this agent', description: errorMessage(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const rate = async (l: MarketplaceListing, stars: number) => {
    try {
      const updated = stars === l.my_rating ? await marketplaceService.clearRating(l.id) : await marketplaceService.rate(l.id, stars);
      setListings((list) => (list ?? []).map((x) => (x.id === l.id ? updated : x)));
    } catch (e) {
      toast({ title: 'Could not save your rating', description: errorMessage(e), variant: 'destructive' });
    }
  };

  const remove = async (l: MarketplaceListing) => {
    if (!window.confirm(`Remove "${l.title}" from the marketplace? Agents people already added keep working.`)) return;
    try {
      await marketplaceService.remove(l.id);
      setListings((list) => (list ?? []).map((x) => (x.id === l.id ? { ...x, status: 'unpublished' } : x)));
    } catch (e) {
      toast({ title: 'Could not remove', description: errorMessage(e), variant: 'destructive' });
    }
  };

  const categories = Object.keys(CATEGORY_LABELS) as MarketplaceCategory[];
  const isHome = !filter && !q;
  const heading = filter === MINE ? 'Shared by you' : filter === MCP ? 'Uses MCP connections' : filter ? CATEGORY_LABELS[filter] : 'Search results';
  const subheading = filter === MINE
    ? 'Agents you shared. Share one from its page with the Share button.'
    : filter === MCP
      ? 'Agents that work with outside services through MCP servers.'
      : filter
        ? CATEGORY_HINTS[filter]
        : `${visible.length} ${visible.length === 1 ? 'agent matches' : 'agents match'} "${query.trim()}".`;

  const navItem = (key: Filter, label: string, icon: React.ReactNode, count?: number) => (
    <button
      key={key || 'home'}
      type="button"
      onClick={() => { setQuery(''); go({ c: key, agent: null }); }}
      aria-current={filter === key && !selected ? 'page' : undefined}
      className={cn(
        'flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm transition-colors',
        filter === key ? 'bg-[hsl(var(--theme-bg-active))] font-medium text-foreground' : 'text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] hover:text-foreground',
      )}
    >
      {icon}
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && <span className="text-xs text-muted-foreground">{count}</span>}
    </button>
  );

  const chip = (key: Filter, label: string) => (
    <button
      key={key || 'all'}
      type="button"
      onClick={() => go({ c: key, agent: null })}
      aria-pressed={filter === key}
      className={cn(
        'h-8 shrink-0 rounded-full border px-3 text-sm font-medium transition-colors',
        filter === key ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] hover:text-foreground',
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="flex h-full min-w-0 bg-background">
      {/* Left column (Discord's Discover: Apps / Servers) */}
      <nav aria-label="Agents" className="hidden w-sidebar shrink-0 flex-col border-r border-border md:flex" style={{ background: 'var(--theme-sidebar-gradient)' }}>
        <div className="flex h-12 shrink-0 items-center px-4">
          <h2 className="text-lg font-semibold text-foreground">Agents</h2>
        </div>
        <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          {navItem('', 'Marketplace', <Icon icon={LayoutGrid} size="md" />)}
          <p className="px-2.5 pb-1 pt-4 text-xs font-medium text-muted-foreground">Categories</p>
          {categories.map((c) => navItem(c, CATEGORY_LABELS[c], <img src={`/agents/banners/${c}.webp`} alt="" className="h-5 w-5 rounded object-cover" />, counts[c] ?? 0))}
          {withMcp > 0 && navItem(MCP, 'Uses MCP', <Icon icon={Plug} size="md" />, withMcp)}
          <div className="my-3 h-px bg-border" />
          <button
            type="button"
            onClick={() => navigate('/agents/mine')}
            className="flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] hover:text-foreground"
          >
            <Icon icon={Bot} size="md" /> Your agents
          </button>
          {navItem(MINE, 'Shared by you', <Icon icon={Share2} size="md" />, (listings ?? []).filter((l) => l.mine).length)}
        </div>
        <div className="border-t border-border p-3">
          <button type="button" className={cn(btnMain, 'w-full')} onClick={() => navigate('/agents/mine?create=1')}>
            <Icon icon={Plus} size="md" /> Create an agent
          </button>
        </div>
      </nav>

      <main data-marketplace-scroll className="min-w-0 flex-1 overflow-y-auto">
        {selected ? (
          <ListingDetail
            l={selected}
            tools={tools}
            related={related}
            onBack={() => go({ agent: null })}
            onAdd={() => { setWhere(PERSONAL); setAdding(selected); }}
            onRate={(n) => void rate(selected, n)}
            onRemove={() => void remove(selected)}
            onOpen={(l) => go({ agent: l.id })}
          />
        ) : (
          <div className="mx-auto max-w-6xl px-4 pb-12 pt-4 sm:px-6">
            {/* Hero */}
            <section className="group relative isolate overflow-hidden rounded-xl" aria-label="Agent marketplace">
              <img src="/agents/hero.webp" alt="" className="absolute inset-0 -z-10 h-full w-full object-cover object-right transition-transform duration-700 ease-out group-hover:scale-[1.02] motion-reduce:transform-none" />
              {/* Below xl the characters sit behind the text: a solid scrim keeps it readable. */}
              <div aria-hidden className="absolute inset-0 -z-10 bg-[#1e1b4b]/75 xl:bg-transparent" />
              <div className="flex min-h-[260px] max-w-xl flex-col justify-center px-6 py-8 sm:px-10 xl:max-w-[52%]">
                <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white">
                  <Sparkles className="h-3.5 w-3.5" /> Agent Marketplace
                </span>
                <h1 className="mt-3 text-2xl font-bold leading-tight text-white sm:text-3xl">Hire AI teammates for your community</h1>
                <p className="mt-2 text-base text-white/80">
                  Explore agents for support, study, events and more. Add one to yourself or your community in a minute, then connect it to the apps you use.
                </p>
                <div className="relative mt-5 max-w-md">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#5c5e66]" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search agents, tools or connections"
                    aria-label="Search agents"
                    className="h-11 w-full rounded-lg bg-white pl-11 pr-10 text-base text-[#111] shadow-popover outline-none placeholder:text-[#5c5e66] focus:ring-2 focus:ring-primary [&::-webkit-search-cancel-button]:hidden"
                  />
                  {query && (
                    <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[#5c5e66] hover:bg-black/5">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {listings !== null && published.length > 0 && (
                  <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-white">
                    <div><dt className="sr-only">Agents</dt><dd className="text-sm"><span className="text-lg font-bold">{published.length}</span> agents</dd></div>
                    <div><dt className="sr-only">Installs</dt><dd className="text-sm"><span className="text-lg font-bold">{totalInstalls}</span> {totalInstalls === 1 ? 'install' : 'installs'}</dd></div>
                    <div><dt className="sr-only">Categories</dt><dd className="text-sm"><span className="text-lg font-bold">{Object.keys(counts).length}</span> categories</dd></div>
                  </dl>
                )}
              </div>
            </section>

            {/* Filters */}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto scrollbar-none">
                {chip('', 'All')}
                {categories.filter((c) => counts[c]).map((c) => chip(c, CATEGORY_LABELS[c]))}
                {withMcp > 0 && chip(MCP, 'Uses MCP')}
                <span className="md:hidden">{chip(MINE, 'Shared by you')}</span>
              </div>
              {!isHome && (
                <label className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
                  Sort
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as MarketplaceSort)}
                    className="h-8 rounded-md border border-border bg-[hsl(var(--theme-input-bg))] px-2 text-sm text-foreground"
                  >
                    {(Object.keys(SORT_LABELS) as MarketplaceSort[]).map((s) => <option key={s} value={s}>{SORT_LABELS[s]}</option>)}
                  </select>
                </label>
              )}
            </div>

            {error && <div className="mt-6"><ErrorState message={error} onRetry={() => void load()} /></div>}

            {listings === null ? (
              <div role="status" aria-label="Loading agents" className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="overflow-hidden rounded-xl border border-border">
                    <div className="h-24 animate-skeleton bg-[hsl(var(--theme-bg-tertiary))]" />
                    <div className="space-y-2 p-4 pt-10">
                      <div className="h-4 w-1/2 animate-skeleton rounded bg-[hsl(var(--theme-bg-tertiary))]" />
                      <div className="h-3.5 w-4/5 animate-skeleton rounded bg-[hsl(var(--theme-bg-tertiary))]" />
                    </div>
                  </div>
                ))}
              </div>
            ) : !isHome ? (
              <section className="mt-8">
                <h2 className="text-lg font-semibold text-foreground">{heading}</h2>
                <p className="mb-4 text-sm text-muted-foreground">{subheading}</p>
                {visible.length ? (
                  <Grid items={visible} onOpen={(l) => go({ agent: l.id })} />
                ) : (
                  <EmptyState
                    icon={Search}
                    title={filter === MINE ? 'You have not shared any agents yet' : 'No agents here yet'}
                    description={filter === MINE ? 'Open one of your agents and choose Share.' : 'Try another category or search, or make your own agent.'}
                    action={<button type="button" className={btnMain} onClick={() => navigate('/agents/mine')}>Go to your agents</button>}
                  />
                )}
              </section>
            ) : published.length === 0 ? (
              <div className="mt-8">
                <EmptyState
                  icon={LayoutGrid}
                  title="The marketplace is empty"
                  description="When someone shares an agent, it shows up here. You can be the first: open one of your agents and choose Share."
                  action={<button type="button" className={btnMain} onClick={() => navigate('/agents/mine')}>Go to your agents</button>}
                />
              </div>
            ) : (
              <>
                <section className="mt-8">
                  <h2 className="text-lg font-semibold text-foreground">Featured</h2>
                  <p className="mb-4 text-sm text-muted-foreground">The best-rated and most added agents right now.</p>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    {featured.map((l) => <ListingCard key={l.id} l={l} featured onOpen={() => go({ agent: l.id })} />)}
                  </div>
                </section>
                <Shelf title="Top rated" hint="What people rate highest." items={topRated} onOpen={(l) => go({ agent: l.id })} />
                <Shelf title="New and updated" items={newest} onOpen={(l) => go({ agent: l.id })} />
                {categories.map((c) => {
                  const items = sortListings(published.filter((l) => l.category === c), 'popular').slice(0, 3);
                  return (
                    <Shelf
                      key={c}
                      title={CATEGORY_LABELS[c]}
                      hint={CATEGORY_HINTS[c]}
                      items={items}
                      onOpen={(l) => go({ agent: l.id })}
                      onSeeAll={(counts[c] ?? 0) > items.length ? () => go({ c }) : undefined}
                    />
                  );
                })}
              </>
            )}
          </div>
        )}
      </main>

      <Dialog open={!!adding} onOpenChange={(open) => { if (!open) setAdding(null); }}>
        <DialogContent className="max-w-md bg-popover text-popover-foreground">
          <DialogHeader>
            <div className="flex items-center gap-3">
              {adding && <ListingAvatar l={adding} size="md" />}
              <div>
                <DialogTitle>Add {adding?.title}</DialogTitle>
                <DialogDescription>It starts switched off. Try it first, then turn it on.</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-foreground">Where should it work?</legend>
            <div className="space-y-2">
              {[{ id: PERSONAL, name: 'Just for me', hint: 'Only you can talk to it.' },
                ...manageable.map((c) => ({ id: String(c.id), name: c.name, hint: 'Everyone in this community can mention it.' }))].map((opt) => (
                <label
                  key={opt.id || 'me'}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                    where === opt.id ? 'border-primary bg-[hsl(var(--theme-bg-active))]' : 'border-border hover:bg-[hsl(var(--theme-bg-hover))]',
                  )}
                >
                  <input type="radio" name="add-where" className="mt-1" checked={where === opt.id} onChange={() => setWhere(opt.id)} />
                  <span>
                    <span className="block text-sm font-medium text-foreground">{opt.name}</span>
                    <span className="block text-xs text-muted-foreground">{opt.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            {manageable.length === 0 && (
              <p className="mt-2 text-xs text-muted-foreground">To add it to a community you need to be its owner or an admin.</p>
            )}
          </fieldset>
          <div className="flex justify-end gap-2">
            <button type="button" className={btnQuiet} onClick={() => setAdding(null)}>Cancel</button>
            <button type="button" className={btnMain} disabled={busy} onClick={() => void add()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon icon={Plus} size="md" />} Add agent
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AgentMarketplace;
