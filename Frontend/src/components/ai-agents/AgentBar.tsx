// Frontend/src/components/ai-agents/AgentBar.tsx
//
// F2 — Channel Assist strip (the slim version).
//
// Per docs/AUTONOMOUS_AGENT_FRONTEND_REDESIGN.md §8.3 + §16/F2, this bar is
// _not_ where autonomy lives — it is where deliberate user assistance begins.
// Four high-intent actions:
//
//   • Ask              → opens an inline assistant popover (assistant agent)
//   • Translate        → opens an inline translator popover (translator agent)
//   • Catch me up      → generateSummary on this channel (summarizer)
//   • Search knowledge → opens the rail's Knowledge tab (support / KB)
//
// Autonomous interventions (support_suggestion, summary_checkpoint,
// focus.drift, moderation, per-viewer translation) live INLINE in the
// message list and on the Channel Intelligence rail — not here.
//
// The bar gracefully degrades: each button is enabled only if its underlying
// agent is installed (community-scoped) or active (personal). If none are
// reachable for the current channel, the bar hides itself.

import { useEffect, useMemo, useState } from 'react';
import {
  Sparkles,
  Languages,
  FileText,
  BookOpen,
  Loader2,
  Send,
  Zap,
  MessageSquare,
  BarChart3,
  Snowflake,
  PartyPopper,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAIAgents } from '@/contexts/AIAgentContext';
import { useRealtime } from '@/hooks/useRealtime';
import { useToast } from '@/hooks/use-toast';
import { accentFor } from './AgentAccent';
import { aiAgentService } from '@/services/aiAgentService';
import type { Message } from '@/types';

export interface AgentBarProps {
  channelId?: number | null;
  channelName?: string | null;
  communityId?: number | null;
  /** Open the Channel Intelligence rail at a given tab. */
  onOpenPanel?: (tab: 'activity' | 'recap' | 'knowledge' | 'focus' | 'translations' | 'safety') => void;
  /** Toggle to refresh anything the rail caches. */
  onResultUpdated?: () => void;
}

type ActionKey = 'ask' | 'translate' | 'catchup' | 'knowledge' | 'spark';

interface ActionDef {
  key: ActionKey;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  /** Agent name used by AgentAccent for the icon tint. */
  agent: string;
  /** DB agent_type(s) that must be installed/active for this action. */
  requires: { scope: 'community' | 'personal'; types: string[] }[];
}

const ACTIONS: ActionDef[] = [
  {
    key: 'ask',
    label: 'Ask',
    Icon: Sparkles,
    agent: 'assistant',
    requires: [{ scope: 'personal', types: ['assistant'] }],
  },
  {
    key: 'translate',
    label: 'Translate',
    Icon: Languages,
    agent: 'translator',
    requires: [{ scope: 'personal', types: ['translator'] }],
  },
  {
    key: 'catchup',
    label: 'Catch me up',
    Icon: FileText,
    agent: 'summarizer',
    requires: [{ scope: 'community', types: ['summarizer'] }],
  },
  {
    key: 'knowledge',
    label: 'Search knowledge',
    Icon: BookOpen,
    agent: 'support',
    // Either support or knowledge_builder being installed on the community
    // is enough to query the KB.
    requires: [{ scope: 'community', types: ['support', 'knowledge', 'knowledge_builder'] }],
  },
  {
    key: 'spark',
    label: 'Spark',
    Icon: Zap,
    agent: 'engagement',
    requires: [{ scope: 'community', types: ['engagement'] }],
  },
];

export default function AgentBar({
  channelId,
  channelName: _channelName,
  communityId,
  onOpenPanel,
  onResultUpdated,
}: AgentBarProps) {
  const {
    getCommunityAgentStatus,
    getPersonalAgentStatus,
    generateSummary,
    askAssistant,
    translateText,
  } = useAIAgents() as any;
  const { addLocalMessage } = useRealtime();
  const { toast } = useToast();

  const [communityActive, setCommunityActive] = useState<Set<string>>(new Set());
  const [personalActive, setPersonalActive] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<ActionKey | null>(null);

  // ── Load installed/active state ───────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (communityId) {
          const installed = await getCommunityAgentStatus(communityId);
          if (cancelled) return;
          setCommunityActive(
            new Set(
              (installed || [])
                .filter((a: any) => a.enabled !== false)
                .map((a: any) => a.agent_type),
            ),
          );
        } else {
          setCommunityActive(new Set());
        }
      } catch {
        /* ignore */
      }

      try {
        const personal = await getPersonalAgentStatus();
        if (cancelled) return;
        setPersonalActive(
          new Set(
            (personal || [])
              .filter((a: any) => a.enabled !== false)
              .map((a: any) => a.agent_type),
          ),
        );
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [communityId, getCommunityAgentStatus, getPersonalAgentStatus]);

  const isActionReady = (def: ActionDef): boolean => {
    return def.requires.every((req) => {
      if (req.scope === 'community') {
        if (!communityId) return false;
        return req.types.some((t) => communityActive.has(t));
      }
      return req.types.some((t) => personalActive.has(t));
    });
  };

  const visible = useMemo(
    () => ACTIONS.filter(isActionReady),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [communityActive, personalActive, communityId],
  );

  // ── Direct actions ────────────────────────────────────────────────────
  const runCatchUp = async () => {
    if (!channelId) return;
    try {
      setBusy('catchup');
      const r = await generateSummary(channelId, 100);
      if (r?.success) {
        toast({ title: 'Caught you up', description: 'See the Recap tab.' });
        onOpenPanel?.('recap');
        onResultUpdated?.();
      } else {
        toast({
          title: 'Could not catch up',
          description: r?.error || 'Try again in a moment.',
          variant: 'destructive',
        });
      }
    } catch (e: any) {
      toast({
        title: 'Could not catch up',
        description: e?.message || '',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const openKnowledge = () => {
    onOpenPanel?.('knowledge');
  };

  if (visible.length === 0) {
    return null;
  }

  return (
    <div
      className={
        'flex items-center gap-1 overflow-x-auto rounded-md ' +
        'border border-[hsl(var(--theme-border-default))] ' +
        'bg-[hsl(var(--theme-bg-secondary))] px-2 py-1.5'
      }
      role="toolbar"
      aria-label="Channel AI assist"
    >
      <span className="shrink-0 px-1 text-[11px] font-medium uppercase tracking-wide text-[hsl(var(--theme-text-muted))]">
        Assist
      </span>
      <span
        aria-hidden
        className="mx-1 h-4 w-px shrink-0 bg-[hsl(var(--theme-border-default))]"
      />

      {visible.map((def) => {
        const isBusy = busy === def.key;
        const Icon = def.Icon;
        const accent = accentFor(def.agent);

        if (def.key === 'ask') {
          return (
            <AskPopover
              key={def.key}
              accent={accent}
              icon={<Icon className="h-4 w-4" />}
              label={def.label}
              onAsk={(q) => askAssistant(q, { channelId, communityId })}
            />
          );
        }
        if (def.key === 'translate') {
          return (
            <TranslatePopover
              key={def.key}
              accent={accent}
              icon={<Icon className="h-4 w-4" />}
              label={def.label}
              onTranslate={(text, target) => translateText(text, target)}
            />
          );
        }
        if (def.key === 'catchup') {
          return (
            <AssistButton
              key={def.key}
              accent={accent}
              icon={isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
              label={def.label}
              onClick={runCatchUp}
              disabled={!channelId || isBusy}
            />
          );
        }
        if (def.key === 'spark') {
          return (
            <SparkPopover
              key={def.key}
              accent={accent}
              icon={<Icon className="h-4 w-4" />}
              label={def.label}
              disabled={!channelId}
              onSend={async (kind) => {
                if (!channelId) return;
                const r = await aiAgentService.sendEngagementContent(channelId, kind);
                if (r?.success) {
                  // Render each posted card immediately rather than waiting on
                  // the socket echo (which can be missed when emitted from the
                  // HTTP request thread). addLocalMessage dedups the echo if it
                  // does arrive. A 'pack' posts several items (starter + poll +
                  // icebreaker), each its own interactive card.
                  const items = Array.isArray(r.items) ? r.items : [];
                  for (const it of items) {
                    if (!it?.message_id) continue;
                    addLocalMessage({
                      id: Number(it.message_id),
                      channel_id: Number(it.channel_id ?? channelId),
                      sender_id: 0,
                      content: it.content || '',
                      message_type: 'ai',
                      created_at: it.created_at || new Date().toISOString(),
                      author: it.author || 'Engagement Agent',
                      card: it.card || undefined,
                    } as Message);
                  }
                  toast({ title: 'Posted to the channel ✨', description: 'The engagement agent just shared something.' });
                  onResultUpdated?.();
                } else {
                  toast({ title: 'Could not post', description: r?.error || 'Try again.', variant: 'destructive' });
                }
              }}
            />
          );
        }
        // knowledge
        return (
          <AssistButton
            key={def.key}
            accent={accent}
            icon={<Icon className="h-4 w-4" />}
            label={def.label}
            onClick={openKnowledge}
          />
        );
      })}
    </div>
  );
}

/* ─── Subcomponents ───────────────────────────────────────────────── */

interface AssistButtonProps {
  accent: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

function AssistButton({ accent, icon, label, onClick, disabled }: AssistButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={
        'group inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 ' +
        'text-[12px] font-medium text-[hsl(var(--theme-text-secondary))] ' +
        'transition-colors [transition-duration:140ms] ' +
        'hover:bg-[hsl(var(--theme-bg-hover))] hover:text-[hsl(var(--theme-text-primary))] ' +
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent'
      }
    >
      <span style={{ color: accent }} className="inline-flex shrink-0 items-center">
        {icon}
      </span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function AssistTrigger({
  accent,
  icon,
  label,
}: {
  accent: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      title={label}
      className={
        'inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 ' +
        'text-[12px] font-medium text-[hsl(var(--theme-text-secondary))] ' +
        'transition-colors [transition-duration:140ms] ' +
        'hover:bg-[hsl(var(--theme-bg-hover))] hover:text-[hsl(var(--theme-text-primary))]'
      }
    >
      <span style={{ color: accent }} className="inline-flex shrink-0 items-center">
        {icon}
      </span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function AskPopover({
  accent,
  icon,
  label,
  onAsk,
}: {
  accent: string;
  icon: React.ReactNode;
  label: string;
  onAsk: (q: string) => Promise<any>;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [a, setA] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const question = q.trim();
    if (!question) return;
    setLoading(true);
    setA(null);
    try {
      const r = await onAsk(question);
      setA(r?.reply || 'No reply.');
    } catch (e: any) {
      setA(`Error: ${e?.message || 'failed'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span>
          <AssistTrigger accent={accent} icon={icon} label={label} />
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 border border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-elevated))] p-3 shadow-none"
      >
        <div className="space-y-3">
          <h4 className="flex items-center gap-1.5 text-[13px] font-semibold text-[hsl(var(--theme-text-primary))]">
            <Sparkles className="h-3.5 w-3.5" style={{ color: accent }} aria-hidden />
            Ask the assistant
          </h4>
          <div className="flex gap-2">
            <Input
              autoFocus
              placeholder="What do you want to know?"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              className="h-8 text-[12px]"
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={submit}
              disabled={loading || !q.trim()}
              className="h-8 px-2"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </Button>
          </div>
          {a && (
            <div className="rounded border border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-secondary))] p-2.5 text-[12px] leading-5 text-[hsl(var(--theme-text-secondary))] whitespace-pre-wrap">
              {a}
            </div>
          )}
          <p className="text-[10px] text-[hsl(var(--theme-text-muted))]">
            Replies stay private to you until you choose to share.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SparkPopover({
  accent,
  icon,
  label,
  disabled,
  onSend,
}: {
  accent: string;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  onSend: (kind: 'starter' | 'poll' | 'icebreaker' | 'pack') => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const OPTIONS: {
    kind: 'starter' | 'poll' | 'icebreaker' | 'pack';
    label: string;
    desc: string;
    Icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { kind: 'starter', label: 'Conversation starter', desc: 'A friendly question to get people talking', Icon: MessageSquare },
    { kind: 'poll', label: 'Quick poll', desc: 'A tap-to-vote poll with a few options', Icon: BarChart3 },
    { kind: 'icebreaker', label: 'Ice-breaker', desc: 'A short game or activity', Icon: Snowflake },
    { kind: 'pack', label: 'Full starter pack', desc: 'Starter + poll + ice-breaker', Icon: PartyPopper },
  ];

  const run = async (kind: 'starter' | 'poll' | 'icebreaker' | 'pack') => {
    setBusy(kind);
    try {
      await onSend(kind);
      setOpen(false);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <span>
          <AssistTrigger accent={accent} icon={icon} label={label} />
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 border border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-elevated))] p-2 shadow-none"
      >
        <h4 className="flex items-center gap-1.5 px-1.5 py-1 text-[13px] font-semibold text-[hsl(var(--theme-text-primary))]">
          <Zap className="h-3.5 w-3.5" style={{ color: accent }} aria-hidden />
          Spark a conversation
        </h4>
        <p className="px-1.5 pb-1.5 text-[10px] text-[hsl(var(--theme-text-muted))]">
          Posts into this channel for everyone to see.
        </p>
        <div className="space-y-1">
          {OPTIONS.map((opt) => {
            const isBusy = busy === opt.kind;
            const OptIcon = opt.Icon;
            return (
              <button
                key={opt.kind}
                type="button"
                disabled={!!busy}
                onClick={() => run(opt.kind)}
                className={
                  'flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left ' +
                  'transition-colors [transition-duration:140ms] ' +
                  'hover:bg-[hsl(var(--theme-bg-hover))] disabled:opacity-50 disabled:cursor-not-allowed'
                }
              >
                <span style={{ color: accent }} className="mt-0.5 inline-flex shrink-0 items-center">
                  {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <OptIcon className="h-4 w-4" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[12px] font-medium text-[hsl(var(--theme-text-primary))]">{opt.label}</span>
                  <span className="block text-[11px] leading-4 text-[hsl(var(--theme-text-muted))]">{opt.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TranslatePopover({
  accent,
  icon,
  label,
  onTranslate,
}: {
  accent: string;
  icon: React.ReactNode;
  label: string;
  onTranslate: (text: string, target: string) => Promise<any>;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [target, setTarget] = useState('en');
  const [out, setOut] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    setLoading(true);
    setOut(null);
    try {
      const r = await onTranslate(t, target);
      setOut(r?.translated_text || '(no result)');
    } catch (e: any) {
      setOut(`Error: ${e?.message || 'failed'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span>
          <AssistTrigger accent={accent} icon={icon} label={label} />
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 border border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-elevated))] p-3 shadow-none"
      >
        <div className="space-y-3">
          <h4 className="flex items-center gap-1.5 text-[13px] font-semibold text-[hsl(var(--theme-text-primary))]">
            <Languages className="h-3.5 w-3.5" style={{ color: accent }} aria-hidden />
            Translate text
          </h4>
          <textarea
            placeholder="Paste or type text to translate…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            className={
              'w-full resize-none rounded border border-[hsl(var(--theme-border-default))] ' +
              'bg-[hsl(var(--theme-bg-secondary))] p-2 text-[12px] leading-5 ' +
              'text-[hsl(var(--theme-text-primary))] focus:outline-none focus:ring-1 ' +
              'focus:ring-[hsl(var(--theme-border-focus))]'
            }
          />
          <div className="flex gap-2">
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className={
                'flex-1 rounded border border-[hsl(var(--theme-border-default))] ' +
                'bg-[hsl(var(--theme-bg-secondary))] px-2 py-1.5 text-[12px] ' +
                'text-[hsl(var(--theme-text-primary))]'
              }
            >
              <option value="en">English</option>
              <option value="ur">Urdu</option>
              <option value="hi">Hindi</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="ar">Arabic</option>
              <option value="zh-CN">Chinese</option>
              <option value="ja">Japanese</option>
              <option value="ru">Russian</option>
              <option value="tr">Turkish</option>
              <option value="pt">Portuguese</option>
              <option value="bn">Bengali</option>
            </select>
            <Button
              size="sm"
              variant="secondary"
              onClick={submit}
              disabled={loading || !text.trim()}
              className="h-8 px-3"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Translate'}
            </Button>
          </div>
          {out && (
            <div className="rounded border border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-secondary))] p-2.5 text-[12px] leading-5 text-[hsl(var(--theme-text-secondary))] whitespace-pre-wrap">
              {out}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
