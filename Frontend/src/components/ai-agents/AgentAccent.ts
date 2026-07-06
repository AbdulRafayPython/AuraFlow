// Frontend/src/components/ai-agents/AgentAccent.ts
//
// Maps the 11 autonomous agents to one of six per-domain semantic accents
// defined in docs/AUTONOMOUS_AGENT_FRONTEND_REDESIGN.md §5.4.
//
// Resolved against the `--agent-accent-*` CSS variables registered by the
// `aura-calm-ops` theme (themes.css), so callers do not hardcode HSL.
//
// Surfaces consume these via either:
//   - `hsl(var(--agent-accent-${domain}))`         — direct CSS
//   - `accentFor(agent)` + `accentVar(domain)`     — TS helpers
//
// Identity rule: accent tints the agent's icon and chips only. Panel
// backgrounds stay neutral. One accent per surface, never a rainbow.

export type AgentDomain =
  | 'community'
  | 'support'
  | 'translation'
  | 'wellness'
  | 'safety'
  | 'focus';

export type AgentName =
  | 'assistant'
  | 'auto_message'
  | 'engagement'
  | 'focus'
  | 'knowledge_builder'
  | 'knowledge_builder_v2'
  | 'moderation'
  | 'mood_tracker'
  | 'summarizer'
  | 'support'
  | 'translator'
  | 'wellness';

const AGENT_DOMAIN: Record<AgentName, AgentDomain> = {
  // Community-intelligence indigo — structural, automation, recap.
  assistant:           'community',
  auto_message:        'community',
  engagement:          'community',
  summarizer:          'community',

  // Support & knowledge green.
  support:             'support',
  knowledge_builder:   'support',
  knowledge_builder_v2:'support',

  // Translation teal.
  translator:          'translation',

  // Mood + wellness rose. Private surfaces only.
  mood_tracker:        'wellness',
  wellness:            'wellness',

  // Safety red — moderation.
  moderation:          'safety',

  // Focus amber — drift, attention.
  focus:               'focus',
};

/** Returns the semantic domain a given agent belongs to. */
export function domainFor(agent: string): AgentDomain {
  return (AGENT_DOMAIN[agent as AgentName] ?? 'community') as AgentDomain;
}

/** CSS variable name for the given domain accent. */
export function accentVar(domain: AgentDomain): string {
  return `--agent-accent-${domain}`;
}

/**
 * Resolve an agent name to its CSS variable reference, ready to drop into
 * `style={{ color: accentFor(agent) }}` or `borderColor: accentFor(agent)`.
 */
export function accentFor(agent: string): string {
  return `hsl(var(${accentVar(domainFor(agent))}))`;
}

/** Translucent variant for backgrounds — chip tint, never panel. */
export function accentSoftFor(agent: string, alpha = 0.12): string {
  return `hsl(var(${accentVar(domainFor(agent))}) / ${alpha})`;
}

/**
 * Short uppercase code shown in dense tables (timeline, activity center).
 * Five chars max. Identity comes from icon + accent; this is purely a
 * dense-surface affordance.
 */
export function shortCode(agent: string): string {
  const map: Record<string, string> = {
    assistant:           'ASK',
    auto_message:        'WLCM',
    engagement:          'ENGG',
    focus:               'FCS',
    knowledge_builder:   'KB',
    knowledge_builder_v2:'KB',
    moderation:          'MOD',
    mood_tracker:        'MOOD',
    summarizer:          'SUM',
    support:             'SUP',
    translator:          'TRNS',
    wellness:            'WELL',
  };
  return map[agent] ?? agent.slice(0, 4).toUpperCase();
}

/**
 * Human-readable agent label. Kept here so every surface in the redesign
 * uses the same phrasing.
 */
export function agentLabel(agent: string): string {
  const map: Record<string, string> = {
    assistant:           'Assistant',
    auto_message:        'Welcome',
    engagement:          'Engagement',
    focus:               'Focus',
    knowledge_builder:   'Knowledge',
    knowledge_builder_v2:'Knowledge',
    moderation:          'Moderation',
    mood_tracker:        'Mood',
    summarizer:          'Summarizer',
    support:             'Support',
    translator:          'Translator',
    wellness:            'Wellness',
  };
  return map[agent] ?? agent;
}
