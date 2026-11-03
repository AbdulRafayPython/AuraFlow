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
  channel_silent: { label: 'When a channel goes quiet', hint: 'Posts a message to get the conversation going again. At most once every 30 minutes per channel.' },
  focus_drift: { label: 'When the topic changes', hint: 'Speaks up when a conversation moves to a new subject. At most once every 30 minutes per channel.' },
  mood_escalation: { label: 'When my mood dips', hint: 'Checks in with you by DM when your messages suggest a hard time. Needs Mood Tracker on; at most once every 6 hours. Only you see it.' },
};

/** How long a channel must be quiet. The server reports quiet spells of 15 minutes, 1 hour and 4 hours. */
export const SILENCE_CHOICES: Array<{ minutes: number; label: string }> = [
  { minutes: 15, label: '15 minutes' },
  { minutes: 60, label: '1 hour' },
  { minutes: 240, label: '4 hours' },
];

export function silenceLabel(minutes: number | undefined): string {
  return SILENCE_CHOICES.find((c) => c.minutes === minutes)?.label ?? (minutes ? `${minutes} minutes` : '15 minutes');
}

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
  get_my_mood: 'Check how you have been feeling',
  summarize_dm: 'Summarize your DMs with a friend',
  get_member_info: 'Look up a member',
  post_message: 'Post a message',
  create_poll: 'Create a poll',
  schedule_reminder: 'Set a reminder',
  detect_language: 'Detect a language',
  suggest_quick_replies: 'Suggest quick replies',
  get_focus_score: 'Check how focused a channel is',
  get_engagement_ideas: 'Find ideas to liven up a channel',
  check_message_safety: 'Check text against safety rules',
  extract_knowledge: 'Save FAQs from a channel',
  search_community_knowledge: 'Search community knowledge',
  get_community_info: 'Know about the community',
};

/** One short, plain line per skill (the server's descriptions are written for the model). */
export const TOOL_PLAIN: Record<string, string> = {
  get_channel_history: 'Reads the latest messages in a channel.',
  search_messages: 'Finds older messages by their words.',
  summarize_channel: 'Sums up a busy channel with key points.',
  translate_text: 'Translates a message into another language.',
  search_knowledge: 'Answers from the notes and files you give it.',
  get_my_mood: 'Sees how you have been feeling lately.',
  summarize_dm: 'Sums up your DMs with a friend.',
  get_member_info: "Looks up a member's public profile.",
  post_message: 'Posts a new message in a channel.',
  create_poll: 'Starts a poll people can vote on.',
  schedule_reminder: 'Reminds someone later.',
  detect_language: 'Tells which language a message is in.',
  suggest_quick_replies: 'Suggests short replies to a message.',
  get_focus_score: 'Checks if a chat is staying on topic.',
  get_engagement_ideas: 'Finds ideas to liven up a quiet channel.',
  check_message_safety: 'Checks a message against the safety rules.',
  extract_knowledge: "Saves a channel's FAQs to the knowledge base.",
  search_community_knowledge: "Answers from the community's saved FAQs.",
  get_community_info: "Knows the community's name, topic and channels.",
};

export type ToolGroupKey = 'answer' | 'chat' | 'act' | 'private' | 'other';

/** Skills shown in groups, so people pick from four short lists instead of one long one. */
export const TOOL_GROUPS: Array<{ key: ToolGroupKey; label: string; hint: string }> = [
  { key: 'answer', label: 'Answer questions', hint: 'Find and read what it needs to give a good answer.' },
  { key: 'chat', label: 'Help in conversations', hint: 'Summaries, translations and keeping chats lively.' },
  { key: 'act', label: 'Take action', hint: 'Changes things in your community. It always asks you first.' },
  { key: 'private', label: 'Private help', hint: 'Only works when it talks to you by DM.' },
  { key: 'other', label: 'More', hint: 'Other skills.' },
];

const GROUP_OF: Record<string, ToolGroupKey> = {
  search_knowledge: 'answer', search_community_knowledge: 'answer', get_community_info: 'answer',
  get_member_info: 'answer', search_messages: 'answer', get_channel_history: 'answer',
  summarize_channel: 'chat', translate_text: 'chat', detect_language: 'chat', suggest_quick_replies: 'chat',
  get_focus_score: 'chat', get_engagement_ideas: 'chat', check_message_safety: 'chat',
  post_message: 'act', create_poll: 'act', schedule_reminder: 'act', extract_knowledge: 'act',
  get_my_mood: 'private', summarize_dm: 'private',
};

/** Which group a skill sits in; unknown ones go by what they do. */
export function toolGroup(t: { name: string; risk?: string; private_only?: boolean }): ToolGroupKey {
  if (GROUP_OF[t.name]) return GROUP_OF[t.name];
  if (t.private_only) return 'private';
  if (t.risk === 'write') return 'act';
  return 'other';
}

export function toolPlain(t: { name: string; description?: string }): string {
  return TOOL_PLAIN[t.name] ?? (t.description ? `${t.description.split('.')[0]}.` : '');
}

/** Ready sentences people can add to "How it behaves" with one click. */
export const INSTRUCTION_SNIPPETS: Array<{ label: string; text: string }> = [
  { label: 'Friendly and short', text: 'Be friendly and keep answers short: a few sentences at most.' },
  { label: "Say when it doesn't know", text: "If you are not sure, say you don't know instead of guessing." },
  { label: "Reply in the person's language", text: 'Reply in the same language the person wrote in.' },
  { label: 'Stay on topic', text: 'Only help with questions about this community. Politely decline anything else.' },
];

/** Add a snippet on its own line, unless it is already there. */
export function addSnippet(instructions: string, snippet: string): string {
  if (instructions.includes(snippet)) return instructions;
  const base = instructions.trimEnd();
  return base ? `${base}\n${snippet}` : snippet;
}

export type SetupStepKey = 'instructions' | 'triggers' | 'knowledge' | 'live';

/** The few things that make an agent useful, worked out from the agent itself. */
export function setupSteps(agent: Pick<BuilderAgent, 'instructions' | 'triggers' | 'knowledge' | 'status'>):
  Array<{ key: SetupStepKey; label: string; done: boolean; optional?: boolean }> {
  return [
    { key: 'instructions', label: 'Tell it what to do', done: (agent.instructions ?? '').trim().length >= 20 },
    { key: 'triggers', label: 'Choose when it replies', done: (agent.triggers ?? []).some((t) => t.enabled !== false) },
    { key: 'knowledge', label: 'Give it something to know', done: (agent.knowledge ?? []).length > 0, optional: true },
    { key: 'live', label: 'Turn it on', done: agent.status === 'active' },
  ];
}

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

/** Who gets a private (DM) answer for this kind of trigger. */
export function privateRecipient(type: TriggerType): string {
  if (type === 'member_joined') return 'the new member';
  if (type === 'schedule' || type === 'channel_silent' || type === 'focus_drift' || type === 'mood_escalation') return 'you';
  return 'the person who wrote';
}

/** One-line summary of a trigger for lists, e.g. "On a schedule: Every Friday at 17:00 (UTC) in #general". */
export function describeTrigger(t: Pick<AgentTrigger, 'type' | 'channel_id' | 'config'>,
                                channelName?: (id: number) => string | undefined): string {
  const base = TRIGGER_LABELS[t.type].label;
  const where = t.channel_id != null ? ` in #${channelName?.(t.channel_id) ?? t.channel_id}` : '';
  const c: TriggerConfig = t.config ?? {};
  const dm = c.delivery === 'private' ? ` · answers ${privateRecipient(t.type)} by DM` : '';
  if (t.type === 'keyword') return `${base}: ${(c.keywords ?? []).join(', ') || 'no words yet'}${where}${dm}`;
  if (t.type === 'schedule') return `${base}: ${cronLabel(c.cron)} (${c.tz || 'UTC'})${where}${dm}`;
  if (t.type === 'channel_silent') return `${base} for ${silenceLabel(c.min_minutes)}${where}${dm}`;
  return `${base}${where}${dm}`;
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
