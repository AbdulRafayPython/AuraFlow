// Pure helpers for the Agent Builder UI and @mention autocomplete (no React, easy to test).
import type {
  AgentFormValues, AgentStatus, AgentTrigger, BuilderAgent, MentionableAgent, TriggerConfig, TriggerType,
} from '@/types/agentBuilder';

// ── @mention autocomplete ───────────────────────────────────────────────

export interface MentionMatch {
  /** Index of the "@". */
  start: number;
  /** Caret position (end of the typed query). */
  end: number;
  query: string;
}

/** The "@query" being typed right before the caret, or null. An email's "@" does not count. */
export function detectMention(text: string, caret: number): MentionMatch | null {
  const upto = text.slice(0, Math.max(0, Math.min(caret, text.length)));
  const m = /(^|\s)@([A-Za-z0-9_]{0,64})$/.exec(upto);
  if (!m) return null;
  return { start: upto.length - m[2].length - 1, end: upto.length, query: m[2] };
}

/** Agents matching the typed query: prefix of the username or name first, then substring. */
export function filterMentionable(agents: MentionableAgent[], query: string, limit = 6): MentionableAgent[] {
  const q = query.toLowerCase();
  if (!q) return agents.slice(0, limit);
  const rank = (a: MentionableAgent): number => {
    const u = a.username.toLowerCase();
    const n = a.name.toLowerCase();
    if (u.startsWith(q)) return 0;
    if (n.startsWith(q)) return 1;
    if (u.includes(q) || n.includes(q)) return 2;
    return 3;
  };
  return agents.filter((a) => rank(a) < 3).sort((a, b) => rank(a) - rank(b)).slice(0, limit);
}

/** Replace the typed "@query" with "@username " and return the new text and caret. */
export function applyMention(text: string, match: MentionMatch, username: string): { text: string; caret: number } {
  const before = text.slice(0, match.start);
  const after = text.slice(match.end);
  const insert = `@${username}`;
  const spacer = after.startsWith(' ') ? '' : ' ';
  return { text: `${before}${insert}${spacer}${after}`, caret: before.length + insert.length + 1 };
}

// ── labels ──────────────────────────────────────────────────────────────

export const TRIGGER_LABELS: Record<TriggerType, { label: string; hint: string }> = {
  mention: { label: 'When mentioned', hint: 'Answers when someone writes @agent or replies to it.' },
  keyword: { label: 'On keywords', hint: 'Answers when a message contains one of your words.' },
  channel_message: { label: 'Every message in a channel', hint: 'Reads every message in one channel. Use sparingly: it costs a run each time.' },
  schedule: { label: 'On a schedule', hint: 'Posts into a channel at set times, e.g. every Friday 17:00.' },
  member_joined: { label: 'When someone joins', hint: 'Welcomes new members of the community.' },
};

export const STATUS_LABELS: Record<AgentStatus, string> = {
  draft: 'Not on yet', active: 'On', paused: 'Paused', archived: 'Archived',
};

export const STATUS_STYLES: Record<AgentStatus, string> = {
  draft: 'bg-warning/15 text-warning border-warning/30',
  active: 'bg-success/15 text-success border-success/30',
  paused: 'bg-muted text-muted-foreground border-border',
  archived: 'bg-destructive/15 text-destructive border-destructive/30',
};

export const TOOL_LABELS: Record<string, string> = {
  get_channel_history: 'Read channel history',
  search_messages: 'Search messages',
  summarize_channel: 'Summarize a channel',
  translate_text: 'Translate text',
  search_knowledge: 'Search its knowledge',
  get_member_info: 'Look up a member',
  post_message: 'Post a message',
  create_poll: 'Create a poll',
  schedule_reminder: 'Set a reminder',
};

export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name.replace(/_/g, ' ');
}

// ── schedules ───────────────────────────────────────────────────────────

export const CRON_PRESETS: Array<{ label: string; cron: string }> = [
  { label: 'Every weekday at 09:00', cron: '0 9 * * 1-5' },
  { label: 'Every weekday at 10:00', cron: '0 10 * * 1-5' },
  { label: 'Every day at 08:00', cron: '0 8 * * *' },
  { label: 'Every Monday at 09:00', cron: '0 9 * * 1' },
  { label: 'Every Friday at 17:00', cron: '0 17 * * 5' },
];

export const CUSTOM_CRON = '__custom__';

export function cronLabel(cron: string | undefined): string {
  if (!cron) return 'No schedule';
  return CRON_PRESETS.find((p) => p.cron === cron)?.label ?? `cron ${cron}`;
}

export const COMMON_TIME_ZONES = ['UTC', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Riyadh', 'Europe/London', 'America/New_York'];

/** One-line summary of a trigger for lists, e.g. "On a schedule: Every Friday at 17:00 (UTC) in #general". */
export function describeTrigger(t: Pick<AgentTrigger, 'type' | 'channel_id' | 'config'>,
                                channelName?: (id: number) => string | undefined): string {
  const base = TRIGGER_LABELS[t.type].label;
  const where = t.channel_id != null ? ` in #${channelName?.(t.channel_id) ?? t.channel_id}` : '';
  const c: TriggerConfig = t.config ?? {};
  if (t.type === 'keyword') return `${base}: ${(c.keywords ?? []).join(', ') || 'no words yet'}${where}`;
  if (t.type === 'schedule') return `${base}: ${cronLabel(c.cron)} (${c.tz || 'UTC'})${where}`;
  return `${base}${where}`;
}

/** What is still missing before a trigger can be saved. */
export function triggerProblems(t: Pick<AgentTrigger, 'type' | 'channel_id' | 'config'>): string[] {
  const out: string[] = [];
  if (t.type === 'keyword' && !(t.config?.keywords?.length)) out.push('Add at least one keyword.');
  if (t.type === 'schedule') {
    if (t.channel_id == null) out.push('Pick the channel to post in.');
    if (!t.config?.cron) out.push('Pick when it should run.');
  }
  if (t.type === 'channel_message' && t.channel_id == null) out.push('Pick the channel to watch.');
  return out;
}

export function splitKeywords(raw: string): string[] {
  return Array.from(new Set(raw.split(/[,\n]/).map((k) => k.trim()).filter(Boolean)));
}

export function formatTokens(tokens: { in: number; out: number } | undefined): string {
  if (!tokens) return '';
  const total = tokens.in + tokens.out;
  return total >= 1000 ? `${(total / 1000).toFixed(1)}k tokens` : `${total} tokens`;
}

// ── builder form ────────────────────────────────────────────────────────

export function formFromAgent(agent: BuilderAgent): AgentFormValues {
  return {
    name: agent.name,
    description: agent.description ?? '',
    instructions: agent.instructions ?? '',
    tools: agent.tools ?? [],
    model_tier: agent.model_tier ?? 'fast',
    daily_run_cap: agent.daily_run_cap ?? 200,
    channel_ids: agent.permissions?.channel_ids ?? [],
  };
}

export function isDirty(a: AgentFormValues, b: AgentFormValues): boolean {
  return JSON.stringify({ ...a, tools: [...a.tools].sort(), channel_ids: [...a.channel_ids].sort() })
    !== JSON.stringify({ ...b, tools: [...b.tools].sort(), channel_ids: [...b.channel_ids].sort() });
}

// ── approvals ───────────────────────────────────────────────────────────

/** "Expires in 3 h", "Expires in 12 min" or "Expired" for an approval's deadline. */
export function describeExpiry(iso: string, now: number = Date.now()): string {
  const left = new Date(iso).getTime() - now;
  if (Number.isNaN(left)) return '';
  if (left <= 0) return 'Expired';
  const minutes = Math.ceil(left / 60_000);
  if (minutes < 60) return `Expires in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `Expires in ${hours} h` : `Expires in ${Math.round(hours / 24)} days`;
}

/** The first line of the toast shown when an agent asks for approval. */
export function approvalAlertTitle(agentName: string): string {
  return `${agentName || 'An agent'} wants your approval`;
}

/** "in 5 min", "in 3 h", "in 2 days", or "due now" for a reminder's time. */
export function describeDue(iso: string, now: number = Date.now()): string {
  const left = new Date(iso).getTime() - now;
  if (Number.isNaN(left)) return '';
  if (left <= 60_000) return 'due now';
  const minutes = Math.round(left / 60_000);
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `in ${hours} h` : `in ${Math.round(hours / 24)} days`;
}
