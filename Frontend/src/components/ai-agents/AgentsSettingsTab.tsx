// Settings, AI Agents tab: your own preferences (the activity panel, what Aura remembers) and a way to the Agents page.
import React from 'react';
import ManageAgentsCard from '@/components/ai-agents/ManageAgentsCard';
import ActivityFeedToggle from '@/components/ai-agents/ActivityFeedToggle';
import AuraMemoryCard from '@/components/ai-agents/AuraMemoryCard';

const AgentsSettingsTab: React.FC = () => (
  <div className="space-y-4" data-testid="agents-settings-tab">
    <ManageAgentsCard />
    <ActivityFeedToggle />
    <AuraMemoryCard />
  </div>
);

export default AgentsSettingsTab;
