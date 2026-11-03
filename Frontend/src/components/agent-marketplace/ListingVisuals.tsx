// The look of a marketplace listing: persona avatar, banner and the browse card.
// Images are the publisher's choice (a gallery file or an upload). A listing
// without its own banner shows its category's banner art; without an avatar,
// the agent's generated logo.
import { Plug, Star, Wrench } from 'lucide-react';
import AgentLogo from '@/components/ai-agents/AgentLogo';
import { API_SERVER } from '@/config/api';
import { cn } from '@/lib/utils';
import { CATEGORY_LABELS } from '@/services/marketplaceService';
import type { MarketplaceCategory, MarketplaceListing } from '@/types/agentBuilder';

/** Persona avatars bundled with the app (public/agents/personas). */
export const PERSONA_GALLERY = [
  { id: 'support', label: 'Support' },
  { id: 'tutor', label: 'Tutor' },
  { id: 'planner', label: 'Planner' },
  { id: 'host', label: 'Host' },
  { id: 'translator', label: 'Translator' },
  { id: 'quiz', label: 'Quiz master' },
  { id: 'writer', label: 'Writer' },
  { id: 'guardian', label: 'Guardian' },
  { id: 'researcher', label: 'Researcher' },
  { id: 'coder', label: 'Coder' },
  { id: 'coach', label: 'Coach' },
  { id: 'party', label: 'Party host' },
].map((p) => ({ ...p, url: `/agents/personas/${p.id}.webp` }));

/** One banner per category (public/agents/banners). */
export const BANNER_GALLERY = (Object.keys(CATEGORY_LABELS) as MarketplaceCategory[]).map((c) => ({
  id: c, label: CATEGORY_LABELS[c], url: `/agents/banners/${c}.webp`,
}));

/** Gallery files are served by the web app; uploads by the API. */
export const listingImageUrl = (path: string) => (path.startsWith('/uploads/') ? `${API_SERVER}${path}` : path);

export const bannerFor = (l: Pick<MarketplaceListing, 'banner_url' | 'category'>) =>
  listingImageUrl(l.banner_url || `/agents/banners/${l.category}.webp`);

export const usedBy = (n: number) => (n === 0 ? 'New' : `Added ${n} ${n === 1 ? 'time' : 'times'}`);

type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';
const AVATAR: Record<AvatarSize, string> = {
  sm: 'h-10 w-10 rounded-lg',
  md: 'h-14 w-14 rounded-xl',
  lg: 'h-20 w-20 rounded-2xl',
  xl: 'h-28 w-28 rounded-3xl',
};
const LOGO_SIZE: Record<AvatarSize, 'md' | 'lg' | 'xl'> = { sm: 'md', md: 'lg', lg: 'xl', xl: 'xl' };

export function ListingAvatar({ l, size = 'md', className }: {
  l: Pick<MarketplaceListing, 'icon_url' | 'title' | 'category'>;
  size?: AvatarSize;
  className?: string;
}) {
  if (l.icon_url) {
    return <img src={listingImageUrl(l.icon_url)} alt="" className={cn('shrink-0 object-cover', AVATAR[size], className)} />;
  }
  return (
    <span className={cn('flex shrink-0 items-center justify-center overflow-hidden bg-[hsl(var(--theme-bg-tertiary))]', AVATAR[size], className)}>
      <AgentLogo name={l.title} category={l.category} size={LOGO_SIZE[size]} />
    </span>
  );
}

/** Browse card: banner, persona, name, tagline, rating, installs and what it uses. */
export function ListingCard({ l, onOpen, featured = false }: { l: MarketplaceListing; onOpen: () => void; featured?: boolean }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="listing-card"
      aria-label={`View ${l.title}`}
      className="card-sheen group flex flex-col overflow-hidden rounded-lg border border-border bg-[hsl(var(--theme-bg-secondary))] text-left transition-colors duration-150 hover:border-[hsl(var(--theme-border-hover))] hover:bg-[hsl(var(--theme-bg-tertiary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className={cn('relative w-full shrink-0 overflow-hidden', featured ? 'h-36' : 'h-24')}>
        <img src={bannerFor(l)} alt="" className="h-full w-full object-cover" />
        {l.status === 'unpublished' && (
          <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 text-xs font-medium text-white">Not listed</span>
        )}
      </div>
      <div className={cn('relative flex w-full flex-1 flex-col px-4 pb-4', featured ? 'pt-12' : 'pt-10')}>
        <ListingAvatar
          l={l}
          size={featured ? 'lg' : 'md'}
          className={cn('absolute left-4 border-4 border-[hsl(var(--theme-bg-secondary))] transition-colors duration-150 group-hover:border-[hsl(var(--theme-bg-tertiary))]', featured ? '-top-10' : '-top-7')}
        />
        <h3 className="truncate text-base font-semibold text-foreground">{l.title}</h3>
        {/* Plain meta line, like Discord's "Games · Promoted" (no pill). */}
        <p className="truncate text-xs font-medium text-muted-foreground">
          {CATEGORY_LABELS[l.category]}{l.publisher && <> · by {l.mine ? 'you' : l.publisher}</>}
        </p>
        <p className="mt-2 line-clamp-2 min-h-[2.5rem] text-sm text-[hsl(var(--theme-text-secondary))]">{l.tagline || l.description || 'No description yet.'}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Star className={cn('h-3.5 w-3.5', l.rating !== null && 'fill-warning text-warning')} />
            {l.rating !== null ? `${l.rating} (${l.rating_count})` : 'No ratings'}
          </span>
          <span>{usedBy(l.installs)}</span>
          {l.tools.length > 0 && (
            <span className="inline-flex items-center gap-1"><Wrench className="h-3.5 w-3.5" />{l.tools.length} {l.tools.length === 1 ? 'tool' : 'tools'}</span>
          )}
          {l.connections.length > 0 && (
            <span className="inline-flex items-center gap-1"><Plug className="h-3.5 w-3.5" />{l.connections.map((c) => c.name).join(', ')}</span>
          )}
        </div>
      </div>
    </button>
  );
}
