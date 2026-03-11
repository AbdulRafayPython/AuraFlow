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
