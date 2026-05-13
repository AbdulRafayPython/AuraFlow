import { useEffect, useMemo, useState } from 'react';
import {
  Sparkles,
  FileText,
  Smile,
  Languages,
  GraduationCap,
  Trophy,
  Heart,
  BookOpen,
  Target,
  ShieldCheck,
  MessageSquare,
  Loader2,
  Send,
  X,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAIAgents } from '@/contexts/AIAgentContext';
import { useToast } from '@/hooks/use-toast';

export interface AgentBarProps {
  channelId?: number | null;
  channelName?: string | null;
  communityId?: number | null;
  /** Open the right-side AgentResultPanel with a given tab */
  onOpenPanel?: (tab: 'knowledge' | 'summary' | 'mood' | 'focus' | 'translations') => void;
  /** Toggle to refresh the result panel */
  onResultUpdated?: () => void;
}

type AgentKey =
  | 'summarizer'
  | 'assistant'
  | 'translator'
  | 'support'
  | 'mood'
  | 'engagement'
  | 'wellness'
  | 'knowledge'
  | 'focus'
  | 'moderation';

interface AgentDef {
  key: AgentKey;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  /** DB agent_type — used to look up install/active state */
  dbType: string;
  scope: 'community' | 'personal';
  tint: string;
}

const AGENTS: AgentDef[] = [
  { key: 'summarizer',  label: 'Summarize',   Icon: FileText,      dbType: 'summarizer',   scope: 'community', tint: 'text-blue-500' },
  { key: 'assistant',   label: 'Ask AI',      Icon: Sparkles,      dbType: 'assistant',    scope: 'personal',  tint: 'text-violet-500' },
  { key: 'translator',  label: 'Translate',   Icon: Languages,     dbType: 'translator',   scope: 'personal',  tint: 'text-cyan-500' },
  { key: 'support',     label: 'Support',     Icon: GraduationCap, dbType: 'support',      scope: 'community', tint: 'text-emerald-500' },
  { key: 'mood',        label: 'Mood',        Icon: Smile,         dbType: 'mood',         scope: 'personal',  tint: 'text-pink-500' },
  { key: 'engagement',  label: 'Engage',      Icon: Trophy,        dbType: 'engagement',   scope: 'community', tint: 'text-amber-500' },
  { key: 'wellness',    label: 'Wellness',    Icon: Heart,         dbType: 'wellness',     scope: 'personal',  tint: 'text-rose-500' },
  { key: 'knowledge',   label: 'Knowledge',   Icon: BookOpen,      dbType: 'knowledge',    scope: 'community', tint: 'text-indigo-500' },
  { key: 'focus',       label: 'Focus',       Icon: Target,        dbType: 'focus',        scope: 'community', tint: 'text-orange-500' },
  { key: 'moderation',  label: 'Moderation',  Icon: ShieldCheck,   dbType: 'moderation',   scope: 'community', tint: 'text-green-500' },
];

export default function AgentBar({
  channelId,
  channelName,
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
    askSupport,
    extractKnowledge,
    trackMood,
    checkWellness,
    analyzeFocus,
  } = useAIAgents() as any;
  const { toast } = useToast();

  const [communityActive, setCommunityActive] = useState<Set<string>>(new Set());
  const [personalActive, setPersonalActive] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<AgentKey | null>(null);

  // ── Load installed/active state ───────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (communityId) {
          const installed = await getCommunityAgentStatus(communityId);
          if (cancelled) return;
          setCommunityActive(
            new Set((installed || [])
              .filter((a: any) => a.enabled !== false)
              .map((a: any) => a.agent_type)),
          );
        } else {
          setCommunityActive(new Set());
        }
      } catch { /* ignore */ }

      try {
        const personal = await getPersonalAgentStatus();
        if (cancelled) return;
        setPersonalActive(
          new Set((personal || [])
            .filter((a: any) => a.enabled !== false)
            .map((a: any) => a.agent_type)),
        );
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [communityId, getCommunityAgentStatus, getPersonalAgentStatus]);

  const isAgentReady = (def: AgentDef): boolean => {
    if (def.scope === 'community') {
      if (!communityId) return false;
      return communityActive.has(def.dbType);
    }
    return personalActive.has(def.dbType);
  };

  // ── Visible agents ────────────────────────────────────────────────────
  const visible = useMemo(
    () => AGENTS.filter(isAgentReady),
    [communityActive, personalActive, communityId],
  );

  // ── Quick actions (no popover) ────────────────────────────────────────
  const runSummarize = async () => {
    if (!channelId) return;
    try {
      setBusy('summarizer');
      const r = await generateSummary(channelId, 100);
      if (r?.success) {
        toast({ title: 'Summary posted', description: 'Check the chat.' });
        onResultUpdated?.();
      } else {
        toast({ title: 'Summary failed', description: r?.error || 'Try again', variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Summary failed', description: e.message || '', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const runMood = async () => {
    try {
      setBusy('mood');
      await trackMood(24);
      toast({ title: 'Mood updated', description: 'See the Mood tab.' });
      onOpenPanel?.('mood');
    } catch (e: any) {
      toast({ title: 'Mood failed', description: e.message || '', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const runWellness = async () => {
    try {
      setBusy('wellness');
      await checkWellness();
      toast({ title: 'Wellness check done' });
    } catch (e: any) {
      toast({ title: 'Wellness failed', description: e.message || '', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const runFocus = async () => {
    if (!channelId) return;
    try {
      setBusy('focus');
      await analyzeFocus(24, channelId);
      toast({ title: 'Focus analyzed' });
      onOpenPanel?.('focus');
    } catch (e: any) {
      toast({ title: 'Focus failed', description: e.message || '', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const runExtract = async () => {
    try {
      setBusy('knowledge');
      await extractKnowledge(48);
      toast({ title: 'Knowledge extracted' });
      onOpenPanel?.('knowledge');
    } catch (e: any) {
      toast({ title: 'Extraction failed', description: e.message || '', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  if (visible.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-border/50 bg-muted/30 backdrop-blur-sm overflow-x-auto">
      <span className="text-[11px] font-medium text-muted-foreground px-1 shrink-0">
        AI Agents
      </span>
      <div className="h-4 w-px bg-border mx-1 shrink-0" />

      {visible.map((def) => {
        const Icon = def.Icon;
        const isBusy = busy === def.key;

        // Direct actions (no popover)
        if (def.key === 'summarizer') {
          return (
            <AgentButton
              key={def.key}
              label={def.label}
              tint={def.tint}
              busy={isBusy}
              icon={<Icon className="h-4 w-4" />}
              onClick={runSummarize}
              disabled={!channelId}
            />
          );
        }
        if (def.key === 'mood') {
          return (
            <AgentButton key={def.key} label={def.label} tint={def.tint}
              busy={isBusy} icon={<Icon className="h-4 w-4" />} onClick={runMood} />
          );
        }
        if (def.key === 'wellness') {
          return (
            <AgentButton key={def.key} label={def.label} tint={def.tint}
              busy={isBusy} icon={<Icon className="h-4 w-4" />} onClick={runWellness} />
          );
        }
        if (def.key === 'focus') {
          return (
            <AgentButton key={def.key} label={def.label} tint={def.tint}
              busy={isBusy} icon={<Icon className="h-4 w-4" />} onClick={runFocus}
              disabled={!channelId} />
          );
        }
        if (def.key === 'knowledge') {
          return (
            <AgentButton key={def.key} label={def.label} tint={def.tint}
              busy={isBusy} icon={<Icon className="h-4 w-4" />} onClick={runExtract} />
          );
        }
        if (def.key === 'moderation') {
          return (
            <AgentButton key={def.key} label={def.label} tint={def.tint} busy={false}
              icon={<Icon className="h-4 w-4" />}
              onClick={() => toast({ title: 'Moderation is active',
                description: 'Messages are scanned automatically.' })} />
          );
        }
        if (def.key === 'engagement') {
          return (
            <AgentButton key={def.key} label={def.label} tint={def.tint}
              busy={false} icon={<Icon className="h-4 w-4" />}
              onClick={() => toast({ title: 'Engagement',
                description: 'Use /icebreaker or /poll in chat.' })} />
          );
        }

        // Popover-driven actions
        if (def.key === 'assistant') {
          return (
            <AssistantPopover
              key={def.key}
              def={def}
              onAsk={(q) => askAssistant(q, { channelId, communityId })}
            />
          );
        }
        if (def.key === 'translator') {
          return (
            <TranslatorPopover
              key={def.key}
              def={def}
              onTranslate={(text, target) => translateText(text, target)}
            />
          );
        }
        if (def.key === 'support' && communityId) {
          return (
            <SupportPopover
              key={def.key}
              def={def}
              onAsk={(q) => askSupport(q, communityId, { channelId })}
            />
          );
        }
        return null;
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────── sub-components

function AgentButton({
  label, tint, busy, icon, onClick, disabled,
}: {
  label: string; tint: string; busy: boolean;
  icon: React.ReactNode; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      title={label}
      className={`group flex items-center gap-1.5 px-2.5 py-1.5 rounded-md
        text-xs font-medium transition-all
        hover:bg-background hover:shadow-sm
        disabled:opacity-50 disabled:cursor-not-allowed
        ${tint} shrink-0`}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      <span className="text-foreground hidden sm:inline">{label}</span>
    </button>
  );
}

function AssistantPopover({
  def, onAsk,
}: { def: AgentDef; onAsk: (q: string) => Promise<any> }) {
  const Icon = def.Icon;
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
      setA(`Error: ${e.message || 'failed'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium hover:bg-background hover:shadow-sm transition ${def.tint} shrink-0`}>
          <Icon className="h-4 w-4" />
          <span className="text-foreground hidden sm:inline">{def.label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-violet-500" /> AI Assistant
            </h4>
            <Badge variant="secondary" className="text-[10px]">Beta</Badge>
          </div>
          <div className="flex gap-2">
            <Input
              autoFocus
              placeholder="Ask anything…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
              className="text-sm"
            />
            <Button size="sm" onClick={submit} disabled={loading || !q.trim()}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </Button>
          </div>
          {a && (
            <div className="text-sm rounded-md border border-border/50 bg-muted/30 p-3 leading-relaxed whitespace-pre-wrap">
              {a}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground">
            Tip: type <code className="px-1 bg-muted rounded">/ask &lt;question&gt;</code> in chat.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TranslatorPopover({
  def, onTranslate,
}: { def: AgentDef; onTranslate: (text: string, target: string) => Promise<any> }) {
  const Icon = def.Icon;
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
      setOut(`Error: ${e.message || 'failed'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium hover:bg-background hover:shadow-sm transition ${def.tint} shrink-0`}>
          <Icon className="h-4 w-4" />
          <span className="text-foreground hidden sm:inline">{def.label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-1.5">
              <Languages className="h-4 w-4 text-cyan-500" /> Translator
            </h4>
          </div>
          <textarea
            placeholder="Text to translate…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            className="w-full text-sm rounded-md border border-border bg-background p-2 resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
          />
          <div className="flex gap-2">
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="flex-1 text-sm rounded-md border border-border bg-background px-2 py-1.5"
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
            <Button size="sm" onClick={submit} disabled={loading || !text.trim()}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Translate'}
            </Button>
          </div>
          {out && (
            <div className="text-sm rounded-md border border-border/50 bg-muted/30 p-3 leading-relaxed whitespace-pre-wrap">
              {out}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SupportPopover({
  def, onAsk,
}: { def: AgentDef; onAsk: (q: string) => Promise<any> }) {
  const Icon = def.Icon;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [r, setR] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const question = q.trim();
    if (!question) return;
    setLoading(true);
    setR(null);
    try {
      setR(await onAsk(question));
    } catch (e: any) {
      setR({ matched: false, answer: `Error: ${e.message || 'failed'}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium hover:bg-background hover:shadow-sm transition ${def.tint} shrink-0`}>
          <Icon className="h-4 w-4" />
          <span className="text-foreground hidden sm:inline">{def.label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-1.5">
              <GraduationCap className="h-4 w-4 text-emerald-500" /> Knowledge Q&amp;A
            </h4>
          </div>
          <div className="flex gap-2">
            <Input
              autoFocus
              placeholder="Ask the knowledge base…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
              className="text-sm"
            />
            <Button size="sm" onClick={submit} disabled={loading || !q.trim()}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </Button>
          </div>
          {r && (
            <div className="text-sm rounded-md border border-border/50 bg-muted/30 p-3 leading-relaxed whitespace-pre-wrap">
              {r.answer}
              {r.sources && r.sources.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border/50 flex flex-wrap gap-1">
                  {r.sources.map((s: any, i: number) => (
                    <Badge key={i} variant="outline" className="text-[10px]">
                      {s.title || `KB #${s.id}`}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground">
            Powered by your community's Knowledge Base.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
