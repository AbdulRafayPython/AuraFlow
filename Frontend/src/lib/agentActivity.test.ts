import { describe, expect, it } from 'vitest';
import type { AgentAction } from '@/services/aiAgentService';
import { actionToRow, agentNameForRoute, hasActivityPanel } from './agentActivity';

const action = (over: Partial<AgentAction> = {}): AgentAction => ({
  id: 1, agent_name: 'moderation', community_id: 1, channel_id: 2, user_id: 7, decision: 'act',
  reason: 'Extreme content detected', correlation_id: 'c-1', created_at: '2026-11-01T10:00:00', has_feedback: false, ...over,
});

describe('agentNameForRoute', () => {
  it('maps the short page names to the actions-table names', () => {
    expect(agentNameForRoute('mood')).toBe('mood_tracker');
    expect(agentNameForRoute('knowledge')).toBe('knowledge_builder');
    expect(agentNameForRoute('focus')).toBe('focus');
  });
});

describe('hasActivityPanel', () => {
  it('shows it for agents that act for the community, not for private or personal ones', () => {
    for (const id of ['moderation', 'focus', 'engagement', 'support', 'auto_message', 'knowledge', 'summarizer']) {
      expect(hasActivityPanel(id)).toBe(true);
    }
    for (const id of ['mood', 'wellness', 'assistant', 'translator', 'nope']) expect(hasActivityPanel(id)).toBe(false);
  });
});

describe('actionToRow', () => {
  it('turns an action into a readable, admin-only row that can be rated', () => {
    expect(actionToRow(action(), 'CS Department')).toEqual({
      agent: 'moderation', decision: 'act', title: 'Acted on a flagged message', reason: 'Extreme content detected',
      scope: 'CS Department', visibility: 'admins-only', correlationId: 'c-1', createdAt: '2026-11-01T10:00:00',
    });
  });

  it('describes a skipped action without inventing a title from the code', () => {
    expect(actionToRow(action({ decision: 'skip', reason: 'not_opted_in' })).title).toBe('Moderation stepped back');
  });
});
