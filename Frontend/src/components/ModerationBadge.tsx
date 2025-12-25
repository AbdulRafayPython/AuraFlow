// Frontend/src/components/ModerationBadge.tsx
import { ShieldAlert, ShieldCheck, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModerationBadgeProps {
  action: 'allow' | 'warn' | 'flag' | 'block' | 'remove_message' | 'remove_user' | 'block_user';
  severity?: 'none' | 'low' | 'medium' | 'high';
  reasons?: string[];
  className?: string;
}

export function ModerationBadge({ action, severity = 'none', reasons = [], className }: ModerationBadgeProps) {
  // Don't show badge for clean messages
  if (action === 'allow' && severity === 'none') {
    return null;
  }

  const getIcon = () => {
    switch (action) {
      case 'block_user':
      case 'block':
        return <ShieldAlert className="h-3 w-3" />;
      case 'flag':
        return <ShieldCheck className="h-3 w-3" />;
      case 'remove_message':
      case 'warn':
        return <AlertTriangle className="h-3 w-3" />;
      case 'remove_user':
        return <ShieldAlert className="h-3 w-3" />;
      default:
        return null;
    }
  };

  const getBadgeStyles = () => {
    switch (action) {
      case 'block_user':
      case 'block':
        return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700';
      case 'flag':
        return 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-700';
      case 'remove_message':
      case 'warn':
        return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700';
      case 'remove_user':
        return 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700';
      default:
        return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700';
    }
  };

  const getLabel = () => {
    switch (action) {
      case 'block_user':
      case 'block':
        return 'Blocked';
      case 'remove_user':
        return 'Removed from community';
      case 'flag':
        return 'Flagged for review';
      case 'remove_message':
      case 'warn':
        return 'Warning';
      default:
        return 'Moderated';
    }
  };

  return (
    <div 
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border',
        getBadgeStyles(),
        className
      )}
      title={reasons.length > 0 ? `Reasons: ${reasons.join(', ')}` : undefined}
    >
      {getIcon()}
      <span>{getLabel()}</span>
    </div>
  );
}
