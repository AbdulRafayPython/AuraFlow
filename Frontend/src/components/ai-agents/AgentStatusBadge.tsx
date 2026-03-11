import React from 'react';
import { CheckCircle, AlertCircle, Loader2, Power, Zap } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

interface AgentStatusBadgeProps {
  status: 'active' | 'inactive' | 'pending' | 'error' | 'installed';
  size?: 'sm' | 'md';
  showIcon?: boolean;
  showGlow?: boolean;
}

const STATUS_CONFIG: Record<string, {
  icon: React.ReactNode;
  iconSm: React.ReactNode;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  glow: string;
}> = {
  active: {
    icon: <CheckCircle className="w-3 h-3" />,
    iconSm: <CheckCircle className="w-2.5 h-2.5" />,
    label: 'Active',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/15',
    borderColor: 'border-emerald-500/30',
    glow: 'shadow-[0_0_8px_rgba(16,185,129,0.3)]',
  },
  installed: {
    icon: <CheckCircle className="w-3 h-3" />,
    iconSm: <CheckCircle className="w-2.5 h-2.5" />,
    label: 'Installed',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/15',
    borderColor: 'border-blue-500/30',
    glow: '',
  },
  inactive: {
    icon: <Power className="w-3 h-3" />,
    iconSm: <Power className="w-2.5 h-2.5" />,
    label: 'Inactive',
    color: 'text-[hsl(var(--theme-text-muted))]',
    bgColor: 'bg-[hsl(var(--theme-bg-tertiary))]',
    borderColor: 'border-[hsl(var(--theme-border-default))]',
    glow: '',
  },
  pending: {
    icon: <Loader2 className="w-3 h-3 animate-spin" />,
    iconSm: <Loader2 className="w-2.5 h-2.5 animate-spin" />,
    label: 'Pending',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/15',
    borderColor: 'border-amber-500/30',
    glow: '',
  },
  error: {
    icon: <AlertCircle className="w-3 h-3" />,
    iconSm: <AlertCircle className="w-2.5 h-2.5" />,
    label: 'Error',
    color: 'text-red-400',
    bgColor: 'bg-red-500/15',
    borderColor: 'border-red-500/30',
    glow: 'shadow-[0_0_8px_rgba(239,68,68,0.3)]',
  },
};

export const AgentStatusBadge: React.FC<AgentStatusBadgeProps> = ({
  status,
  size = 'sm',
  showIcon = true,
  showGlow = false,
}) => {
  const { currentTheme } = useTheme();
  const isBasicTheme = currentTheme === 'basic';
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.inactive;

  return (
    <span
      className={`inline-flex items-center gap-1 font-medium
        ${size === 'sm'
          ? 'text-[10px] px-2 py-0.5'
          : 'text-xs px-2.5 py-1'
        }
        ${isBasicTheme ? 'rounded-md' : 'rounded-full'}
        ${config.bgColor} ${config.color} border ${config.borderColor}
        ${showGlow && !isBasicTheme ? config.glow : ''}
      `}
    >
      {showIcon && (size === 'sm' ? config.iconSm : config.icon)}
      {config.label}
    </span>
  );
};
