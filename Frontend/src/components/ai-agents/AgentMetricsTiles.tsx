// The last week of the community's agents in four numbers. Hidden when there is nothing to show
// or the person is not allowed to see it (only community admins can).
import React, { useEffect, useState } from 'react';
import { aiAgentService } from '@/services/aiAgentService';
import { metricTiles, type MetricTile } from '@/lib/agentMetrics';

const AgentMetricsTiles: React.FC<{ communityId?: string }> = ({ communityId }) => {
  const [tiles, setTiles] = useState<MetricTile[] | null>(null);

  useEffect(() => {
    setTiles(null);
    if (!communityId) return;
    let live = true;
    aiAgentService.getAgentMetrics({ days: 7, community_id: communityId })
      .then((m) => { if (live) setTiles(metricTiles(m)); })
      .catch(() => { if (live) setTiles(null); });
    return () => { live = false; };
  }, [communityId]);

  if (!tiles) return null;
  return (
    <dl className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Agents in the last 7 days" data-testid="agent-metrics">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-lg border border-border p-3">
          <dt className="text-xs text-muted-foreground">{t.label}</dt>
          <dd className="mt-1 text-2xl font-semibold text-foreground">{t.value}</dd>
          <p className="mt-0.5 text-xs text-muted-foreground">{t.hint}</p>
        </div>
      ))}
    </dl>
  );
};

export default AgentMetricsTiles;
