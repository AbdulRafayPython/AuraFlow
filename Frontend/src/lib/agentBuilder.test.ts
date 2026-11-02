import { describe, expect, it } from 'vitest';
import {
  applyMention, approvalAlertTitle, cronLabel, describeDue, describeExpiry, describeTrigger, detectMention, filterMentionable, formatTokens, formFromAgent, isDirty,
  splitKeywords, toolLabel, triggerProblems,
} from './agentBuilder';
import { errorMessage, toPatchBody } from '@/services/agentBuilderService';
import type { MentionableAgent } from '@/types/agentBuilder';

const agent = (username: string, name = username): MentionableAgent =>
  ({ id: username, name, username, description: '', avatar_url: null, builtin: false });

describe('detectMention', () => {
  it('finds the @query before the caret', () => {
    expect(detectMention('hello @au', 9)).toEqual({ start: 6, end: 9, query: 'au' });
    expect(detectMention('@aura', 5)).toEqual({ start: 0, end: 5, query: 'aura' });
  });

  it('matches a bare @ so every agent can be listed', () => {
    expect(detectMention('ask @', 5)).toEqual({ start: 4, end: 5, query: '' });
  });

  it('only looks at text before the caret', () => {
    expect(detectMention('@aura what is this', 3)).toEqual({ start: 0, end: 3, query: 'au' });
    expect(detectMention('@aura what is this', 18)).toBeNull();
  });

  it('ignores email addresses and finished mentions', () => {
    expect(detectMention('mail sam@aura', 13)).toBeNull();
    expect(detectMention('@aura hello', 11)).toBeNull();
    expect(detectMention('no mention', 10)).toBeNull();
  });

  it('survives out-of-range carets', () => {
    expect(detectMention('@a', 99)).toEqual({ start: 0, end: 2, query: 'a' });
    expect(detectMention('@a', -3)).toBeNull();
  });
});

describe('filterMentionable', () => {
  const list = [agent('aura', 'Aura'), agent('campus_faq', 'Campus FAQ'), agent('digest_bot', 'Weekly Digest')];

  it('returns everything for an empty query, capped', () => {
    expect(filterMentionable(list, '')).toHaveLength(3);
    expect(filterMentionable(list, '', 2)).toHaveLength(2);
  });

  it('ranks username prefix, then name prefix, then substring', () => {
    const l = [agent('xdigest', 'Other'), agent('zed', 'Digest Helper'), agent('digest_bot', 'Weekly')];
    expect(filterMentionable(l, 'dig').map((a) => a.username)).toEqual(['digest_bot', 'zed', 'xdigest']);
  });

  it('is case-insensitive and drops non-matches', () => {
    expect(filterMentionable(list, 'FAQ').map((a) => a.username)).toEqual(['campus_faq']);
    expect(filterMentionable(list, 'zzz')).toEqual([]);
  });
});

describe('applyMention', () => {
  it('replaces the typed query and puts the caret after the inserted space', () => {
    const text = 'hey @au please';
    const match = detectMention(text, 7)!;
    expect(applyMention(text, match, 'aura')).toEqual({ text: 'hey @aura please', caret: 10 });
  });

  it('does not double the space when one already follows', () => {
    const match = detectMention('@a rest', 2)!;
    const out = applyMention('@a rest', match, 'aura');
    expect(out.text).toBe('@aura rest');
    expect(out.caret).toBe(6);
  });

  it('works at the end of the text', () => {
    const match = detectMention('@', 1)!;
    expect(applyMention('@', match, 'faq_bot')).toEqual({ text: '@faq_bot ', caret: 9 });
  });
});

describe('triggers', () => {
  it('describes triggers in plain words', () => {
    expect(describeTrigger({ type: 'mention', channel_id: null, config: {} })).toBe('When mentioned');
    expect(describeTrigger({ type: 'keyword', channel_id: null, config: { keywords: ['fees', 'exam'] } }))
      .toBe('On keywords: fees, exam');
    expect(describeTrigger({ type: 'schedule', channel_id: 11, config: { cron: '0 17 * * 5', tz: 'Asia/Dubai' } },
      (id) => (id === 11 ? 'general' : undefined)))
      .toBe('On a schedule: Every Friday at 17:00 (Asia/Dubai) in #general');
  });

  it('describes the channel-event triggers', () => {
    expect(describeTrigger({ type: 'channel_silent', channel_id: null, config: { min_minutes: 240 } }))
      .toBe('When a channel goes quiet for 4 hours');
    expect(describeTrigger({ type: 'channel_silent', channel_id: 11, config: {} }, () => 'general'))
      .toBe('When a channel goes quiet for 15 minutes in #general');
    expect(describeTrigger({ type: 'focus_drift', channel_id: null, config: {} })).toBe('When the topic changes');
  });

  it('shows the raw cron for custom schedules and falls back to the channel id', () => {
    expect(cronLabel('5 4 * * *')).toBe('cron 5 4 * * *');
    expect(cronLabel(undefined)).toBe('No schedule');
    expect(describeTrigger({ type: 'channel_message', channel_id: 9, config: {} })).toBe('Every message in a channel in #9');
  });

  it('flags what is missing before a trigger can be saved', () => {
    expect(triggerProblems({ type: 'mention', channel_id: null, config: {} })).toEqual([]);
    expect(triggerProblems({ type: 'keyword', channel_id: null, config: {} })).toHaveLength(1);
    expect(triggerProblems({ type: 'schedule', channel_id: null, config: {} })).toHaveLength(2);
    expect(triggerProblems({ type: 'schedule', channel_id: 3, config: { cron: '0 9 * * *' } })).toEqual([]);
    expect(triggerProblems({ type: 'channel_message', channel_id: null, config: {} })).toHaveLength(1);
  });

  it('splits and de-duplicates keywords', () => {
    expect(splitKeywords('fees, exam,\nfees , ,hostel')).toEqual(['fees', 'exam', 'hostel']);
    expect(splitKeywords('  ')).toEqual([]);
  });
});

describe('labels and formatting', () => {
  it('labels known tools and humanises unknown ones', () => {
    expect(toolLabel('search_knowledge')).toBe('Search its knowledge');
    expect(toolLabel('some_new_tool')).toBe('some new tool');
  });

  it('formats token counts', () => {
    expect(formatTokens({ in: 100, out: 20 })).toBe('120 tokens');
    expect(formatTokens({ in: 1500, out: 300 })).toBe('1.8k tokens');
    expect(formatTokens(undefined)).toBe('');
  });
});

describe('agentBuilderService helpers', () => {
  it('maps channel_ids to permissions for PATCH', () => {
    expect(toPatchBody({ name: 'X', channel_ids: [1, 2] })).toEqual({ name: 'X', permissions: { channel_ids: [1, 2] } });
    expect(toPatchBody({ name: 'X' })).toEqual({ name: 'X' });
    expect(toPatchBody({ channel_ids: [] })).toEqual({ permissions: { channel_ids: [] } });
  });

  it('includes the backend details in error messages', () => {
    const err = Object.assign(new Error('Invalid agent'), { status: 400, data: { details: ['name must be 2 to 60 characters', 'x'] } });
    expect(errorMessage(err)).toBe('Invalid agent: name must be 2 to 60 characters; x');
    expect(errorMessage(new Error('Boom'))).toBe('Boom');
    expect(errorMessage(undefined)).toBe('Something went wrong');
  });
});

describe('builder form state', () => {
  const base = {
    id: 'a1', name: 'FAQ Bot', description: 'd', username: 'faq_bot', avatar_url: null, community_id: null,
    status: 'draft' as const, template_key: 'faq', is_builtin: false, instructions: 'Answer.', tools: ['search_knowledge'],
    model_tier: 'smart' as const, daily_run_cap: 50, permissions: { channel_ids: [3, 1] },
  };

  it('builds form values from an agent, with safe defaults', () => {
    expect(formFromAgent(base)).toEqual({
      name: 'FAQ Bot', description: 'd', instructions: 'Answer.', tools: ['search_knowledge'], model_tier: 'smart',
      daily_run_cap: 50, channel_ids: [3, 1],
    });
    const bare = formFromAgent({ ...base, instructions: undefined, tools: undefined, model_tier: undefined,
                                 daily_run_cap: undefined, permissions: undefined });
    expect(bare).toMatchObject({ instructions: '', tools: [], model_tier: 'fast', daily_run_cap: 200, channel_ids: [] });
  });

  it('detects real changes only, ignoring list order', () => {
    const a = formFromAgent(base);
    expect(isDirty(a, { ...a })).toBe(false);
    expect(isDirty(a, { ...a, channel_ids: [1, 3] })).toBe(false);
    expect(isDirty(a, { ...a, tools: [...a.tools] })).toBe(false);
    expect(isDirty(a, { ...a, name: 'Other' })).toBe(true);
    expect(isDirty(a, { ...a, tools: [] })).toBe(true);
    expect(isDirty(a, { ...a, daily_run_cap: 51 })).toBe(true);
  });
});

describe('approvals', () => {
  const now = Date.parse('2026-10-29T09:00:00Z');

  it('says how long an approval has left', () => {
    expect(describeExpiry('2026-10-29T09:12:00Z', now)).toBe('Expires in 12 min');
    expect(describeExpiry('2026-10-29T09:00:30Z', now)).toBe('Expires in 1 min');
    expect(describeExpiry('2026-10-29T12:00:00Z', now)).toBe('Expires in 3 h');
    expect(describeExpiry('2026-11-02T09:00:00Z', now)).toBe('Expires in 4 days');
  });

  it('reports overdue and unreadable deadlines', () => {
    expect(describeExpiry('2026-10-29T08:59:00Z', now)).toBe('Expired');
    expect(describeExpiry('not a date', now)).toBe('');
  });

  it('names the agent in the alert, with a fallback', () => {
    expect(approvalAlertTitle('Digest Bot')).toBe('Digest Bot wants your approval');
    expect(approvalAlertTitle('')).toBe('An agent wants your approval');
  });
});

describe('describeDue', () => {
  const now = Date.parse('2026-10-29T09:00:00Z');

  it('says how long until a reminder', () => {
    expect(describeDue('2026-10-29T09:05:00Z', now)).toBe('in 5 min');
    expect(describeDue('2026-10-29T12:00:00Z', now)).toBe('in 3 h');
    expect(describeDue('2026-11-01T09:00:00Z', now)).toBe('in 3 days');
  });

  it('calls a reminder that is due or overdue "due now"', () => {
    expect(describeDue('2026-10-29T09:00:30Z', now)).toBe('due now');
    expect(describeDue('2026-10-29T08:00:00Z', now)).toBe('due now');
    expect(describeDue('nope', now)).toBe('');
  });
});
