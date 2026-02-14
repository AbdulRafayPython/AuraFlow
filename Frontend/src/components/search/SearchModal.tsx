// components/search/SearchModal.tsx — Ctrl+K spotlight search modal
// Production-grade: debounce, keyboard nav, scope filters, result highlights, recent searches

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Search, X, Hash, MessageSquare, Clock, ArrowRight, Loader2, Filter } from 'lucide-react';
import { searchService, type SearchResult } from '@/services/searchService';
import { getAvatarUrl } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (result: SearchResult) => void;
  currentChannelId?: number;
  communityId?: number;
  communityName?: string;
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query || query.length < 2) return text;
  const truncated = text.length > 200 ? text.slice(0, 200) + '…' : text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = truncated.split(regex);

  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-[hsl(var(--theme-accent-primary)/0.3)] text-[hsl(var(--theme-text-primary))] rounded px-0.5">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  onClose,
  onNavigate,
  currentChannelId,
  communityId,
  communityName,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [scope, setScope] = useState<'all' | 'channels' | 'dms'>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Load recent searches on open
  useEffect(() => {
    if (isOpen) {
      setRecentSearches(searchService.getRecentSearches());
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Debounced search
  const doSearch = useCallback(async (searchQuery: string, searchScope: string) => {
    if (searchQuery.length < 2) {
      setResults([]);
      setTotalCount(0);
      setHasMore(false);
      return;
    }

    setIsLoading(true);
    try {
      const resp = await searchService.searchMessages({
        q: searchQuery,
        scope: searchScope as any,
        community_id: communityId,
        limit: 20,
      });
      setResults(resp.results);
      setTotalCount(resp.total);
      setHasMore(resp.has_more);
      setSelectedIndex(0);
    } catch (err) {
      console.error('[Search] Failed:', err);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [communityId]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query, scope), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, scope, doSearch]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const maxIdx = results.length > 0 ? results.length - 1 : recentSearches.length - 1;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, maxIdx));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results.length > 0 && results[selectedIndex]) {
        handleSelect(results[selectedIndex]);
      } else if (!query && recentSearches[selectedIndex]) {
        setQuery(recentSearches[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  }, [results, selectedIndex, recentSearches, query, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    const container = resultsRef.current;
    if (!container) return;
    const selected = container.querySelector(`[data-index="${selectedIndex}"]`);
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleSelect = (result: SearchResult) => {
    searchService.addRecentSearch(query);
    onNavigate?.(result);
    onClose();
  };

  // Close on backdrop click
  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  // Global Ctrl+K listener registered by parent
  if (!isOpen) return null;

  const showRecent = !query && recentSearches.length > 0;
  const showEmpty = query.length >= 2 && !isLoading && results.length === 0;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={handleBackdrop}
    >
      <div className="w-full max-w-2xl mx-4 bg-[hsl(var(--theme-bg-elevated))] rounded-xl shadow-2xl border border-[hsl(var(--theme-border-subtle))] overflow-hidden animate-in slide-in-from-top-4 duration-200">
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[hsl(var(--theme-border-subtle))]">
          <Search className="w-5 h-5 text-[hsl(var(--theme-text-muted))] flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={communityName ? `Search in ${communityName}…` : 'Search messages…'}
            className="flex-1 bg-transparent text-[hsl(var(--theme-text-primary))] text-base placeholder:text-[hsl(var(--theme-text-muted))] outline-none"
            autoComplete="off"
            spellCheck={false}
          />
          {isLoading && <Loader2 className="w-4 h-4 text-[hsl(var(--theme-accent-primary))] animate-spin flex-shrink-0" />}
          {query && (
            <button
              onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              className="p-1 rounded hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-muted))]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-xs text-[hsl(var(--theme-text-muted))] bg-[hsl(var(--theme-bg-surface))] rounded border border-[hsl(var(--theme-border-subtle))]">
            ESC
          </kbd>
        </div>

        {/* Scope Filters */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-[hsl(var(--theme-border-subtle))]">
          {(['all', 'channels', 'dms'] as const).map(s => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-full transition-colors',
                scope === s
                  ? 'bg-[hsl(var(--theme-accent-primary))] text-white'
                  : 'text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))]'
              )}
            >
              {s === 'all' ? 'All' : s === 'channels' ? 'Channels' : 'Direct Messages'}
            </button>
          ))}
          {totalCount > 0 && (
            <span className="ml-auto text-xs text-[hsl(var(--theme-text-muted))]">
              {totalCount} result{totalCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Results */}
        <div ref={resultsRef} className="max-h-[50vh] overflow-y-auto custom-scrollbar">
          {/* Recent searches */}
          {showRecent && (
            <div className="p-2">
              <div className="flex items-center justify-between px-2 py-1">
                <span className="text-xs font-medium text-[hsl(var(--theme-text-muted))] uppercase tracking-wider">Recent</span>
                <button
                  onClick={() => { searchService.clearRecentSearches(); setRecentSearches([]); }}
                  className="text-xs text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-secondary))] transition-colors"
                >
                  Clear
                </button>
              </div>
              {recentSearches.map((recent, i) => (
                <button
                  key={recent}
                  data-index={i}
                  onClick={() => setQuery(recent)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                    selectedIndex === i
                      ? 'bg-[hsl(var(--theme-bg-active))]'
                      : 'hover:bg-[hsl(var(--theme-bg-hover))]'
                  )}
                >
                  <Clock className="w-4 h-4 text-[hsl(var(--theme-text-muted))] flex-shrink-0" />
                  <span className="text-[hsl(var(--theme-text-secondary))] truncate">{recent}</span>
                </button>
              ))}
            </div>
          )}

          {/* Search results */}
          {results.map((result, i) => (
            <button
              key={`${result.type}-${result.id}`}
              data-index={i}
              onClick={() => handleSelect(result)}
              className={cn(
                'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors border-b border-[hsl(var(--theme-border-subtle)/0.5)] last:border-b-0',
                selectedIndex === i
                  ? 'bg-[hsl(var(--theme-bg-active))]'
                  : 'hover:bg-[hsl(var(--theme-bg-hover))]'
              )}
            >
              {/* Avatar */}
              <img
                src={getAvatarUrl(result.avatar_url, result.author)}
                alt=""
                className="w-8 h-8 rounded-full flex-shrink-0 mt-0.5 object-cover"
              />

              <div className="flex-1 min-w-0">
                {/* Header: author + location + time */}
                <div className="flex items-center gap-2 text-xs mb-0.5">
                  <span className="font-semibold text-[hsl(var(--theme-text-primary))]">
                    {result.display_name}
                  </span>
                  <span className="text-[hsl(var(--theme-text-muted))]">·</span>
                  {result.type === 'channel' ? (
                    <span className="flex items-center gap-1 text-[hsl(var(--theme-text-muted))]">
                      <Hash className="w-3 h-3" />
                      {result.channel_name}
                      {result.community_name && (
                        <span className="text-[hsl(var(--theme-text-muted))]"> in {result.community_name}</span>
                      )}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[hsl(var(--theme-text-muted))]">
                      <MessageSquare className="w-3 h-3" />
                      DM with {result.conversation_with?.display_name}
                    </span>
                  )}
                  <span className="ml-auto text-[hsl(var(--theme-text-muted))] flex-shrink-0">
                    {formatDate(result.created_at)}
                  </span>
                </div>

                {/* Content with highlights */}
                <p className="text-sm text-[hsl(var(--theme-text-secondary))] line-clamp-2 leading-relaxed">
                  {highlightMatch(result.content, query)}
                </p>
              </div>

              <ArrowRight className="w-4 h-4 text-[hsl(var(--theme-text-muted))] flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100" />
            </button>
          ))}

          {/* Empty state */}
          {showEmpty && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="w-10 h-10 text-[hsl(var(--theme-text-muted))] mb-3 opacity-40" />
              <p className="text-sm text-[hsl(var(--theme-text-muted))]">
                No messages found for "{query}"
              </p>
              <p className="text-xs text-[hsl(var(--theme-text-muted))] mt-1 opacity-60">
                Try different keywords or change the scope filter
              </p>
            </div>
          )}

          {/* Initial state */}
          {!query && !showRecent && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="w-10 h-10 text-[hsl(var(--theme-text-muted))] mb-3 opacity-30" />
              <p className="text-sm text-[hsl(var(--theme-text-muted))]">
                Search across all your messages
              </p>
              <p className="text-xs text-[hsl(var(--theme-text-muted))] mt-1 opacity-60">
                Type at least 2 characters to start searching
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-[hsl(var(--theme-border-subtle))] bg-[hsl(var(--theme-bg-surface))]">
          <div className="flex items-center gap-3 text-xs text-[hsl(var(--theme-text-muted))]">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-[hsl(var(--theme-bg-elevated))] rounded border border-[hsl(var(--theme-border-subtle))] text-[10px]">↑↓</kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-[hsl(var(--theme-bg-elevated))] rounded border border-[hsl(var(--theme-border-subtle))] text-[10px]">↵</kbd>
              Open
            </span>
          </div>
          <span className="text-xs text-[hsl(var(--theme-text-muted))]">
            <kbd className="px-1.5 py-0.5 bg-[hsl(var(--theme-bg-elevated))] rounded border border-[hsl(var(--theme-border-subtle))] text-[10px]">Ctrl</kbd>
            +
            <kbd className="px-1.5 py-0.5 bg-[hsl(var(--theme-bg-elevated))] rounded border border-[hsl(var(--theme-border-subtle))] text-[10px]">K</kbd>
          </span>
        </div>
      </div>
    </div>
  );
};

export default SearchModal;
