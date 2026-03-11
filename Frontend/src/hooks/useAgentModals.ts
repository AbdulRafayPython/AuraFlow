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
    onConfirm?: () => void;
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
    command: { open: false, agentType: null },
  });

  const openDetailModal = useCallback((agentType: string, mode: 'discover' | 'manage' = 'discover') => {
    setState(prev => ({
      ...prev,
      detail: { open: true, agentType, mode },
    }));
  }, []);

  const closeDetailModal = useCallback(() => {
    setState(prev => ({
      ...prev,
      detail: { ...prev.detail, open: false },
    }));
  }, []);

  const openSettingsModal = useCallback((agentType: string, communityId?: number) => {
    setState(prev => ({
      ...prev,
      settings: { open: true, agentType, communityId },
    }));
  }, []);

  const closeSettingsModal = useCallback(() => {
    setState(prev => ({
      ...prev,
      settings: { ...prev.settings, open: false },
    }));
  }, []);

  const openConfirmDialog = useCallback(
    (type: 'uninstall' | 'deactivate' | 'delete_data' | 'reset', agentType: string, communityId?: number, onConfirm?: () => void) => {
      setState(prev => ({
        ...prev,
        confirm: { open: true, type, agentType, communityId, onConfirm },
      }));
    },
    []
  );

  const closeConfirmDialog = useCallback(() => {
    setState(prev => ({
      ...prev,
      confirm: { ...prev.confirm, open: false },
    }));
  }, []);

  const openCommandModal = useCallback((agentType: string) => {
    setState(prev => ({
      ...prev,
      command: { open: true, agentType },
    }));
  }, []);

  const closeCommandModal = useCallback(() => {
    setState(prev => ({
      ...prev,
      command: { ...prev.command, open: false },
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
    closeCommandModal,
  };
};
