import React from 'react';
import { AlertTriangle, X, Loader2, Shield, Trash2, Power, RotateCcw } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { ResponsiveModal, ResponsiveModalContent } from "@/components/ui/responsive-modal";

interface AgentConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  type: 'uninstall' | 'deactivate' | 'delete_data' | 'reset';
  agentName: string;
  communityName?: string;
  onConfirm: () => void;
  isLoading?: boolean;
}

const DIALOG_CONTENT: Record<string, {
  title: string;
  icon: React.ReactNode;
  getDescription: (agentName: string, communityName?: string) => string;
  bullets: string[];
  confirmText: string;
  confirmColor: string;
  confirmGradient: string;
}> = {
  uninstall: {
    title: 'Uninstall Agent?',
    icon: <Trash2 className="w-5 h-5" />,
    getDescription: (agent, community) =>
      `Are you sure you want to uninstall ${agent} from "${community || 'this community'}"?`,
    bullets: [
      'Stops all automatic processing',
      'Past logs and data are retained',
      'Can be reinstalled anytime',
    ],
    confirmText: 'Uninstall Agent',
    confirmColor: 'red',
    confirmGradient: 'from-red-500 to-rose-600',
  },
  deactivate: {
    title: 'Deactivate Agent?',
    icon: <Power className="w-5 h-5" />,
    getDescription: (agent) =>
      `Are you sure you want to deactivate ${agent} from your account?`,
    bullets: [
      'Stops personal tracking',
      'History is preserved',
      'Can be reactivated anytime',
    ],
    confirmText: 'Deactivate',
    confirmColor: 'amber',
    confirmGradient: 'from-amber-500 to-orange-600',
  },
  delete_data: {
    title: 'Delete Agent Data?',
    icon: <Trash2 className="w-5 h-5" />,
    getDescription: (agent) =>
      `This will permanently delete all data collected by ${agent}. This action cannot be undone.`,
    bullets: [
      'All logs permanently removed',
      'Analytics data deleted',
      'Cannot be recovered',
    ],
    confirmText: 'Delete All Data',
    confirmColor: 'red',
    confirmGradient: 'from-red-600 to-red-700',
  },
  reset: {
    title: 'Reset Settings?',
    icon: <RotateCcw className="w-5 h-5" />,
    getDescription: (agent) =>
      `Reset all ${agent} settings to their default values?`,
    bullets: [
      'Custom settings will be lost',
      'Agent behavior returns to default',
      'Data and logs are not affected',
    ],
    confirmText: 'Reset Settings',
    confirmColor: 'orange',
    confirmGradient: 'from-orange-500 to-amber-600',
  },
};

export const AgentConfirmDialog: React.FC<AgentConfirmDialogProps> = ({
  open,
  onClose,
  type,
  agentName,
  communityName,
  onConfirm,
  isLoading = false,
}) => {
  const { currentTheme } = useTheme();
  const isBasicTheme = currentTheme === 'basic';

  const content = DIALOG_CONTENT[type] || DIALOG_CONTENT.uninstall;

  return (
    <ResponsiveModal open={open} onOpenChange={(o) => { if (!o && !isLoading) onClose(); }}>
      <ResponsiveModalContent size="sm">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-2">
          <div className="flex items-center gap-3">
            <div className={`p-2 ${isBasicTheme ? 'rounded-md' : 'rounded-xl'} bg-${content.confirmColor}-500/15 text-${content.confirmColor}-400`}>
              {content.icon}
            </div>
            <h3 className="text-base font-bold text-[hsl(var(--theme-text-primary))]">
              {content.title}
            </h3>
          </div>
          {/* Close handled by ResponsiveModal */}
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          <p className="text-sm text-[hsl(var(--theme-text-secondary))] leading-relaxed">
            {content.getDescription(agentName, communityName)}
          </p>

          <div className={`${isBasicTheme ? 'rounded-md' : 'rounded-xl'} p-3 bg-[hsl(var(--theme-bg-secondary)/0.5)] border border-[hsl(var(--theme-border-default)/0.3)]`}>
            <p className="text-xs font-medium text-[hsl(var(--theme-text-muted))] mb-2">This action:</p>
            <ul className="space-y-1.5">
              {content.bullets.map((bullet, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-[hsl(var(--theme-text-secondary))]">
                  <span className="w-1 h-1 rounded-full bg-[hsl(var(--theme-text-muted))]" />
                  {bullet}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 pb-6 pt-2">
          <button
            onClick={onClose}
            disabled={isLoading}
            className={`px-4 py-2 ${isBasicTheme ? 'rounded-md' : 'rounded-lg'} text-sm font-medium
              bg-[hsl(var(--theme-bg-secondary))] text-[hsl(var(--theme-text-secondary))]
              border border-[hsl(var(--theme-border-default))]
              hover:bg-[hsl(var(--theme-bg-hover))] transition-all disabled:opacity-50`}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex items-center gap-2 px-5 py-2 ${isBasicTheme ? 'rounded-md' : 'rounded-lg'}
              text-sm font-semibold text-white
              bg-gradient-to-r ${content.confirmGradient}
              hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50`}
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {content.confirmText}
          </button>
        </div>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
};
