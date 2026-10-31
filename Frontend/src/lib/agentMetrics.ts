// The few numbers worth showing at the top of the Agents page.
import type { MetricsResponse } from '@/services/aiAgentService';

export interface MetricTile { label: string; value: string; hint: string }

const pct = (ratio: number | undefined): string => (typeof ratio === 'number' && Number.isFinite(ratio) ? `${Math.round(ratio * 100)}%` : '–');

export function metricTiles(m: MetricsResponse): MetricTile[] {
  const rated = m.feedback.positive + m.feedback.negative;
  return [
    { label: 'Acted on their own', value: String(m.autonomy.acts), hint: `${m.autonomy.total_decisions} decisions in the last ${m.window_days} days` },
    { label: 'Asked for by people', value: String(m.autonomy.human_triggered), hint: 'Times someone called on an agent' },
    { label: 'Rated helpful', value: rated > 0 ? pct(m.feedback.positive / rated) : '–', hint: rated > 0 ? `${rated} rating${rated === 1 ? '' : 's'}` : 'No ratings yet' },
    { label: 'Goals met', value: m.goal_attainment.buckets > 0 ? pct(m.goal_attainment.ratio) : '–', hint: m.goal_attainment.buckets > 0 ? `${m.goal_attainment.met} of ${m.goal_attainment.buckets} periods` : 'Not enough data yet' },
  ];
}
