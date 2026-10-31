import { describe, expect, it } from 'vitest';
import type { MetricsResponse } from '@/services/aiAgentService';
import { metricTiles } from './agentMetrics';

const metrics = (over: Partial<MetricsResponse> = {}): MetricsResponse => ({
  window_days: 7, community_id: 1,
  autonomy: { acts: 12, defers: 3, skips: 20, total_decisions: 35, autonomy_ratio: 0.34, human_triggered: 9, autonomous_share: 0.57 },
  goal_attainment: { goal_threshold: 0.2, buckets: 10, met: 7, ratio: 0.7, avg_sentiment: 0.3 },
  feedback: { positive: 6, negative: 2, engaged: 1, dismissed: 0, ignored: 0, feedback_ratio: 0.75, total: 9 },
  per_agent: [], ...over,
});

describe('metricTiles', () => {
  it('turns the numbers into four plain tiles', () => {
    const t = metricTiles(metrics());
    expect(t.map((x) => x.label)).toEqual(['Acted on their own', 'Asked for by people', 'Rated helpful', 'Goals met']);
    expect(t.map((x) => x.value)).toEqual(['12', '9', '75%', '70%']);
    expect(t[0].hint).toBe('35 decisions in the last 7 days');
    expect(t[2].hint).toBe('8 ratings');
    expect(t[3].hint).toBe('7 of 10 periods');
  });

  it('says so when there is nothing to show yet, instead of 0% or NaN', () => {
    const t = metricTiles(metrics({
      feedback: { positive: 0, negative: 0, engaged: 0, dismissed: 0, ignored: 0, feedback_ratio: 0, total: 0 },
      goal_attainment: { goal_threshold: 0.2, buckets: 0, met: 0, ratio: 0, avg_sentiment: 0 },
    }));
    expect([t[2].value, t[2].hint]).toEqual(['–', 'No ratings yet']);
    expect([t[3].value, t[3].hint]).toEqual(['–', 'Not enough data yet']);
  });
});
