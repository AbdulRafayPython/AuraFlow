import { useToast } from './use-toast';
import { useTheme } from '@/contexts/ThemeContext';

export interface NotificationOptions {
  title: string;
  description?: string;
  duration?: number;
}

export function useNotifications() {
  const { toast } = useToast();
  const { isDarkMode } = useTheme();

  const showSuccess = (options: NotificationOptions) => {
    toast({
      title: options.title,
      description: options.description,
      variant: 'default',
      className: isDarkMode
        ? 'bg-green-600 border-green-500 text-white'
        : 'bg-green-500 border-green-400 text-white',
    });
  };

  const showError = (options: NotificationOptions) => {
    toast({
      title: options.title,
      description: options.description,
      variant: 'destructive',
      className: isDarkMode
        ? 'bg-red-600 border-red-500 text-white'
        : 'bg-red-500 border-red-400 text-white',
    });
  };

  const showWarning = (options: NotificationOptions) => {
    toast({
      title: options.title,
      description: options.description,
      className: isDarkMode
        ? 'bg-yellow-600 border-yellow-500 text-white'
        : 'bg-yellow-500 border-yellow-400 text-white',
    });
  };

  const showInfo = (options: NotificationOptions) => {
    toast({
      title: options.title,
      description: options.description,
      className: isDarkMode
        ? 'bg-blue-600 border-blue-500 text-white'
        : 'bg-blue-500 border-blue-400 text-white',
    });
  };

  return {
    showSuccess,
    showError,
    showWarning,
    showInfo,
    toast,
  };
}
