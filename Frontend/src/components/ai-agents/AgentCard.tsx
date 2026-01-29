import React from 'react';
import { Settings, Power, AlertCircle, CheckCircle, Loader2, ChevronRight, Zap } from 'lucide-react';

interface AgentCardProps {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  status: 'active' | 'inactive' | 'pending' | 'error';
  enabled: boolean;
  color: string;
  alerts?: number;
  onToggle: (id: string, enabled: boolean) => void;
  onConfigure: (id: string) => void;
}

export default function AgentCard({
  id,
  name,
  description,
  icon,
  status,
  enabled,
  color,
  alerts,
  onToggle,
  onConfigure
}: AgentCardProps) {

  const getStatusConfig = () => {
    switch (status) {
      case 'active':
        return {
          icon: <CheckCircle className="w-3 h-3" />,
          color: 'text-emerald-400',
          bgColor: 'bg-emerald-500/15',
          borderColor: 'border-emerald-500/30',
          label: 'Active',
          glow: 'shadow-[0_0_12px_rgba(16,185,129,0.3)]'
        };
      case 'error':
        return {
          icon: <AlertCircle className="w-3 h-3" />,
          color: 'text-red-400',
          bgColor: 'bg-red-500/15',
          borderColor: 'border-red-500/30',
          label: 'Error',
          glow: 'shadow-[0_0_12px_rgba(239,68,68,0.3)]'
        };
      case 'pending':
        return {
          icon: <Loader2 className="w-3 h-3 animate-spin" />,
          color: 'text-amber-400',
          bgColor: 'bg-amber-500/15',
          borderColor: 'border-amber-500/30',
          label: 'Pending',
          glow: ''
        };
      default:
        return {
          icon: <Power className="w-3 h-3" />,
          color: 'text-[hsl(var(--theme-text-muted))]',
          bgColor: 'bg-[hsl(var(--theme-bg-tertiary))]',
          borderColor: 'border-[hsl(var(--theme-border-default))]',
          label: 'Inactive',
          glow: ''
        };
    }
  };

  const getColorClasses = (colorName: string) => {
    const colors: Record<string, { bg: string; text: string; border: string; glow: string }> = {
      blue: { 
        bg: 'bg-blue-500/15', 
        text: 'text-blue-400', 
        border: 'border-blue-500/30',
        glow: 'group-hover:shadow-[0_0_20px_rgba(59,130,246,0.25)]'
      },
      pink: { 
        bg: 'bg-pink-500/15', 
        text: 'text-pink-400', 
        border: 'border-pink-500/30',
        glow: 'group-hover:shadow-[0_0_20px_rgba(236,72,153,0.25)]'
      },
      red: { 
        bg: 'bg-red-500/15', 
        text: 'text-red-400', 
        border: 'border-red-500/30',
        glow: 'group-hover:shadow-[0_0_20px_rgba(239,68,68,0.25)]'
      },
      green: { 
        bg: 'bg-emerald-500/15', 
        text: 'text-emerald-400', 
        border: 'border-emerald-500/30',
        glow: 'group-hover:shadow-[0_0_20px_rgba(16,185,129,0.25)]'
      },
      purple: { 
        bg: 'bg-purple-500/15', 
        text: 'text-purple-400', 
        border: 'border-purple-500/30',
        glow: 'group-hover:shadow-[0_0_20px_rgba(168,85,247,0.25)]'
      },
      indigo: { 
        bg: 'bg-indigo-500/15', 
        text: 'text-indigo-400', 
        border: 'border-indigo-500/30',
        glow: 'group-hover:shadow-[0_0_20px_rgba(99,102,241,0.25)]'
      },
      orange: { 
        bg: 'bg-orange-500/15', 
        text: 'text-orange-400', 
        border: 'border-orange-500/30',
        glow: 'group-hover:shadow-[0_0_20px_rgba(249,115,22,0.25)]'
      },
    };
    return colors[colorName] || colors.blue;
  };

  const statusConfig = getStatusConfig();
  const colorClasses = getColorClasses(color);

  return (
    <div
      className={`group relative p-4 rounded-2xl border transition-all duration-300 bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))] hover:bg-[hsl(var(--theme-bg-hover))] hover:border-[hsl(var(--theme-border-hover))] ${colorClasses.glow}`}
    >
      {/* Subtle gradient overlay on hover */}
      <div className={`absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none ${colorClasses.bg}`} />
      
      {/* Header: Icon + Name + Status */}
      <div className="relative flex items-start gap-3 mb-3">
        <div className={`p-2.5 rounded-xl ${colorClasses.bg} border ${colorClasses.border} transition-all duration-300`}>
          <div className={colorClasses.text}>
            {icon}
          </div>
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <h3 className="font-semibold text-sm text-[hsl(var(--theme-text-primary))] truncate">
              {name}
            </h3>
            {alerts && alerts > 0 && (
              <div className="bg-gradient-to-r from-red-500 to-rose-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0 animate-pulse shadow-lg shadow-red-500/30">
                {alerts}
              </div>
            )}
          </div>
          
          <p className="text-xs text-[hsl(var(--theme-text-muted))] truncate">
            {description}
          </p>
        </div>
      </div>

      {/* Status Indicator */}
      <div className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium mb-3 ${statusConfig.bgColor} ${statusConfig.color} border ${statusConfig.borderColor} ${statusConfig.glow}`}>
        {statusConfig.icon}
        <span>{statusConfig.label}</span>
        {status === 'active' && (
          <Zap className="w-3 h-3 ml-auto opacity-60" />
        )}
      </div>

      {/* Controls: Toggle + Configure */}
      <div className="relative flex items-center gap-2">
        {/* Enable/Disable Toggle */}
        <button
          onClick={() => onToggle(id, !enabled)}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-300 ${
            enabled
              ? 'bg-gradient-to-r from-emerald-500/20 to-green-500/20 text-emerald-400 border border-emerald-500/30 hover:from-emerald-500/30 hover:to-green-500/30 hover:shadow-[0_0_15px_rgba(16,185,129,0.25)]'
              : 'bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-muted))] border border-[hsl(var(--theme-border-default))] hover:bg-[hsl(var(--theme-bg-hover))] hover:text-[hsl(var(--theme-text-secondary))]'
          }`}
        >
          <Power className="w-3.5 h-3.5" />
          {enabled ? 'Enabled' : 'Disabled'}
        </button>

        {/* Configure Button */}
        <button
          onClick={() => onConfigure(id)}
          className="p-2.5 rounded-xl transition-all duration-300 bg-[hsl(var(--theme-accent-primary)/0.15)] text-[hsl(var(--theme-accent-primary))] border border-[hsl(var(--theme-accent-primary)/0.3)] hover:bg-[hsl(var(--theme-accent-primary)/0.25)] hover:shadow-[0_0_15px_hsl(var(--theme-accent-primary)/0.2)] group/btn"
          title="Configure agent"
        >
          <Settings className="w-4 h-4 group-hover/btn:rotate-90 transition-transform duration-300" />
        </button>
      </div>
    </div>
  );
}
