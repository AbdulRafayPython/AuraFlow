// Settings, AI Agents tab: the one preference that belongs to you rather than to an agent, and a way to the Agents page.
import React from 'react';
import ManageAgentsCard from '@/components/ai-agents/ManageAgentsCard';
import ActivityFeedToggle from '@/components/ai-agents/ActivityFeedToggle';

const AgentsSettingsTab: React.FC = () => (
  <div className="space-y-4" data-testid="agents-settings-tab">
    <ManageAgentsCard />
    <ActivityFeedToggle />
  </div>
);

export default AgentsSettingsTab;
