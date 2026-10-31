// Which app logo an agent or directory listing shows. Logos live in
// public/agents/<key>.webp (flat, full-bleed squares; the UI rounds them).

export const AGENT_ICON_KEYS = [
  'aura', 'support', 'community', 'productivity', 'learning', 'fun', 'other',
  'digest', 'housing', 'safety', 'translate', 'wellness', 'welcome',
] as const;

export type AgentIconKey = (typeof AGENT_ICON_KEYS)[number];

export interface AgentIconInput {
  /** Display name or listing title, e.g. "Campus FAQ". */
  name?: string | null;
  /** @handle, e.g. "campus_faq". */
  username?: string | null;
  /** Built-in agent slug (summarizer, moderation…) or template key. */
  slug?: string | null;
  /** Directory category. */
  category?: string | null;
  builtin?: boolean;
}

// Order matters: the first rule whose words appear wins.
const RULES: Array<[AgentIconKey, RegExp]> = [
  ['aura', /\baura\b|\bassistant\b/],
  ['safety', /moderat|safety|guard|spam|report/],
  ['translate', /translat|language|lingo/],
  ['wellness', /wellness|mood|wellbeing|mental|care\b/],
  ['welcome', /welcome|onboard|greet|intro|auto_message/],
  ['digest', /digest|summar|recap|weekly|newsletter|catch.?up/],
  ['housing', /hostel|housing|room|rent|dorm/],
  ['support', /faq|support|help ?desk|question|knowledge/],
  ['learning', /study|learn|quiz|course|tutor|class|exam/],
  ['fun', /poll|game|fun|trivia|icebreak|engag|spark/],
  ['productivity', /remind|task|todo|schedul|plan|standup|meeting|focus/],
  ['community', /communit|event|member|people/],
];

const CATEGORY_KEYS: Record<string, AgentIconKey> = {
  support: 'support', community: 'community', productivity: 'productivity',
  learning: 'learning', fun: 'fun', other: 'other',
};

/** Pick the logo for an agent: built-in → Aura, then words in its name/handle, then its category. */
export function agentIconKey(input: AgentIconInput): AgentIconKey {
  const named = [input.name, input.username].filter(Boolean).join(' ').toLowerCase();
  if (input.builtin && /aura|assistant/.test(named)) return 'aura';
  // The agent's own name wins over its (often generic) slug, e.g. "Campus FAQ" posted as "assistant".
  for (const text of [named, (input.slug ?? '').toLowerCase()]) {
    if (!text) continue;
    for (const [key, rx] of RULES) if (rx.test(text)) return key;
  }
  if (input.category && CATEGORY_KEYS[input.category]) return CATEGORY_KEYS[input.category];
  return input.builtin ? 'aura' : 'other';
}

export function agentIconSrc(key: AgentIconKey): string {
  return `/agents/${key}.webp`;
}
