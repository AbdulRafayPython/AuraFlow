import { useState, useEffect, useMemo } from 'react';
import { X, Brain, Search, FileQuestion, BookText, CheckSquare, Copy, Check } from 'lucide-react';
import aiAgentService from '../../services/aiAgentService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface KBItem {
  id: number;
  title: string;
  content: string; // raw JSON string from backend
  source: string;
  channel_id: number;
  channel_name: string | null;
  created_at: string | null;
}

interface ParsedKBItem {
  id: number;
  type: 'faq' | 'definition' | 'decision' | 'unknown';
  question: string;
  answer: string;
  tags: string[];
  channel_name: string | null;
  created_at: string | null;
}

type FilterType = 'all' | 'faq' | 'definition' | 'decision';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseItem(raw: KBItem): ParsedKBItem {
  try {
    const parsed = JSON.parse(raw.content);
    return {
      id: raw.id,
      type: (parsed.type as ParsedKBItem['type']) || 'unknown',
      question: parsed.question || raw.title || '',
      answer: parsed.answer || '',
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      channel_name: raw.channel_name,
      created_at: raw.created_at,
    };
  } catch {
    return {
      id: raw.id,
      type: 'unknown',
      question: raw.title || '',
      answer: '',
      tags: [],
      channel_name: raw.channel_name,
      created_at: raw.created_at,
    };
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const TYPE_CONFIG = {
  faq: {
    label: 'FAQ',
    color: 'text-amber-400',
    border: 'border-l-amber-400',
    bg: 'bg-amber-400/10',
    Icon: FileQuestion,
  },
  definition: {
    label: 'Definition',
    color: 'text-blue-400',
    border: 'border-l-blue-400',
    bg: 'bg-blue-400/10',
    Icon: BookText,
  },
  decision: {
    label: 'Decision',
    color: 'text-emerald-400',
    border: 'border-l-emerald-400',
    bg: 'bg-emerald-400/10',
    Icon: CheckSquare,
  },
  unknown: {
    label: 'Note',
    color: 'text-slate-400',
    border: 'border-l-slate-400',
    bg: 'bg-slate-400/10',
    Icon: BookText,
  },
};

function KBCard({ item }: { item: ParsedKBItem }) {
  const [copied, setCopied] = useState(false);
  const cfg = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.unknown;

  const handleCopy = () => {
    const text = item.answer
      ? `${item.question}\n\n${item.answer}`
      : item.question;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div
      className={`group relative rounded-lg border border-white/5 border-l-2 ${cfg.border} bg-[hsl(var(--theme-bg-secondary)/0.4)] overflow-hidden hover:border-white/10 transition-all`}
    >
      {/* Card Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.04]">
        <span className={`text-[10px] font-bold uppercase tracking-wider ${cfg.color}`}>
          {cfg.label}
        </span>
        <div className="flex items-center gap-2">
          {item.created_at && (
            <span className="text-[10px] text-[hsl(var(--theme-text-muted))]">
              {formatDate(item.created_at)}
            </span>
          )}
          <button
            onClick={handleCopy}
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/10 text-[hsl(var(--theme-text-muted))] hover:text-white transition-all"
            title="Copy to clipboard"
          >
            {copied ? (
              <Check className="w-3 h-3 text-emerald-400" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </button>
        </div>
      </div>

      {/* Question / Term */}
      <div className="px-3 pt-2.5 pb-1">
        <p className="text-[13px] font-semibold text-[hsl(var(--theme-text-primary))] leading-snug">
          {item.question}
        </p>
      </div>

      {/* Answer / Definition */}
      {item.answer && (
        <div className="px-3 pb-2.5">
          <p className="text-[12px] leading-[1.55] text-[hsl(var(--theme-text-secondary))] line-clamp-3">
            {item.answer}
          </p>
        </div>
      )}

      {/* Tags */}
      {item.tags.length > 0 && (
        <div className="px-3 pb-2.5 flex flex-wrap gap-1">
          {item.tags.slice(0, 3).map((tag, i) => (
            <span
              key={i}
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface KnowledgePanelProps {
  channelId: number;
  channelName: string;
  onClose: () => void;
}

export function KnowledgePanel({ channelId, channelName, onClose }: KnowledgePanelProps) {
  const [rawItems, setRawItems] = useState<KBItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');

  // Fetch on mount or channel change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setRawItems([]);

    aiAgentService.getKnowledgeBase(channelId, 100).then((data: any) => {
      if (!cancelled) {
        setRawItems(data || []);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [channelId]);

  // Parse all items once
  const parsedItems = useMemo(() => rawItems.map(parseItem), [rawItems]);

  // Stats
  const stats = useMemo(() => ({
    faq: parsedItems.filter(i => i.type === 'faq').length,
    definition: parsedItems.filter(i => i.type === 'definition').length,
    decision: parsedItems.filter(i => i.type === 'decision').length,
  }), [parsedItems]);

  // Filtered + searched items
  const displayed = useMemo(() => {
    let result = parsedItems;
    if (filter !== 'all') result = result.filter(i => i.type === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        i =>
          i.question.toLowerCase().includes(q) ||
          i.answer.toLowerCase().includes(q) ||
          i.tags.some(t => t.toLowerCase().includes(q)),
      );
    }
    return result;
  }, [parsedItems, filter, search]);

  const FILTER_TABS: { key: FilterType; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: parsedItems.length },
    { key: 'faq', label: 'FAQs', count: stats.faq },
    { key: 'definition', label: 'Definitions', count: stats.definition },
    { key: 'decision', label: 'Decisions', count: stats.decision },
  ];

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[380px] z-50 flex flex-col bg-[hsl(var(--theme-bg-elevated))] border-l border-[hsl(var(--theme-border-default)/0.5)] shadow-2xl animate-in slide-in-from-right duration-200 pt-safe pb-safe">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--theme-border-default)/0.3)]">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-[hsl(var(--theme-text-primary))]">
            Knowledge Base
          </h3>
          <span className="text-[11px] text-[hsl(var(--theme-text-muted))]">
            #{channelName}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-muted))] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── Search ── */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-[hsl(var(--theme-input-bg))] border border-[hsl(var(--theme-border-default)/0.5)]">
          <Search className="w-3.5 h-3.5 text-[hsl(var(--theme-text-muted))] flex-shrink-0" />
          <input
            type="text"
            placeholder="Search knowledge..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-[12px] text-[hsl(var(--theme-text-primary))] placeholder:text-[hsl(var(--theme-text-muted))] outline-none"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-secondary))]">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* ── Filter Tabs ── */}
      <div className="px-4 pb-2 flex gap-1.5 flex-wrap">
        {FILTER_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors ${
              filter === tab.key
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'bg-transparent text-[hsl(var(--theme-text-muted))] border border-[hsl(var(--theme-border-default)/0.4)] hover:border-[hsl(var(--theme-border-default)/0.7)] hover:text-[hsl(var(--theme-text-secondary))]'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-1 opacity-70">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-5 h-5 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin mb-3" />
            <p className="text-[12px] text-[hsl(var(--theme-text-muted))]">Loading knowledge base...</p>
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Brain className="w-8 h-8 text-[hsl(var(--theme-text-muted)/0.3)] mb-3" />
            {parsedItems.length === 0 ? (
              <>
                <p className="text-sm text-[hsl(var(--theme-text-muted))]">No knowledge yet</p>
                <p className="text-[11px] text-[hsl(var(--theme-text-muted)/0.7)] mt-1">
                  Type <code className="bg-white/5 px-1 rounded">/kb</code> in chat to extract knowledge
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-[hsl(var(--theme-text-muted))]">No matching items</p>
                <p className="text-[11px] text-[hsl(var(--theme-text-muted)/0.7)] mt-1">
                  Try a different search or filter
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-2.5 pb-4">
            {displayed.map(item => (
              <KBCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>

      {/* ── Footer Stats ── */}
      {!loading && parsedItems.length > 0 && (
        <div className="px-4 py-2.5 border-t border-[hsl(var(--theme-border-default)/0.3)]">
          <p className="text-[11px] text-[hsl(var(--theme-text-muted))] text-center">
            <span className="text-amber-400 font-medium">{stats.faq}</span> FAQs
            {' • '}
            <span className="text-blue-400 font-medium">{stats.definition}</span> Definitions
            {' • '}
            <span className="text-emerald-400 font-medium">{stats.decision}</span> Decisions
          </p>
        </div>
      )}
    </div>
  );
}

export default KnowledgePanel;
