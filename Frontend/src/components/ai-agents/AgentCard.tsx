import React from 'react';
import { Settings, Power, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

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
  const { isDarkMode } = useTheme();

  const getStatusConfig = () => {
    switch (status) {
      case 'active':
        return {
          icon: <CheckCircle className="w-3.5 h-3.5" />,
          color: 'text-green-500',
          bgColor: 'bg-green-500/10',
          label: 'Active'
        };
      case 'error':
        return {
          icon: <AlertCircle className="w-3.5 h-3.5" />,
          color: 'text-red-500',
          bgColor: 'bg-red-500/10',
          label: 'Error'
        };
      case 'pending':
        return {
          icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
          color: 'text-yellow-500',
          bgColor: 'bg-yellow-500/10',
          label: 'Pending'
        };
      default:
        return {
          icon: <Power className="w-3.5 h-3.5" />,
          color: 'text-gray-500',
          bgColor: 'bg-gray-500/10',
          label: 'Inactive'
        };
    }
  };

  const statusConfig = getStatusConfig();

  return (
    <div
      className={`p-3 rounded-lg border transition-all ${
        isDarkMode
          ? 'bg-slate-800/50 border-slate-700 hover:bg-slate-800'
          : 'bg-white border-gray-200 hover:bg-gray-50'
      }`}
    >
      {/* Header: Icon + Name + Status */}
      <div className="flex items-start gap-3 mb-2.5">
        <div className={`p-2 rounded-lg bg-${color}-500/20 flex-shrink-0`}>
          <div className={`text-${color}-400`}>
            {icon}
          </div>
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <h3 className={`font-semibold text-sm truncate ${
              isDarkMode ? 'text-white' : 'text-gray-900'
            }`}>
              {name}
            </h3>
            {alerts && alerts > 0 && (
              <div className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">
                {alerts}
              </div>
            )}
          </div>
          
          <p className={`text-xs truncate ${
            isDarkMode ? 'text-gray-500' : 'text-gray-600'
          }`}>
            {description}
          </p>
        </div>
      </div>

      {/* Status Indicator */}
      <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium mb-2.5 ${
        statusConfig.bgColor
      } ${statusConfig.color}`}>
        {statusConfig.icon}
        <span>{statusConfig.label}</span>
      </div>

      {/* Controls: Toggle + Configure */}
      <div className="flex items-center gap-2">
        {/* Enable/Disable Toggle */}
        <button
          onClick={() => onToggle(id, !enabled)}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            enabled
              ? isDarkMode
                ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                : 'bg-green-50 text-green-700 hover:bg-green-100'
              : isDarkMode
                ? 'bg-slate-700 text-gray-400 hover:bg-slate-600'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <Power className="w-3.5 h-3.5" />
          {enabled ? 'Enabled' : 'Disabled'}
        </button>

        {/* Configure Button */}
        <button
          onClick={() => onConfigure(id)}
          className={`px-3 py-1.5 rounded-md transition-all ${
            isDarkMode
              ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
              : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
          }`}
          title="Configure agent"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
