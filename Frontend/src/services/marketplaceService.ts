// services/marketplaceService.ts — client for /api/agent-marketplace
import api from './appService';
import type { BuilderAgent, ListingInput, MarketplaceCategory, MarketplaceListing } from '@/types/agentBuilder';

const BASE = '/api/agent-marketplace';

const http = {
  get: <T>(path: string) => api.get(path) as unknown as Promise<T>,
  post: <T>(path: string, body?: unknown) => api.post(path, body) as unknown as Promise<T>,
  put: <T>(path: string, body?: unknown) => api.put(path, body) as unknown as Promise<T>,
  del: (path: string) => api.del(path) as unknown as Promise<void>,
};

export const CATEGORY_LABELS: Record<MarketplaceCategory, string> = {
  support: 'Support', community: 'Community', productivity: 'Productivity', learning: 'Learning', fun: 'Fun', other: 'Other',
};

export type MarketplaceSort = 'popular' | 'top_rated' | 'newest';

export const SORT_LABELS: Record<MarketplaceSort, string> = { popular: 'Most installed', top_rated: 'Top rated', newest: 'Newest' };

export interface BrowseOptions { q?: string; category?: MarketplaceCategory | ''; mine?: boolean; sort?: MarketplaceSort; connection?: 'mcp' }

/** Query string for the browse call (empty when nothing is filtered). */
export function browseQuery(opts: BrowseOptions = {}): string {
  const params = new URLSearchParams();
  if (opts.q?.trim()) params.set('q', opts.q.trim());
  if (opts.category) params.set('category', opts.category);
  if (opts.mine) params.set('mine', '1');
  if (opts.sort && opts.sort !== 'popular') params.set('sort', opts.sort);
  if (opts.connection) params.set('connection', opts.connection);
  const q = params.toString();
  return q ? `?${q}` : '';
}

export const marketplaceService = {
  async browse(opts: BrowseOptions = {}): Promise<MarketplaceListing[]> {
    return (await http.get<{ listings: MarketplaceListing[] }>(`${BASE}/listings${browseQuery(opts)}`)).listings;
  },
  publish(agentId: string, body: ListingInput): Promise<MarketplaceListing> {
    return http.post<MarketplaceListing>(`${BASE}/agents/${agentId}/listing`, body);
  },
  /** Upload a persona avatar or banner image; returns the url to send with publish. */
  async uploadMedia(file: File): Promise<string> {
    const form = new FormData();
    form.append('file', file);
    return (await http.post<{ url: string }>(`${BASE}/listings/media`, form)).url;
  },
  rate(listingId: string, stars: number): Promise<MarketplaceListing> {
    return http.put<MarketplaceListing>(`${BASE}/listings/${listingId}/rating`, { stars });
  },
  clearRating(listingId: string): Promise<MarketplaceListing> {
    return http.del(`${BASE}/listings/${listingId}/rating`) as unknown as Promise<MarketplaceListing>;
  },
  remove(listingId: string): Promise<void> {
    return http.del(`${BASE}/listings/${listingId}`);
  },
  install(listingId: string, body: { community_id?: string | null; name?: string }): Promise<BuilderAgent> {
    return http.post<BuilderAgent>(`${BASE}/listings/${listingId}/install`, body);
  },
};

export default marketplaceService;
