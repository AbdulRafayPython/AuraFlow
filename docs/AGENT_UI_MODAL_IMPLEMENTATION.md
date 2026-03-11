# 🚀 Agent Modal Implementation Guide

**Author:** Development Team  
**Date:** February 22, 2026  
**Phase:** Development Sprint 1

---

## 📚 Documentation Index

This is part of the Agent Integration Architecture series:

1. **[AGENT_INTEGRATION_ARCHITECTURE.md](docs/AGENT_INTEGRATION_ARCHITECTURE.md)** - Complete architecture & flows
2. **[AGENT_UI_MODAL_SPECIFICATIONS.md](docs/AGENT_UI_MODAL_SPECIFICATIONS.md)** - Detailed UI specifications
3. **[AGENT_UI_MODAL_QUICK_REFERENCE.md](docs/AGENT_UI_MODAL_QUICK_REFERENCE.md)** - Visual & styling quick reference
4. **[AGENT_UI_MODAL_IMPLEMENTATION.md](docs/AGENT_UI_MODAL_IMPLEMENTATION.md)** ← **YOU ARE HERE**

---

## 🎯 Implementation Overview

### What We're Building

```
Old System:
  AIAgentPanel.tsx (side panel)
  ├─ Limited space
  ├─ Can't show detailed features
  ├─ No installation workflow
  └─ Clunky configuration

New System:
  ✅ AgentDetailModal (discovery & install)
  ✅ AgentSettingsModal (configuration)
  ✅ AgentConfirmDialog (confirmations)
  ✅ AgentCommandModal (help & reference)
  ✅ Proper Explore section integration
  ✅ Community Settings integration
  ✅ Personal/User Settings integration
```

### Files to Delete

```
❌ Frontend/src/components/ai-agents/AIAgentPanel.tsx
   (after new modals are fully functional)
```

### Files to Create

```
NEW Modals:
✅ Frontend/src/components/modals/AgentDetailModal.tsx
✅ Frontend/src/components/modals/AgentSettingsModal.tsx
✅ Frontend/src/components/modals/AgentConfirmDialog.tsx
✅ Frontend/src/components/modals/AgentCommandModal.tsx

NEW Components:
✅ Frontend/src/components/ai-agents/AgentCatalogSection.tsx
✅ Frontend/src/components/ai-agents/CommunityAgentsList.tsx
✅ Frontend/src/components/ai-agents/PersonalAgentsList.tsx
✅ Frontend/src/components/ai-agents/AgentStatusBadge.tsx

NEW Hooks & Context:
✅ Frontend/src/hooks/useAgentModals.ts
✅ Frontend/src/contexts/AgentModalsContext.tsx

Files to Update:
🔄 Frontend/src/pages/DiscoverCommunities.tsx
🔄 Frontend/src/pages/CommunitySettings.tsx
🔄 Frontend/src/pages/UserSettings.tsx (or Profile)
🔄 Frontend/src/components/ai-agents/AgentCard.tsx
```

---

## 🏗️ Step-by-Step Implementation

### Step 1: Create Hooks & Context (Foundation)

**File:** `Frontend/src/hooks/useAgentModals.ts`

```typescript
import { useState, useCallback } from 'react';

interface AgentModalState {
  detail: {
    open: boolean;
    agentType: string | null;
    mode: 'discover' | 'manage';
  };
  settings: {
    open: boolean;
    agentType: string | null;
    communityId?: number;
  };
  confirm: {
    open: boolean;
    type: 'uninstall' | 'deactivate' | 'delete_data' | 'reset';
    agentType: string | null;
    communityId?: number;
  };
  command: {
    open: boolean;
    agentType: string | null;
  };
}

export const useAgentModals = () => {
  const [state, setState] = useState<AgentModalState>({
    detail: { open: false, agentType: null, mode: 'discover' },
    settings: { open: false, agentType: null },
    confirm: { open: false, type: 'uninstall', agentType: null },
    command: { open: false, agentType: null }
  });

  const openDetailModal = useCallback((agentType: string, mode: 'discover' | 'manage' = 'discover') => {
    setState(prev => ({
      ...prev,
      detail: { open: true, agentType, mode }
    }));
  }, []);

  const closeDetailModal = useCallback(() => {
    setState(prev => ({
      ...prev,
      detail: { ...prev.detail, open: false }
    }));
  }, []);

  const openSettingsModal = useCallback((agentType: string, communityId?: number) => {
    setState(prev => ({
      ...prev,
      settings: { open: true, agentType, communityId }
    }));
  }, []);

  const closeSettingsModal = useCallback(() => {
    setState(prev => ({
      ...prev,
      settings: { ...prev.settings, open: false }
    }));
  }, []);

  const openConfirmDialog = useCallback(
    (type: 'uninstall' | 'deactivate' | 'delete_data' | 'reset', agentType: string, communityId?: number) => {
      setState(prev => ({
        ...prev,
        confirm: { open: true, type, agentType, communityId }
      }));
    },
    []
  );

  const closeConfirmDialog = useCallback(() => {
    setState(prev => ({
      ...prev,
      confirm: { ...prev.confirm, open: false }
    }));
  }, []);

  const openCommandModal = useCallback((agentType: string) => {
    setState(prev => ({
      ...prev,
      command: { open: true, agentType }
    }));
  }, []);

  const closeCommandModal = useCallback(() => {
    setState(prev => ({
      ...prev,
      command: { ...prev.command, open: false }
    }));
  }, []);

  return {
    state,
    openDetailModal,
    closeDetailModal,
    openSettingsModal,
    closeSettingsModal,
    openConfirmDialog,
    closeConfirmDialog,
    openCommandModal,
    closeCommandModal
  };
};
```

**File:** `Frontend/src/contexts/AgentModalsContext.tsx`

```typescript
import React, { createContext, useContext } from 'react';
import { useAgentModals } from '@/hooks/useAgentModals';

type AgentModalsContextType = ReturnType<typeof useAgentModals>;

const AgentModalsContext = createContext<AgentModalsContextType | null>(null);

export const AgentModalsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const modals = useAgentModals();

  return (
    <AgentModalsContext.Provider value={modals}>
      {children}
    </AgentModalsContext.Provider>
  );
};

export const useAgentModalsContext = () => {
  const context = useContext(AgentModalsContext);
  if (!context) {
    throw new Error('useAgentModalsContext must be used within AgentModalsProvider');
  }
  return context;
};
```

**Usage in App.tsx:**

```typescript
import { AgentModalsProvider } from '@/contexts/AgentModalsContext';

function App() {
  return (
    <AgentModalsProvider>
      <ThemeProvider>
        <RealTimeProvider>
          {/* Rest of app */}
        </RealTimeProvider>
      </ThemeProvider>
    </AgentModalsProvider>
  );
}
```

---

### Step 2: Create AgentDetailModal Component

**File:** `Frontend/src/components/modals/AgentDetailModal.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import { X, CheckCircle, Plus, Settings } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { api } from '@/services/api';
import { toast } from '@/components/ui/toast';
import type { AgentMetadata } from '@/types/agents';

interface AgentDetailModalProps {
  open: boolean;
  onClose: () => void;
  agentType: string;
  mode?: 'discover' | 'manage';
  onSuccess?: () => void;
}

export const AgentDetailModal: React.FC<AgentDetailModalProps> = ({
  open,
  onClose,
  agentType,
  mode = 'discover',
  onSuccess
}) => {
  const { isDarkMode, currentTheme } = useTheme();
  const [agent, setAgent] = useState<AgentMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [selectedCommunityId, setSelectedCommunityId] = useState<number | null>(null);
  const [ownedCommunities, setOwnedCommunities] = useState<any[]>([]);
  const [isActivated, setIsActivated] = useState(false);

  useEffect(() => {
    if (open && agentType) {
      const fetchData = async () => {
        try {
          setLoading(true);
          
          // Fetch agent metadata
          const catalogResponse = await api.get('/agents/catalog');
          const allAgents = [
            ...catalogResponse.data.agents.community,
            ...catalogResponse.data.agents.personal
          ];
          const agentData = allAgents.find(a => a.agent_type === agentType);
          
          if (!agentData) {
            toast.error('Agent not found');
            onClose();
            return;
          }

          setAgent(agentData);

          // For community agents: fetch user's admin communities
          if (agentData.category === 'community') {
            const communitiesResponse = await api.get('/admin/owned-communities');
            if (communitiesResponse.data.success) {
              // Filter out communities that already have this agent
              const available = communitiesResponse.data.communities.filter(
                (c: any) => !agentData.user_communities_with_agent?.includes(c.id)
              );
              setOwnedCommunities(available);
            }
          } else {
            // Check if personal agent is activated
            setIsActivated(agentData.is_activated || false);
          }
        } catch (error) {
          console.error('Failed to load agent:', error);
          toast.error('Failed to load agent details');
        } finally {
          setLoading(false);
        }
      };

      fetchData();
    }
  }, [open, agentType, onClose]);

  const handleInstall = async () => {
    try {
      setInstalling(true);

      if (agent?.category === 'community') {
        if (!selectedCommunityId) {
          toast.error('Please select a community');
          return;
        }

        await api.post(`/agents/install/community/${selectedCommunityId}`, {
          agent_type: agentType
        });

        toast.success(`${agent.display_name} installed successfully!`);
      } else {
        await api.post('/agents/activate/personal', {
          agent_type: agentType
        });

        toast.success(`${agent.display_name} activated!`);
        setIsActivated(true);
      }

      onSuccess?.();
      onClose();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Installation failed');
    } finally {
      setInstalling(false);
    }
  };

  if (!open) return null;

  const colorClasses = getAgentColorClasses(agentType);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className={`
        w-full max-w-[600px] max-h-[80vh] overflow-auto rounded-2xl shadow-2xl
        ${isDarkMode ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}
        ${currentTheme === 'basic' ? 'rounded-lg' : ''}
      `}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200/20 sticky top-0 bg-inherit">
          <h2 className="text-xl font-bold">
            {mode === 'discover' ? 'Agent Details' : 'Manage Agent'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100/10 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-96">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500" />
          </div>
        ) : agent ? (
          <div className="p-6 space-y-6">
            {/* Agent Icon & Title */}
            <div className="flex flex-col items-center text-center gap-4">
              <div className={`w-20 h-20 rounded-2xl ${colorClasses.bg} flex items-center justify-center shadow-lg`}>
                <span className="text-5xl">{getAgentIcon(agentType)}</span>
              </div>
              <div>
                <h3 className="text-2xl font-bold">{agent.display_name}</h3>
                <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-medium ${
                  agent.category === 'community'
                    ? 'bg-purple-500/20 text-purple-400'
                    : 'bg-blue-500/20 text-blue-400'
                }`}>
                  {agent.category === 'community' ? '🏷️ Community Agent' : '👤 Personal Agent'}
                </span>
              </div>
            </div>

            {/* Description */}
            <div className="text-center">
              <p className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>
                {agent.description}
              </p>
            </div>

            {/* Features */}
            <div>
              <h4 className="font-semibold mb-3 text-sm uppercase tracking-wide opacity-75">Features</h4>
              <div className="grid grid-cols-2 gap-3">
                {getAgentFeatures(agentType).map((feature, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <CheckCircle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${colorClasses.text}`} />
                    <span className="text-sm">{feature}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Installation Section */}
            <div className="border-t border-gray-200/20 pt-6">
              {agent.category === 'community' ? (
                <div className="space-y-3">
                  <label className="block text-sm font-medium">
                    Select Community to Install
                  </label>
                  {ownedCommunities.length === 0 ? (
                    <div className={`p-4 rounded-lg text-center ${
                      isDarkMode ? 'bg-gray-800' : 'bg-gray-100'
                    }`}>
                      <p className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>
                        You need to be an admin of a community to install this agent.
                      </p>
                    </div>
                  ) : (
                    <select
                      value={selectedCommunityId || ''}
                      onChange={(e) => setSelectedCommunityId(Number(e.target.value))}
                      className={`w-full px-4 py-2 rounded-lg border transition ${
                        isDarkMode
                          ? 'bg-gray-800 border-gray-700 text-white'
                          : 'bg-white border-gray-300 text-gray-900'
                      } focus:outline-none focus:ring-2 focus:ring-purple-500`}
                    >
                      <option value="">Choose a community...</option>
                      {ownedCommunities.map(community => (
                        <option key={community.id} value={community.id}>
                          {community.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ) : (
                <div className="text-center">
                  {isActivated ? (
                    <div className="flex items-center justify-center gap-2 text-green-400">
                      <CheckCircle className="w-5 h-5" />
                      <span>Already activated</span>
                    </div>
                  ) : (
                    <p className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>
                      Ready to activate this agent for your personal use
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 sticky bottom-0 bg-inherit pt-4 border-t border-gray-200/20">
              <button
                onClick={onClose}
                className={`flex-1 px-4 py-2 rounded-lg font-medium transition ${
                  isDarkMode
                    ? 'bg-gray-800 hover:bg-gray-700 text-white'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleInstall}
                disabled={installing || (agent.category === 'community' && !selectedCommunityId) || isActivated}
                className={`flex-1 px-4 py-2 rounded-lg font-medium transition flex items-center justify-center gap-2 ${
                  isActivated
                    ? 'bg-gray-500 cursor-not-allowed opacity-50 text-white'
                    : `${colorClasses.gradient} text-white hover:opacity-90`
                }`}
              >
                {installing && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {isActivated ? 'Activated' : agent.category === 'community' ? 'Install Agent' : 'Activate Agent'}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

// Helper Functions
function getAgentIcon(agentType: string): string {
  const icons: Record<string, string> = {
    moderation: '🛡️',
    engagement: '🎯',
    knowledge_builder: '📚',
    focus: '🎯',
    summarizer: '📝',
    mood_tracker: '😊',
    wellness: '🧘'
  };
  return icons[agentType] || '🤖';
}

function getAgentColorClasses(agentType: string) {
  const colors: Record<string, any> = {
    moderation: { bg: 'bg-red-500/20', text: 'text-red-400', gradient: 'bg-gradient-to-r from-red-500 to-rose-500' },
    engagement: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', gradient: 'bg-gradient-to-r from-emerald-500 to-green-500' },
    knowledge_builder: { bg: 'bg-indigo-500/20', text: 'text-indigo-400', gradient: 'bg-gradient-to-r from-indigo-500 to-purple-500' },
    focus: { bg: 'bg-orange-500/20', text: 'text-orange-400', gradient: 'bg-gradient-to-r from-orange-500 to-red-500' },
    summarizer: { bg: 'bg-blue-500/20', text: 'text-blue-400', gradient: 'bg-gradient-to-r from-blue-500 to-cyan-500' },
    mood_tracker: { bg: 'bg-pink-500/20', text: 'text-pink-400', gradient: 'bg-gradient-to-r from-pink-500 to-rose-500' },
    wellness: { bg: 'bg-purple-500/20', text: 'text-purple-400', gradient: 'bg-gradient-to-r from-purple-500 to-pink-500' }
  };
  return colors[agentType] || colors.summarizer;
}

function getAgentFeatures(agentType: string): string[] {
  const features: Record<string, string[]> = {
    moderation: [
      'Auto-detect toxic content',
      'Roman Urdu profanity',
      'Hate speech filtering',
      'Configurable sensitivity',
      'Auto-moderation actions',
      'Violation logging'
    ],
    engagement: [
      'Smart suggestions',
      'Conversation starters',
      'Polls & challenges',
      'Activity detection',
      'Engagement analytics',
      'Inactivity alerts'
    ],
    knowledge_builder: [
      'Extract Q&A pairs',
      'Auto-categorization',
      'FAQ generation',
      'Searchable knowledge',
      'Decision logging',
      'Topic tagging'
    ],
    focus: [
      'Topic tracking',
      'Drift detection',
      'Focus scoring',
      'Productivity insights',
      'Goal support',
      'Weekly reports'
    ],
    summarizer: [
      'Message summaries',
      'Multiple styles',
      'Custom length',
      'Command-based usage',
      'Roman Urdu support',
      'Decision extraction'
    ],
    mood_tracker: [
      'Sentiment analysis',
      'Roman Urdu support',
      'Emoji detection',
      'Mood history',
      'Trend analysis',
      'Wellness insights'
    ],
    wellness: [
      'Break reminders',
      'Activity monitoring',
      'Stress detection',
      'Health suggestions',
      'Pattern analysis',
      'Weekly reports'
    ]
  };
  return features[agentType] || [];
}
```

---

### Step 3: Create AgentSettingsModal Component

**File:** `Frontend/src/components/modals/AgentSettingsModal.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import { X, RotateCcw, Check } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { api } from '@/services/api';
import { toast } from '@/components/ui/toast';

interface AgentSettingsModalProps {
  open: boolean;
  onClose: () => void;
  agentType: string;
  communityId?: number;
  userId?: number;
  onSuccess?: () => void;
}

export const AgentSettingsModal: React.FC<AgentSettingsModalProps> = ({
  open,
  onClose,
  agentType,
  communityId,
  userId,
  onSuccess
}) => {
  const { isDarkMode } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [defaultSettings, setDefaultSettings] = useState<Record<string, any>>({});
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (open && agentType) {
      const fetchSettings = async () => {
        try {
          setLoading(true);

          // Fetch current settings and defaults
          const catalogResponse = await api.get('/agents/catalog');
          const endpoint = communityId
            ? `/agents/status/community/${communityId}`
            : '/agents/status/personal';

          const settingsResponse = await api.get(endpoint);
          const agentSettings = settingsResponse.data.agents.find(
            (a: any) => a.agent_type === agentType
          );

          if (agentSettings) {
            setSettings(agentSettings.settings || {});
            setDefaultSettings(agentSettings.settings || {});
          }
        } catch (error) {
          console.error('Failed to load settings:', error);
          toast.error('Failed to load settings');
        } finally {
          setLoading(false);
        }
      };

      fetchSettings();
    }
  }, [open, agentType, communityId]);

  const handleSettingChange = (key: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
    setHasChanges(true);
  };

  const handleReset = () => {
    setSettings(defaultSettings);
    setHasChanges(false);
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      const endpoint = communityId
        ? `/agents/configure/community/${communityId}/${agentType}`
        : `/agents/configure/personal/${agentType}`;

      await api.put(endpoint, { settings });

      toast.success('Settings saved successfully!');
      onSuccess?.();
      setTimeout(() => onClose(), 500);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className={`
        w-full max-w-[600px] max-h-[80vh] overflow-auto rounded-2xl shadow-2xl
        ${isDarkMode ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}
      `}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200/20 sticky top-0 bg-inherit">
          <h2 className="text-xl font-bold">⚙️ Configure {getAgentDisplayName(agentType)}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100/10 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-96">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500" />
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* MODERATION AGENT SETTINGS */}
            {agentType === 'moderation' && (
              <>
                {/* Sensitivity Slider */}
                <div className={`p-4 rounded-lg ${isDarkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
                  <label className="block text-sm font-medium mb-2">Detection Sensitivity</label>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="1"
                      value={['low', 'medium', 'high'].indexOf(settings.sensitivity || 'medium')}
                      onChange={(e) => handleSettingChange('sensitivity', ['low', 'medium', 'high'][parseInt(e.target.value)])}
                      className="flex-1"
                    />
                    <span className="text-sm font-medium min-w-[60px]">
                      {(settings.sensitivity || 'medium').toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Toggles */}
                <div className="space-y-3">
                  {[
                    { key: 'auto_delete', label: 'Auto-delete high severity messages', desc: 'Automatically remove serious violations' },
                    { key: 'notify_user', label: 'Notify users of violations', desc: 'Send message when user is flagged' },
                    { key: 'notify_admins', label: 'Notify admins', desc: 'Alert community admins of violations' },
                    { key: 'roman_urdu_enabled', label: 'Roman Urdu support', desc: 'Detect profanity in Roman Urdu' }
                  ].map(({ key, label, desc }) => (
                    <div key={key} className="flex items-center justify-between p-3 border border-gray-200/20 rounded-lg">
                      <div>
                        <label className="text-sm font-medium">{label}</label>
                        <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{desc}</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settings[key] || false}
                          onChange={(e) => handleSettingChange(key, e.target.checked)}
                          className="sr-only"
                        />
                        <div className={`w-11 h-6 rounded-full transition ${settings[key] ? 'bg-purple-600' : 'bg-gray-700'}`} />
                      </label>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ENGAGEMENT AGENT SETTINGS */}
            {agentType === 'engagement' && (
              <>
                <div className={`p-4 rounded-lg ${isDarkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
                  <label className="block text-sm font-medium mb-2">Suggestion Frequency</label>
                  <select
                    value={settings.suggestion_frequency || 'medium'}
                    onChange={(e) => handleSettingChange('suggestion_frequency', e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border transition ${
                      isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                    } focus:outline-none focus:ring-2 focus:ring-purple-500`}
                  >
                    <option value="low">Low (every 24h)</option>
                    <option value="medium">Medium (every 12h)</option>
                    <option value="high">High (every 4h)</option>
                  </select>
                </div>

                <div className="space-y-3">
                  {[
                    { key: 'enable_polls', label: 'Enable Polls' },
                    { key: 'enable_icebreakers', label: 'Enable Icebreakers' },
                    { key: 'enable_challenges', label: 'Enable Challenges' },
                    { key: 'auto_suggestions', label: 'Auto Suggestions' }
                  ].map(({ key, label }) => (
                    <div key={key} className="flex items-center justify-between p-3 border border-gray-200/20 rounded-lg">
                      <label className="text-sm font-medium">{label}</label>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settings[key] || false}
                          onChange={(e) => handleSettingChange(key, e.target.checked)}
                          className="sr-only"
                        />
                        <div className={`w-11 h-6 rounded-full transition ${settings[key] ? 'bg-emerald-600' : 'bg-gray-700'}`} />
                      </label>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* More agent-specific settings... */}

            {/* Save/Reset Buttons */}
            <div className="flex gap-3 sticky bottom-0 bg-inherit pt-4 border-t border-gray-200/20">
              <button
                onClick={handleReset}
                disabled={!hasChanges}
                className="flex-1 px-4 py-2 rounded-lg font-medium flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-4 h-4" />
                Reset Defaults
              </button>
              <button
                onClick={onClose}
                className={`flex-1 px-4 py-2 rounded-lg font-medium transition ${
                  isDarkMode ? 'bg-gray-800 hover:bg-gray-700 text-white' : 'bg-gray-100 hover:bg-gray-200'
                }`}
              >
                Close
              </button>
              <button
                onClick={handleSave}
                disabled={!hasChanges || saving}
                className="flex-1 px-4 py-2 rounded-lg font-medium bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                Save Changes
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

function getAgentDisplayName(agentType: string): string {
  const names: Record<string, string> = {
    moderation: 'Moderation Agent',
    engagement: 'Engagement Agent',
    knowledge_builder: 'Knowledge Builder',
    focus: 'Focus Agent',
    summarizer: 'Summarizer Agent',
    mood_tracker: 'Mood Tracker',
    wellness: 'Wellness Agent'
  };
  return names[agentType] || agentType;
}
```

---

### Step 4: Create AgentConfirmDialog Component

**File:** `Frontend/src/components/modals/AgentConfirmDialog.tsx`

```typescript
import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

interface AgentConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  type: 'uninstall' | 'deactivate' | 'delete_data' | 'reset';
  agentName: string;
  communityName?: string;
  onConfirm: () => void;
  isLoading?: boolean;
}

export const AgentConfirmDialog: React.FC<AgentConfirmDialogProps> = ({
  open,
  onClose,
  type,
  agentName,
  communityName,
  onConfirm,
  isLoading
}) => {
  const { isDarkMode } = useTheme();

  if (!open) return null;

  const getContent = () => {
    switch (type) {
      case 'uninstall':
        return {
          title: '⚠️ Uninstall Agent?',
          message: `Are you sure you want to uninstall the ${agentName}${communityName ? ` from "${communityName}"` : ''}?`,
          warning: [
            'Stops all automatic moderation',
            "Won't delete past moderation logs",
            'Can be reinstalled anytime'
          ],
          confirmText: 'Uninstall Agent',
          confirmColor: 'red'
        };
      case 'deactivate':
        return {
          title: '⚠️ Deactivate Agent?',
          message: `Are you sure you want to deactivate the ${agentName}?`,
          warning: [
            "You won't be able to use this agent",
            'Can be reactivated from Explore section',
            'Agent history will be preserved'
          ],
          confirmText: 'Deactivate Agent',
          confirmColor: 'amber'
        };
      case 'reset':
        return {
          title: '⚠️ Reset Settings?',
          message: `Reset ${agentName} settings to defaults?`,
          warning: [
            'All custom changes will be lost',
            'Cannot be undone',
            'Unsaved changes will remain'
          ],
          confirmText: 'Reset Settings',
          confirmColor: 'orange'
        };
      default:
        return {
          title: 'Confirm',
          message: 'Are you sure?',
          warning: [],
          confirmText: 'Confirm',
          confirmColor: 'red'
        };
    }
  };

  const content = getContent();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className={`
        w-full max-w-[400px] rounded-2xl shadow-2xl
        ${isDarkMode ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}
      `}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200/20">
          <h2 className="text-lg font-bold">{content.title}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100/10 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className={isDarkMode ? 'text-gray-300' : 'text-gray-700'}>
            {content.message}
          </p>

          {content.warning.length > 0 && (
            <div className={`p-4 rounded-lg space-y-2 ${
              isDarkMode ? 'bg-gray-800' : 'bg-gray-100'
            }`}>
              <div className="text-sm font-medium opacity-75">This action will:</div>
              <ul className="space-y-1">
                {content.warning.map((item, idx) => (
                  <li key={idx} className="text-sm flex items-start gap-2">
                    <span className="mt-1">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex gap-3 p-6 border-t border-gray-200/20">
          <button
            onClick={onClose}
            disabled={isLoading}
            className={`flex-1 px-4 py-2 rounded-lg font-medium transition disabled:opacity-50 ${
              isDarkMode ? 'bg-gray-800 hover:bg-gray-700 text-white' : 'bg-gray-100 hover:bg-gray-200'
            }`}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex-1 px-4 py-2 rounded-lg font-medium text-white transition disabled:opacity-50 disabled:cursor-not-allowed ${
              content.confirmColor === 'red'
                ? 'bg-red-600 hover:bg-red-700'
                : content.confirmColor === 'amber'
                ? 'bg-amber-600 hover:bg-amber-700'
                : 'bg-orange-600 hover:bg-orange-700'
            }`}
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
            ) : (
              content.confirmText
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
```

---

### Step 5: Integration Points

**Update:** `Frontend/src/pages/DiscoverCommunities.tsx`

```typescript
import { useAgentModalsContext } from '@/contexts/AgentModalsContext';
import { AgentDetailModal } from '@/components/modals/AgentDetailModal';

export default function DiscoverCommunities() {
  const { state, openDetailModal, closeDetailModal } = useAgentModalsContext();

  const handleAgentCardClick = (agent: AgentMetadata) => {
    openDetailModal(agent.agent_type, 'discover');
  };

  return (
    <>
      {/* ... existing code ... */}
      
      {/* AI Agents Tab */}
      {activeTab === 'agents' && (
        <div className="space-y-12">
          {/* Community Agents */}
          <section>
            <h3 className="text-2xl font-bold mb-6">Community Agents</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {agents.community.map(agent => (
                <AgentCard
                  key={agent.agent_type}
                  agent={agent}
                  onClick={() => handleAgentCardClick(agent)}
                />
              ))}
            </div>
          </section>

          {/* Personal Agents */}
          <section>
            <h3 className="text-2xl font-bold mb-6">Personal Agents</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {agents.personal.map(agent => (
                <AgentCard
                  key={agent.agent_type}
                  agent={agent}
                  onClick={() => handleAgentCardClick(agent)}
                />
              ))}
            </div>
          </section>
        </div>
      )}

      {/* Modals */}
      <AgentDetailModal
        open={state.detail.open}
        onClose={closeDetailModal}
        agentType={state.detail.agentType || ''}
        mode={state.detail.mode}
        onSuccess={() => { /* refresh data */ }}
      />
    </>
  );
}
```

---

## ✅ Verification Checklist

### Once all components are created:

- [ ] All 4 modals render without errors
- [ ] Theme system is applied correctly
- [ ] Responsive design works on mobile/tablet/desktop
- [ ] API calls return expected data
- [ ] Animations and transitions are smooth
- [ ] Error handling displays appropriate messages
- [ ] Loading states show spinner
- [ ] Success/failure toasts appear
- [ ] Navigation integrates properly
- [ ] Permissions are enforced

---

## 🚀 Final Steps

**After Components are Complete:**

1. Update all imports across the codebase
2. Remove `AIAgentPanel.tsx` references
3. Run full test suite
4. Performance audit
5. Accessibility audit (WCAG 2.1)
6. Deploy to staging
7. User acceptance testing
8. Production deployment

---

**Status:** ✅ Implementation Guide Complete  
**Time Estimate:** 2-3 weeks  
**Team Size:** 2-3 frontend developers
