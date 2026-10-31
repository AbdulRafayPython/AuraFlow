// Agent directory: browse agents other people shared and add one to yourself or a community.
// Layout follows the familiar app-directory pattern: categories on the left, featured picks,
// simple tiles, and a detail page with one clear "Add" button and plain-language permissions.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, ChevronRight, Eye, Hand, LayoutGrid, Loader2, Plus, Search, Share2, Trash2, User, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useRealtime } from '@/hooks/useRealtime';
import { useToast } from '@/hooks/use-toast';
import agentBuilderService, { errorMessage } from '@/services/agentBuilderService';
import marketplaceService, { CATEGORY_LABELS } from '@/services/marketplaceService';
import StarRating from '@/components/agent-builder/StarRating';
import AgentLogo from '@/components/ai-agents/AgentLogo';
import { PageHeader } from '@/components/app/PageHeader';
import { EmptyState, ErrorState } from '@/components/app/EmptyState';
import { Icon } from '@/components/app/Icon';
import { cn } from '@/lib/utils';
import { TRIGGER_LABELS, toolLabel } from '@/lib/agentBuilder';
import type { BuilderTool, MarketplaceCategory, MarketplaceListing, TriggerType } from '@/types/agentBuilder';

const PERSONAL = '';
const MINE = 'mine';
type Filter = '' | MarketplaceCategory | typeof MINE;

const CATEGORY_HINTS: Record<MarketplaceCategory, string> = {
  support: 'Answer questions from your own documents and notes.',
  community: 'Welcome people and keep conversations going.',
  productivity: 'Reminders, recaps and keeping work on track.',
  learning: 'Study help, quizzes and course questions.',
  fun: 'Polls, games and icebreakers.',
  other: 'Everything else.',
};

const usedBy = (n: number) => (n === 0 ? 'New' : `Added ${n} ${n === 1 ? 'time' : 'times'}`);

const btn = 'inline-flex h-9 items-center justify-center gap-2 rounded-md px-3.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';
const btnMain = `${btn} bg-primary text-primary-foreground hover:opacity-90`;
const btnQuiet = `${btn} border border-border text-foreground hover:bg-[hsl(var(--theme-bg-hover))]`;

function logoProps(l: MarketplaceListing) {
  return { name: l.title, category: l.category };
}

/* ─── Browse ──────────────────────────────────────────────────────────── */

function FeaturedCard({ l, onOpen }: { l: MarketplaceListing; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex overflow-hidden rounded-xl border border-border bg-[hsl(var(--theme-bg-secondary))] text-left transition-colors duration-150 hover:border-[hsl(var(--theme-border-hover))]"
    >
      <span className="flex w-28 shrink-0 items-center justify-center bg-[hsl(var(--theme-bg-tertiary))]">
        <AgentLogo {...logoProps(l)} size="lg" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col p-4">
        <span className="truncate text-base font-semibold text-foreground">{l.title}</span>
        <span className="mt-1 inline-flex w-fit rounded bg-[hsl(var(--theme-bg-tertiary))] px-1.5 text-xs font-medium text-[hsl(var(--theme-text-secondary))]">
          {CATEGORY_LABELS[l.category]}
        </span>
        <span className="mt-2 line-clamp-2 text-sm text-muted-foreground">{l.description || 'No description yet.'}</span>
        <span className="mt-auto pt-3 text-xs text-muted-foreground">Free · {usedBy(l.installs)}</span>
      </span>
    </button>
  );
}

function ListingTile({ l, onOpen }: { l: MarketplaceListing; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="listing-card"
      className="flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors duration-150 hover:bg-[hsl(var(--theme-bg-hover))]"
    >
      <AgentLogo {...logoProps(l)} size="lg" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-base font-semibold text-foreground">{l.title}</span>
          {l.status === 'unpublished' && <span className="rounded bg-muted px-1.5 text-xs text-muted-foreground">Hidden</span>}
        </span>
        <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{l.description || 'No description yet.'}</span>
        <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          {CATEGORY_LABELS[l.category]}
          <span aria-hidden>·</span>
          {usedBy(l.installs)}
          {l.rating !== null && (
            <>
              <span aria-hidden>·</span>
              <span>★ {l.rating} ({l.rating_count})</span>
            </>
          )}
        </span>
      </span>
    </button>
  );
}

function Shelf({ title, hint, items, onOpen, onSeeAll }: {
  title: string; hint?: string; items: MarketplaceListing[]; onOpen: (l: MarketplaceListing) => void; onSeeAll?: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="mb-8">
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
        </div>
        {onSeeAll && (
          <button type="button" onClick={onSeeAll} className="inline-flex items-center gap-0.5 text-sm font-medium text-[hsl(var(--theme-text-accent))] hover:underline">
            See all <Icon icon={ChevronRight} size="sm" />
          </button>
        )}
      </div>
      <div className="grid gap-1 sm:grid-cols-2">
        {items.map((l) => <ListingTile key={l.id} l={l} onOpen={() => onOpen(l)} />)}
      </div>
    </section>
  );
}

/* ─── Detail ──────────────────────────────────────────────────────────── */

type DetailTab = 'overview' | 'access' | 'behaviour';

function ListingDetail({ l, tools, onBack, onAdd, onRate, onRemove }: {
  l: MarketplaceListing;
  tools: BuilderTool[];
  onBack: () => void;
  onAdd: () => void;
  onRate: (stars: number) => void;
  onRemove: () => void;
}) {
  const [tab, setTab] = useState<DetailTab>('overview');
  const risk = (name: string) => tools.find((t) => t.name === name)?.risk ?? 'read';
  const sees = l.tools.filter((t) => risk(t) === 'read');
  const asks = l.tools.filter((t) => risk(t) !== 'read');
  const triggers = (l.triggers as TriggerType[]).filter((t) => TRIGGER_LABELS[t]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <button type="button" onClick={onBack} className="mb-5 inline-flex items-center gap-1 text-sm text-[hsl(var(--theme-text-accent))] hover:underline">
        <Icon icon={ArrowLeft} size="sm" /> Agent directory
      </button>

      <div className="grid gap-8 md:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="flex items-center gap-4 md:block">
            <AgentLogo {...logoProps(l)} size="xl" />
            <div className="min-w-0 md:hidden">
              <h1 className="text-xl font-semibold text-foreground">{l.title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{l.description || 'No description yet.'}</p>
            </div>
          </div>
          {l.status === 'published' ? (
            <button type="button" className={cn(btnMain, 'w-full')} onClick={onAdd}>
              <Icon icon={Plus} size="md" /> Add to AuraFlow
            </button>
          ) : (
            <p className="rounded-md bg-muted p-2 text-sm text-muted-foreground">Hidden from the directory. Agents already added keep working.</p>
          )}
          {l.mine && l.status === 'published' && (
            <button type="button" className={cn(btnQuiet, 'w-full text-destructive')} onClick={onRemove}>
              <Icon icon={Trash2} size="md" /> Remove from directory
            </button>
          )}

          <dl className="space-y-3 border-t border-border pt-4 text-sm">
            <div><dt className="text-xs text-muted-foreground">Category</dt><dd className="text-foreground">{CATEGORY_LABELS[l.category]}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Made by</dt><dd className="text-foreground">{l.mine ? 'You' : l.publisher ?? 'A community member'}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Price</dt><dd className="text-foreground">Free</dd></div>
            <div><dt className="text-xs text-muted-foreground">Popularity</dt><dd className="text-foreground">{usedBy(l.installs)}</dd></div>
            <div>
              <dt className="text-xs text-muted-foreground">Rating</dt>
              <dd className="flex items-center gap-2 text-foreground" data-testid="rating">
                <StarRating value={l.rating} label={l.rating === null ? 'Not rated yet' : `Rated ${l.rating} out of 5`} />
                {l.rating === null ? 'No ratings yet' : `${l.rating} (${l.rating_count})`}
              </dd>
            </div>
            {l.updated_at && (
              <div><dt className="text-xs text-muted-foreground">Updated</dt><dd className="text-foreground">{new Date(l.updated_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}</dd></div>
            )}
          </dl>

          {l.status === 'published' && !l.mine && (
            <div className="border-t border-border pt-4">
              <p className="mb-1 text-xs text-muted-foreground">Your rating</p>
              <StarRating value={l.my_rating} onRate={onRate} label="Your rating" />
              {l.my_rating !== null && <p className="mt-1 text-xs text-muted-foreground">Tap your star again to clear it.</p>}
            </div>
          )}
        </aside>

        <section className="min-w-0">
          <div className="hidden md:block">
            <h1 className="text-2xl font-semibold text-foreground">{l.title}</h1>
            <p className="mt-1 text-base text-muted-foreground">{l.description || 'No description yet.'}</p>
          </div>

          <div role="tablist" aria-label="About this agent" className="mt-5 flex gap-1 border-b border-border">
            {([['overview', 'Overview'], ['access', 'What it can access'], ['behaviour', 'How it behaves']] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cn(
                  '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                  tab === key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div role="tabpanel" className="pt-5">
            {tab === 'overview' && (
              <div className="space-y-6">
                <div>
                  <h2 className="mb-2 text-base font-semibold text-foreground">What it can do</h2>
                  {l.tools.length ? (
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {l.tools.map((t) => (
                        <li key={t} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground">
                          <Icon icon={Check} size="sm" className="text-success" /> {toolLabel(t)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">It answers from what it already knows. It does not take any actions.</p>
                  )}
                </div>
                <div>
                  <h2 className="mb-2 text-base font-semibold text-foreground">When it replies</h2>
                  <ul className="space-y-2">
                    {(triggers.length ? triggers : (['mention'] as TriggerType[])).map((t) => (
                      <li key={t} className="text-sm">
                        <span className="font-medium text-foreground">{TRIGGER_LABELS[t].label}.</span>{' '}
                        <span className="text-muted-foreground">{TRIGGER_LABELS[t].hint}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h2 className="mb-2 text-base font-semibold text-foreground">Get started</h2>
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

            {tab === 'access' && (
              <div className="space-y-5 text-sm">
                <div className="flex gap-3">
                  <Icon icon={Eye} size="lg" className="mt-0.5 text-muted-foreground" />
                  <div>
                    <h2 className="font-semibold text-foreground">It can look at</h2>
                    <p className="text-muted-foreground">
                      {sees.length ? sees.map(toolLabel).join(', ') + '.' : 'Only the message it is replying to.'} Only in the places you add it.
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Icon icon={Hand} size="lg" className="mt-0.5 text-muted-foreground" />
                  <div>
                    <h2 className="font-semibold text-foreground">It asks you first before</h2>
                    <p className="text-muted-foreground">
                      {asks.length ? asks.map(toolLabel).join(', ') + '. You get a card with exactly what it wants to do, and you choose Approve or Reject.' : 'Nothing. It can only reply with messages.'}
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Icon icon={User} size="lg" className="mt-0.5 text-muted-foreground" />
                  <div>
                    <h2 className="font-semibold text-foreground">You stay in charge</h2>
                    <p className="text-muted-foreground">You decide where it works (just you, or a community you manage). You can pause it, change it or remove it at any time.</p>
                  </div>
                </div>
              </div>
            )}

            {tab === 'behaviour' && (
              <div>
                <p className="mb-2 text-sm text-muted-foreground">
                  These are the instructions its maker wrote. After you add it, you can change them.
                </p>
                <div className="whitespace-pre-wrap break-words rounded-lg border border-border bg-[hsl(var(--theme-bg-secondary))] p-4 text-sm text-foreground">
                  {l.instructions || 'No instructions.'}
                </div>
              </div>
            )}
          </div>
        </section>
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
  };

  const published = useMemo(() => (listings ?? []).filter((l) => l.status === 'published'), [listings]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    published.forEach((l) => { c[l.category] = (c[l.category] ?? 0) + 1; });
    return c;
  }, [published]);

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    let list = filter === MINE ? (listings ?? []).filter((l) => l.mine) : published;
    if (filter && filter !== MINE) list = list.filter((l) => l.category === filter);
    if (q) list = list.filter((l) => `${l.title} ${l.description} ${CATEGORY_LABELS[l.category]}`.toLowerCase().includes(q));
    return [...list].sort((a, b) => b.installs - a.installs || (b.rating ?? 0) - (a.rating ?? 0));
  }, [listings, published, filter, q]);

  const featured = useMemo(() => [...published].sort((a, b) => (b.rating ?? 0) * 10 + b.installs - ((a.rating ?? 0) * 10 + a.installs)).slice(0, 3), [published]);
  const newest = useMemo(() => [...published].sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? '')).slice(0, 4), [published]);
  const selected = openId ? (listings ?? []).find((l) => l.id === openId) ?? null : null;

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
    if (!window.confirm(`Remove "${l.title}" from the directory? Agents people already added keep working.`)) return;
    try {
      await marketplaceService.remove(l.id);
      setListings((list) => (list ?? []).map((x) => (x.id === l.id ? { ...x, status: 'unpublished' } : x)));
    } catch (e) {
      toast({ title: 'Could not remove', description: errorMessage(e), variant: 'destructive' });
    }
  };

  const navItem = (key: Filter, label: string, count?: number, icon?: React.ReactNode) => (
    <button
      key={key || 'all'}
      type="button"
      onClick={() => { setQuery(''); go({ c: key, agent: null }); }}
      aria-current={filter === key && !selected ? 'page' : undefined}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
        filter === key ? 'bg-[hsl(var(--theme-bg-active))] font-medium text-foreground' : 'text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] hover:text-foreground',
      )}
    >
      {icon}
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && <span className="text-xs text-muted-foreground">{count}</span>}
    </button>
  );

  const categories = Object.keys(CATEGORY_LABELS) as MarketplaceCategory[];
  const heading = filter === MINE ? 'Shared by you' : filter ? CATEGORY_LABELS[filter] : q ? 'Search results' : '';

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <PageHeader
        title="Agent directory"
        description="Ready-made agents you can add to yourself or your community."
        className="pl-16 md:pl-4"
        actions={
          <div className="relative">
            <Icon icon={Search} size="md" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); if (selected) go({ agent: null }); }}
              placeholder="Search agents"
              aria-label="Search agents"
              className="h-8 w-40 rounded-md border border-border bg-[hsl(var(--theme-input-bg))] pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none sm:w-64"
            />
          </div>
        }
      />

      <div className="flex min-h-0 flex-1">
        <nav aria-label="Browse agents" className="hidden w-56 shrink-0 overflow-y-auto border-r border-border p-3 md:block">
          {navItem('', 'Featured', undefined, <Icon icon={LayoutGrid} size="md" />)}
          <p className="mb-1 mt-4 px-2.5 text-xs font-medium text-muted-foreground">Categories</p>
          {categories.map((c) => navItem(c, CATEGORY_LABELS[c], counts[c] ?? 0, <AgentLogo name="" category={c} size="xs" />))}
          <div className="my-3 h-px bg-border" />
          {navItem(MINE, 'Shared by you', (listings ?? []).filter((l) => l.mine).length, <Icon icon={Share2} size="md" />)}
          <button
            type="button"
            onClick={() => navigate('/agents')}
            className="mt-1 flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] hover:text-foreground"
          >
            <Icon icon={Users} size="md" /> Your agents
          </button>
        </nav>

        <main className="min-w-0 flex-1 overflow-y-auto">
          {/* Small screens: categories as chips */}
          {!selected && (
            <div className="flex gap-2 overflow-x-auto border-b border-border px-4 py-2 md:hidden">
              {(['', ...categories, MINE] as Filter[]).map((c) => (
                <button
                  key={c || 'all'}
                  type="button"
                  onClick={() => go({ c })}
                  className={cn(
                    'shrink-0 rounded-full border px-3 py-1 text-sm',
                    filter === c ? 'border-primary bg-[hsl(var(--theme-bg-active))] text-foreground' : 'border-border text-muted-foreground',
                  )}
                >
                  {c === '' ? 'Featured' : c === MINE ? 'Shared by you' : CATEGORY_LABELS[c]}
                </button>
              ))}
            </div>
          )}

          {selected ? (
            <ListingDetail
              l={selected}
              tools={tools}
              onBack={() => go({ agent: null })}
              onAdd={() => { setWhere(PERSONAL); setAdding(selected); }}
              onRate={(n) => void rate(selected, n)}
              onRemove={() => void remove(selected)}
            />
          ) : (
            <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
              {error && <div className="mb-4"><ErrorState message={error} onRetry={() => void load()} /></div>}

              {listings === null ? (
                <div role="status" aria-label="Loading agents" className="grid gap-3 sm:grid-cols-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex gap-3 p-3">
                      <div className="h-12 w-12 rounded-lg bg-[hsl(var(--theme-bg-tertiary))] animate-skeleton" />
                      <div className="flex-1 space-y-2 pt-1">
                        <div className="h-4 w-1/2 rounded bg-[hsl(var(--theme-bg-tertiary))] animate-skeleton" />
                        <div className="h-3.5 w-4/5 rounded bg-[hsl(var(--theme-bg-tertiary))] animate-skeleton" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : heading ? (
                <section>
                  <div className="mb-3">
                    <h2 className="text-lg font-semibold text-foreground">{heading}</h2>
                    <p className="text-sm text-muted-foreground">
                      {filter === MINE
                        ? 'Agents you shared. Share one from its page with the Share button.'
                        : filter
                          ? CATEGORY_HINTS[filter]
                          : `${visible.length} ${visible.length === 1 ? 'agent' : 'agents'} match "${query}".`}
                    </p>
                  </div>
                  {visible.length ? (
                    <div className="grid gap-1 sm:grid-cols-2">
                      {visible.map((l) => <ListingTile key={l.id} l={l} onOpen={() => go({ agent: l.id })} />)}
                    </div>
                  ) : (
                    <EmptyState
                      icon={Search}
                      title={filter === MINE ? 'You have not shared any agents yet' : 'No agents here yet'}
                      description={filter === MINE ? 'Open one of your agents and choose Share.' : 'Try another category, or make your own agent.'}
                      action={<button type="button" className={btnMain} onClick={() => navigate('/agents')}>Go to your agents</button>}
                    />
                  )}
                </section>
              ) : published.length === 0 ? (
                <EmptyState
                  icon={LayoutGrid}
                  title="The directory is empty"
                  description="When someone shares an agent, it shows up here. You can be the first: open one of your agents and choose Share."
                  action={<button type="button" className={btnMain} onClick={() => navigate('/agents')}>Go to your agents</button>}
                />
              ) : (
                <>
                  <section className="mb-8">
                    <h2 className="mb-1 text-lg font-semibold text-foreground">Featured</h2>
                    <p className="mb-3 text-sm text-muted-foreground">The best-rated and most added agents right now.</p>
                    <div className="grid gap-3 lg:grid-cols-3">
                      {featured.map((l) => <FeaturedCard key={l.id} l={l} onOpen={() => go({ agent: l.id })} />)}
                    </div>
                  </section>
                  <Shelf title="Recently updated" items={newest} onOpen={(l) => go({ agent: l.id })} />
                  {categories.map((c) => {
                    const items = published.filter((l) => l.category === c).slice(0, 4);
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
      </div>

      <Dialog open={!!adding} onOpenChange={(open) => { if (!open) setAdding(null); }}>
        <DialogContent className="max-w-md bg-popover text-popover-foreground">
          <DialogHeader>
            <div className="flex items-center gap-3">
              {adding && <AgentLogo {...logoProps(adding)} size="lg" />}
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
