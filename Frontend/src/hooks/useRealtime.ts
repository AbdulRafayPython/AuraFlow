// src/hooks/useRealtime.ts
import { useContext } from 'react';
import { RealtimeContext } from '@/contexts/RealtimeContext';

export function useRealtime() {
  const context = useContext(RealtimeContext);
  if (context === undefined) {
    throw new Error('useRealtime must be used within a RealtimeProvider');
  }
  return context;
}