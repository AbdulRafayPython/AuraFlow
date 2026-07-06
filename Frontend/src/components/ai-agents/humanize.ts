// Frontend/src/components/ai-agents/humanize.ts
//
// The single place that turns developer-internal agent strings into plain
// English for end users.
//
// Every autonomous agent returns a `(decision, payload, reason)` tuple where
// `reason` is a debug-style code: `warming_window_2/5`, `escalation_mean_…`,
// `not_opted_in`, `no_kb_match`, `drift_jaccard_…`, `english_message`,
// `explicit_invocation`, … (see Backend/agents/*). Several surfaces previously
// rendered those codes — and titles synthesised from `agent_name`+`decision`
// ("Acted on mood tracker", "Moodded tracker act") — verbatim. This module
// replaces all of that with copy a normal member or community owner can read.
//
// Presentation-only: it never changes what an agent does, only how a past
// action is described. Used by ExplainabilityRow and every row builder
// (AgentActivityTimeline, AgentResultPanel, CommunityAgentsTab,
// ChannelInterventions).

import { agentLabel } from './AgentAccent';

export type AgentDecision = 'act' | 'skip' | 'defer';

export interface HumanAction {
  /** Short headline of what happened. */
  title: string;
  /** One friendly sentence of why / what, safe to show verbatim. */
  detail: string;
}

/**
 * A reason string is "code-shaped" when it carries no spaces and looks like a
 * snake_case / slash / number token (e.g. `warming_window_2/5`,
 * `low_confidence_en`). Human reasons from the engagement and moderation agents
 * ("Channel has been quiet for 12 minutes.") contain spaces and pass through
 * untouched.
 */
export function looksLikeCode(reason: string | null | undefined): boolean {
  const r = (reason ?? '').trim();
  if (!r) return false;
  if (/\s/.test(r)) return false;            // has a space → already a sentence
  return /[_/]/.test(r) || /^[a-z][a-z0-9]*$/.test(r);
}

/** Friendly verb for a raw backend decision. */
export function decisionVerb(decision: AgentDecision | string): string {
  switch (decision) {
    case 'act':   return 'Took action';
    case 'defer': return 'Waiting';
    case 'skip':  return 'Held back';
    default:      return 'Update';
  }
}

// ─── Reason code → friendly sentence ─────────────────────────────────────────
//
// Ordered prefix/regex rules. First match wins. Anything not matched here and
// not already a human sentence falls back to a per-agent generic.

type ReasonRule = { test: RegExp; render: (m: RegExpMatchArray) => string };

const REASON_RULES: ReasonRule[] = [
  {
    test: /^warming_window_(\d+)\/(\d+)/,
    render: (m) => `Still learning your usual mood — ${m[1]} of ${m[2]} messages read so far.`,
  },
  {
    test: /^escalation_mean_/,
    render: () => 'Your recent messages trended low, so it checked in privately.',
  },
  {
    test: /^(not_opted_in|opt_out)$/,
    render: () => "You haven't turned this on.",
  },
  {
    test: /^analyze_failed/,
    render: () => "Couldn't read that message.",
  },
  {
    test: /^empty_keyword_set$/,
    render: () => 'Not enough text yet to gauge the topic.',
  },
  {
    test: /^drift_jaccard_/,
    render: () => 'The conversation drifted away from the channel topic.',
  },
  {
    test: /^english_message$/,
    render: () => 'Already in your language — nothing to translate.',
  },
  {
    test: /^low_confidence_/,
    render: () => "Couldn't confidently detect the language.",
  },
  {
    test: /^(sklearn_unavailable|retrieval_failed)$/,
    render: () => "Couldn't search the knowledge base just now.",
  },
  {
    test: /^no_kb_match$/,
    render: () => 'No saved answer matched the question.',
  },
  {
    test: /^empty_summary$/,
    render: () => 'There was nothing new worth recapping.',
  },
  {
    test: /^explicit_invocation$/,
    render: () => 'You asked it directly.',
  },
  {
    test: /^no_default_channel$/,
    render: () => 'No main channel to post the welcome in.',
  },
  {
    test: /^(spam_flood|duplicate_spam)$/,
    render: () => 'Caught repeated spam-like messages.',
  },
];

/** Per-agent generic, used when a reason is an unknown code. */
function genericReason(agent: string, decision: AgentDecision | string): string {
  if (decision === 'act') {
    switch (agent) {
      case 'mood_tracker': return 'Updated your private mood timeline.';
      case 'wellness':     return 'Reached out privately to check in.';
      case 'engagement':   return 'Posted something to get the channel talking.';
      case 'focus':        return 'Nudged the channel back on topic.';
      case 'summarizer':   return 'Saved a fresh recap of the conversation.';
      case 'support':      return 'Suggested an answer from the knowledge base.';
      case 'moderation':   return 'Acted on a message that broke the rules.';
      case 'translator':   return 'Translated a message for you.';
      case 'assistant':    return 'Answered a question for you.';
      case 'knowledge_builder':
      case 'knowledge_builder_v2': return 'Saved something useful to the knowledge base.';
      case 'auto_message': return 'Welcomed a new member.';
      default:             return 'Did something to help out.';
    }
  }
  if (decision === 'defer') return 'Waiting for a bit more before it acts.';
  return 'Looked, but decided nothing was needed.';
}

/**
 * Turn a raw `reason` into a friendly sentence. Human sentences pass through;
 * known codes are translated; unknown codes fall back to a per-agent generic.
 */
export function humanizeReason(
  agent: string,
  decision: AgentDecision | string,
  reason: string | null | undefined,
): string {
  const r = (reason ?? '').trim();
  if (!r) return genericReason(agent, decision);

  if (!looksLikeCode(r)) return r; // already a sentence

  for (const rule of REASON_RULES) {
    const m = r.match(rule.test);
    if (m) return rule.render(m);
  }
  return genericReason(agent, decision);
}

// ─── Title per agent + decision ──────────────────────────────────────────────

const ACT_TITLE: Record<string, string> = {
  mood_tracker:         'Updated your private mood timeline',
  wellness:             'Sent you a private check-in',
  engagement:          'Posted a conversation starter',
  focus:               'Flagged a topic drift',
  summarizer:          'Saved a recap',
  support:             'Suggested an answer',
  moderation:          'Acted on a flagged message',
  translator:          'Translated a message for you',
  assistant:           'Answered your question',
  knowledge_builder:   'Saved to the knowledge base',
  knowledge_builder_v2:'Saved to the knowledge base',
  auto_message:        'Welcomed a new member',
};

/** Short headline for a past action. */
export function humanizeTitle(
  agent: string,
  decision: AgentDecision | string,
  _reason?: string | null,
): string {
  if (decision === 'act') {
    return ACT_TITLE[agent] ?? `${agentLabel(agent)} took action`;
  }
  if (decision === 'defer') {
    return `${agentLabel(agent)} is waiting`;
  }
  return `${agentLabel(agent)} stepped back`;
}

/** Compose a headline + friendly detail in one call, for row builders. */
export function humanAction(
  agent: string,
  decision: AgentDecision | string,
  reason: string | null | undefined,
): HumanAction {
  return {
    title: humanizeTitle(agent, decision, reason),
    detail: humanizeReason(agent, decision, reason),
  };
}
