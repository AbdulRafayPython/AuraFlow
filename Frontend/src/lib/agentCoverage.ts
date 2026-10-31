// Where in a community an agent is allowed to act, channel by channel.
import type { ChannelCoverage } from '@/services/aiAgentService';

export interface CoverageCell {
  /** Whether the agent acts in this channel. */
  enabled: boolean;
  /** True when someone set this channel by hand; false when it just follows the community. */
  overridden: boolean;
}

/**
 * A channel with its own setting follows that; otherwise it follows the community-wide switch.
 * (The server only stores the channels that differ.)
 */
export function coverageCell(coverage: ChannelCoverage, channelId: number, agentType: string, communityEnabled: boolean): CoverageCell {
  const own = coverage[channelId]?.[agentType];
  return own === undefined ? { enabled: communityEnabled, overridden: false } : { enabled: own, overridden: true };
}

/** "Acts in 3 of 5 channels" */
export function coverageSummary(coverage: ChannelCoverage, channelIds: number[], agentType: string, communityEnabled: boolean): string {
  const on = channelIds.filter((id) => coverageCell(coverage, id, agentType, communityEnabled).enabled).length;
  return `Acts in ${on} of ${channelIds.length} channel${channelIds.length === 1 ? '' : 's'}`;
}
