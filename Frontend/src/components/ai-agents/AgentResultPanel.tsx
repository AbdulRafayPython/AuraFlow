import { useEffect, useMemo, useState } from 'react';
import {
  X,
  Brain,
  FileText,
  Smile,
  Target,
  Languages,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import { useAIAgents } from '@/contexts/AIAgentContext';
import KnowledgePanel from './KnowledgePanel';

export type AgentResultTab = 'knowledge' | 'summary' | 'mood' | 'focus' | 'translations';

interface AgentResultPanelProps {
  open: boolean;
  onClose: () => void;
  channelId: number;
  channelName: string;
  communityId?: number | null;
  initialTab?: AgentResultTab;
  /** A history of translated messages: kept by parent component */
  translations?: TranslationHistoryItem[];
}

export interface TranslationHistoryItem {
  message_id: number;
  original: string;
  translated: string;
  target_language: string;
  at: string;
}

const TABS: { key: AgentResultTab; label: string; Icon: any }[] = [
  { key: 'knowledge',    label: 'Knowledge',    Icon: Brain },
  { key: 'summary',      label: 'Summary',      Icon: FileText },
  { key: 'mood',         label: 'Mood',         Icon: Smile },
  { key: 'focus',        label: 'Focus',        Icon: Target },
  { key: 'translations', label: 'Translations', Icon: Languages },
];

export default function AgentResultPanel({
  open,
  onClose,
  channelId,
  channelName,
  communityId,
  initialTab = 'knowledge',
  translations = [],
}: AgentResultPanelProps) {
  const [tab, setTab] = useState<AgentResultTab>(initialTab);

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  if (!open) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-[400px] z-50 flex flex-col bg-[hsl(var(--theme-bg-elevated))] border-l border-[hsl(var(--theme-border-default)/0.5)] shadow-2xl animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--theme-border-default)/0.3)]">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-violet-400" />
          <h3 className="text-sm font-semibold text-[hsl(var(--theme-text-primary))]">
            Agent Insights
          </h3>
          <span className="text-[11px] text-[hsl(var(--theme-text-muted))]">
            #{channelName}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-muted))] transition-colors"
          aria-label="Close panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tab strip */}
      <div className="px-2 pt-2 flex gap-1 border-b border-[hsl(var(--theme-border-default)/0.2)] overflow-x-auto">
        {TABS.map(({ key, label, Icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors shrink-0
                ${active
                  ? 'bg-violet-500/15 text-violet-400 border border-violet-500/30'
                  : 'text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-secondary))] hover:bg-white/5'}`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'knowledge' && (
          <EmbeddedKnowledge channelId={channelId} channelName={channelName} />
        )}
        {tab === 'summary'      && <SummaryTab channelId={channelId} />}
        {tab === 'mood'         && <MoodTab />}
        {tab === 'focus'        && <FocusTab channelId={channelId} />}
        {tab === 'translations' && <TranslationsTab items={translations} />}
      </div>
    </div>
  );
}

// ─── Knowledge tab: reuses existing KnowledgePanel inline ────────────────────
function EmbeddedKnowledge({ channelId, channelName }: { channelId: number; channelName: string }) {
  return (
    <div className="relative h-full">
      {/* KnowledgePanel renders fixed; render its body inline by spoofing the close handler */}
      <InlineKnowledge channelId={channelId} channelName={channelName} />
    </div>
  );
}

function InlineKnowledge({ channelId, channelName }: { channelId: number; channelName: string }) {
  return (
    <div className="[&>div]:!relative [&>div]:!w-full [&>div]:!h-full [&>div]:!shadow-none [&>div]:!border-0 [&>div]:!bg-transparent">
      <KnowledgePanel
        channelId={channelId}
        channelName={channelName}
        onClose={() => { /* no-op: panel-level close handles this */ }}
      />
    </div>
  );
}

// ─── Summary tab ──────────────────────────────────────────────────────────────
function SummaryTab({ channelId }: { channelId: number }) {
  const { getChannelSummaries, generateSummary } = useAIAgents() as any;
  const [items, setItems] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getChannelSummaries(channelId);
      setItems(data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [channelId]); // eslint-disable-line

  const onGenerate = async () => {
    try {
      setBusy(true);
      await generateSummary(channelId, 100);
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-4 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-[hsl(var(--theme-text-primary))]">Recent summaries</h4>
        <button
          onClick={onGenerate}
          disabled={busy}
          className="text-[11px] font-medium px-2 py-1 rounded-md bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Generate'}
        </button>
      </div>

      {loading && (
        <div className="text-center py-10 text-[11px] text-[hsl(var(--theme-text-muted))]">Loading…</div>
      )}

      {!loading && items && items.length === 0 && (
        <EmptyState
          icon={<FileText className="w-7 h-7 opacity-40" />}
          title="No summaries yet"
          subtitle="Click Generate to create one."
        />
      )}

      {!loading && items && items.length > 0 && (
        <div className="space-y-2.5">
          {items.map((s: any) => (
            <div key={s.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] uppercase tracking-wider text-blue-400 font-bold">Summary</span>
                <span className="text-[10px] text-[hsl(var(--theme-text-muted))]">
                  {s.created_at ? new Date(s.created_at).toLocaleString() : ''}
                </span>
              </div>
              <p className="text-[12px] leading-relaxed text-[hsl(var(--theme-text-secondary))] whitespace-pre-wrap line-clamp-6">
                {s.summary || s.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Mood tab ─────────────────────────────────────────────────────────────────
function MoodTab() {
  const { trackMood, currentMoodAnalysis } = useAIAgents() as any;
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<any>(currentMoodAnalysis || null);

  useEffect(() => { setData(currentMoodAnalysis || null); }, [currentMoodAnalysis]);

  const refresh = async () => {
    setBusy(true);
    try {
      const r = await trackMood(24);
      setData(r);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-4 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-[hsl(var(--theme-text-primary))]">Your mood (24h)</h4>
        <button
          onClick={refresh}
          disabled={busy}
          className="text-[11px] font-medium px-2 py-1 rounded-md bg-pink-500/15 text-pink-400 hover:bg-pink-500/25 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Refresh'}
        </button>
      </div>

      {!data && !busy && (
        <EmptyState
          icon={<Smile className="w-7 h-7 opacity-40" />}
          title="No mood data yet"
          subtitle="Click Refresh to analyze."
        />
      )}

      {data && (
        <div className="space-y-3">
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
            <p className="text-[11px] text-[hsl(var(--theme-text-muted))] mb-1">Overall</p>
            <p className="text-base font-semibold capitalize text-[hsl(var(--theme-text-primary))]">
              {data.overall_mood || data.mood || '—'}
            </p>
            <p className="text-[10px] text-[hsl(var(--theme-text-muted))] mt-1">
              {Math.round((data.confidence || 0) * 100)}% confidence • {data.message_count ?? 0} messages
            </p>
          </div>

          {data.sentiment_distribution && (
            <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
              <p className="text-[11px] text-[hsl(var(--theme-text-muted))] mb-2">Sentiment split</p>
              <SentimentBar dist={data.sentiment_distribution} />
            </div>
          )}

          {Array.isArray(data.dominant_emotions) && data.dominant_emotions.length > 0 && (
            <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
              <p className="text-[11px] text-[hsl(var(--theme-text-muted))] mb-2">Top emotions</p>
              <div className="flex flex-wrap gap-1.5">
                {data.dominant_emotions.slice(0, 6).map((e: string, i: number) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-pink-500/15 text-pink-400">
                    {e}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SentimentBar({ dist }: { dist: { positive?: number; negative?: number; neutral?: number } }) {
  const pos = dist.positive ?? 0;
  const neg = dist.negative ?? 0;
  const neu = dist.neutral ?? 0;
  const total = Math.max(1, pos + neg + neu);
  const p = (n: number) => (n / total) * 100;

  return (
    <div className="space-y-1.5">
      <div className="flex w-full h-2 rounded-full overflow-hidden bg-white/5">
        <div className="bg-emerald-400" style={{ width: `${p(pos)}%` }} />
        <div className="bg-slate-400" style={{ width: `${p(neu)}%` }} />
        <div className="bg-rose-400" style={{ width: `${p(neg)}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-[hsl(var(--theme-text-muted))]">
        <span>+{pos}</span><span>={neu}</span><span>−{neg}</span>
      </div>
    </div>
  );
}

// ─── Focus tab ────────────────────────────────────────────────────────────────
function FocusTab({ channelId }: { channelId: number }) {
  const { analyzeFocus } = useAIAgents() as any;
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<any>(null);

  const refresh = async () => {
    setBusy(true);
    try {
      const r = await analyzeFocus(24, channelId);
      setData(r);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-4 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-[hsl(var(--theme-text-primary))]">Channel focus (24h)</h4>
        <button
          onClick={refresh}
          disabled={busy}
          className="text-[11px] font-medium px-2 py-1 rounded-md bg-orange-500/15 text-orange-400 hover:bg-orange-500/25 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Analyze'}
        </button>
      </div>

      {!data && !busy && (
        <EmptyState
          icon={<Target className="w-7 h-7 opacity-40" />}
          title="No focus data yet"
          subtitle="Click Analyze."
        />
      )}

      {data && (
        <div className="space-y-2.5">
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
            <p className="text-[11px] text-[hsl(var(--theme-text-muted))] mb-1">Focus score</p>
            <p className="text-2xl font-bold text-orange-400">
              {typeof data.focus_score === 'number' ? `${Math.round(data.focus_score * 100)}%` : '—'}
            </p>
          </div>
          {Array.isArray(data.dominant_topics) && data.dominant_topics.length > 0 && (
            <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
              <p className="text-[11px] text-[hsl(var(--theme-text-muted))] mb-2">Dominant topics</p>
              <div className="flex flex-wrap gap-1.5">
                {data.dominant_topics.slice(0, 8).map((t: string, i: number) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Translations tab ─────────────────────────────────────────────────────────
function TranslationsTab({ items }: { items: TranslationHistoryItem[] }) {
  if (!items.length) {
    return (
      <div className="px-4 py-6">
        <EmptyState
          icon={<Languages className="w-7 h-7 opacity-40" />}
          title="No translations yet"
          subtitle="Use the Translate context menu on a message."
        />
      </div>
    );
  }
  return (
    <div className="px-4 py-3 space-y-2.5">
      {items.map((t, i) => (
        <div key={i} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] uppercase tracking-wider text-cyan-400 font-bold">
              → {t.target_language}
            </span>
            <span className="text-[10px] text-[hsl(var(--theme-text-muted))]">
              {new Date(t.at).toLocaleTimeString()}
            </span>
          </div>
          <p className="text-[11px] text-[hsl(var(--theme-text-muted))] line-clamp-2 mb-1">
            {t.original}
          </p>
          <div className="flex items-center gap-1.5">
            <ChevronRight className="w-3 h-3 text-cyan-400" />
            <p className="text-[12px] leading-relaxed text-[hsl(var(--theme-text-primary))] whitespace-pre-wrap">
              {t.translated}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Empty state shared component ─────────────────────────────────────────────
function EmptyState({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center text-[hsl(var(--theme-text-muted))]">
      <div className="mb-2">{icon}</div>
      <p className="text-sm">{title}</p>
      {subtitle && <p className="text-[11px] mt-1 opacity-70">{subtitle}</p>}
    </div>
  );
}
