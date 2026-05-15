import { useToast } from './use-toast';

export interface NotificationOptions {
  title: string;
  description?: string;
  duration?: number;
}

export function useNotifications() {
  const { toast } = useToast();

  const showSuccess = (options: NotificationOptions) =>
    toast({
      title: options.title,
      description: options.description,
      duration: options.duration,
      variant: 'success',
    });

  const showError = (options: NotificationOptions) =>
    toast({
      title: options.title,
      description: options.description,
      duration: options.duration,
      variant: 'destructive',
    });

  const showWarning = (options: NotificationOptions) =>
    toast({
      title: options.title,
      description: options.description,
      duration: options.duration,
      variant: 'warning',
    });

  const showInfo = (options: NotificationOptions) =>
    toast({
      title: options.title,
      description: options.description,
      duration: options.duration,
      variant: 'info',
    });

  const showLoading = (options: NotificationOptions) =>
    toast({
      title: options.title,
      description: options.description,
      duration: options.duration ?? 10000,
      variant: 'loading',
    });

  return {
    showSuccess,
    showError,
    showWarning,
    showInfo,
    showLoading,
    toast,
  };
}
