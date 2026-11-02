// What the built-in agents did on their own, as rows an admin can read and rate.
import type { AgentAction } from '@/services/aiAgentService';
import type { ExplainabilityRowData } from '@/components/ai-agents/ExplainabilityRow';
import { humanizeTitle } from '@/components/ai-agents/humanize';

// /agent/:id uses short names for these two; the actions table uses the full agent name.
const AGENT_NAMES: Record<string, string> = { mood: 'mood_tracker', knowledge: 'knowledge_builder' };

// Agents that act for the whole community on their own. Mood and Wellness are left out on purpose
// (their actions are about one person, and private); Assistant and Translator only answer the person asking.
const COMMUNITY_AGENTS = new Set(['moderation', 'focus', 'engagement', 'support', 'auto_message', 'knowledge_builder', 'summarizer']);

export const agentNameForRoute = (routeId: string): string => AGENT_NAMES[routeId] ?? routeId;

/** True when the agent page should show "What it did lately" for this agent. */
export const hasActivityPanel = (routeId: string): boolean => COMMUNITY_AGENTS.has(agentNameForRoute(routeId));

export function actionToRow(action: AgentAction, communityName?: string): ExplainabilityRowData {
  return {
    agent: action.agent_name,
    decision: action.decision,
    title: humanizeTitle(action.agent_name, action.decision, action.reason),
    reason: action.reason,
    scope: communityName,
    visibility: 'admins-only',
    correlationId: action.correlation_id,
    createdAt: action.created_at,
  };
}
