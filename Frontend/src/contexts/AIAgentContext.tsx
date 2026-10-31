// What the app needs to know about the built-in agents everywhere: whether each one is on.
// Everything else (summaries, translation, settings...) is asked of aiAgentService by the screen that needs it.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { aiAgentService } from '@/services/aiAgentService';
import { useAuth } from './AuthContext';

interface AIAgentContextType {
  /** Agent name to its status, e.g. `{ summarizer: 'active' }`. */
  agentStatus: Record<string, string>;
  isLoadingAgents: boolean;
  /** Ask the server again, e.g. after turning an agent on or off. */
  refreshAgentStatus: () => Promise<void>;
}

const AIAgentContext = createContext<AIAgentContextType | undefined>(undefined);

export function AIAgentProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [agentStatus, setAgentStatus] = useState<Record<string, string>>({});
  const [isLoadingAgents, setIsLoadingAgents] = useState(true);

  const refreshAgentStatus = useCallback(async () => {
    setIsLoadingAgents(true);
    try {
      setAgentStatus(await aiAgentService.getAgentStatus());
    } catch (err) {
      console.error('[AIAgents] could not load the agent status', err);
    } finally {
      setIsLoadingAgents(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void refreshAgentStatus();
    // Settings pages label and limit each setting from what the server says it is.
    aiAgentService.getSettingsSchema().catch(() => undefined);
  }, [user, refreshAgentStatus]);

  const value = useMemo(() => ({ agentStatus, isLoadingAgents, refreshAgentStatus }), [agentStatus, isLoadingAgents, refreshAgentStatus]);
  return <AIAgentContext.Provider value={value}>{children}</AIAgentContext.Provider>;
}

export function useAIAgents() {
  const context = useContext(AIAgentContext);
  if (context === undefined) {
    throw new Error('useAIAgents must be used within an AIAgentProvider');
  }
  return context;
}
