/**
 * Community Dashboard Context
 * Manages the selected community for the admin/community dashboard.
 * Provides community selection and data scoping for all dashboard components.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import api from '@/services/appService';

export interface OwnedCommunity {
  id: number;
  name: string;
  icon: string;
  color: string;
  logo_url: string | null;
  member_count: number;
  channel_count: number;
  role: string;
}

interface CommunityDashboardContextType {
  // Owned communities list
  ownedCommunities: OwnedCommunity[];
  isLoadingCommunities: boolean;
  
  // Selected community
  selectedCommunity: OwnedCommunity | null;
  selectCommunity: (communityId: number) => void;
  
  // Refresh
  refreshOwnedCommunities: () => Promise<void>;
}

const CommunityDashboardContext = createContext<CommunityDashboardContextType | undefined>(undefined);

export function CommunityDashboardProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [ownedCommunities, setOwnedCommunities] = useState<OwnedCommunity[]>([]);
  const [selectedCommunity, setSelectedCommunity] = useState<OwnedCommunity | null>(null);
  const [isLoadingCommunities, setIsLoadingCommunities] = useState(true);

  // Fetch communities where user is owner/admin
  const fetchOwnedCommunities = useCallback(async () => {
    console.log('[CommunityDashboard] fetchOwnedCommunities called', { isAuthenticated, user });
    if (!isAuthenticated || !user) {
      console.log('[CommunityDashboard] Not authenticated, skipping fetch');
      setOwnedCommunities([]);
      setSelectedCommunity(null);
      setIsLoadingCommunities(false);
      return;
    }

    try {
      setIsLoadingCommunities(true);
      console.log('[CommunityDashboard] Fetching owned communities...');
      const response: any = await api.get('/api/admin/owned-communities');
      console.log('[CommunityDashboard] API Response:', response);
      const communities = response.communities || [];
      console.log('[CommunityDashboard] Parsed communities:', communities);
      setOwnedCommunities(communities);
      
      // Auto-select first community if none selected
      if (communities.length > 0 && !selectedCommunity) {
        setSelectedCommunity(communities[0]);
      } else if (selectedCommunity) {
        // Refresh selected community data
        const updated = communities.find((c: OwnedCommunity) => c.id === selectedCommunity.id);
        if (updated) {
          setSelectedCommunity(updated);
        } else if (communities.length > 0) {
          setSelectedCommunity(communities[0]);
        }
      }
    } catch (error) {
      console.error('[CommunityDashboard] Error fetching owned communities:', error);
      setOwnedCommunities([]);
    } finally {
      setIsLoadingCommunities(false);
    }
  }, [isAuthenticated, user]);

  // Load communities on mount
  useEffect(() => {
    fetchOwnedCommunities();
  }, [fetchOwnedCommunities]);

  // Select a community
  const selectCommunity = useCallback((communityId: number) => {
    const community = ownedCommunities.find(c => c.id === communityId);
    if (community) {
      setSelectedCommunity(community);
      // Persist selection
      localStorage.setItem('selectedDashboardCommunity', communityId.toString());
    }
  }, [ownedCommunities]);

  // Restore selection from localStorage
  useEffect(() => {
    if (ownedCommunities.length > 0 && !selectedCommunity) {
      const savedId = localStorage.getItem('selectedDashboardCommunity');
      if (savedId) {
        const saved = ownedCommunities.find(c => c.id === parseInt(savedId));
        if (saved) {
          setSelectedCommunity(saved);
          return;
        }
      }
      // Default to first
      setSelectedCommunity(ownedCommunities[0]);
    }
  }, [ownedCommunities, selectedCommunity]);

  const value: CommunityDashboardContextType = {
    ownedCommunities,
    isLoadingCommunities,
    selectedCommunity,
    selectCommunity,
    refreshOwnedCommunities: fetchOwnedCommunities,
  };

  return (
    <CommunityDashboardContext.Provider value={value}>
      {children}
    </CommunityDashboardContext.Provider>
  );
}

export function useCommunityDashboard() {
  const context = useContext(CommunityDashboardContext);
  if (!context) {
    throw new Error('useCommunityDashboard must be used within CommunityDashboardProvider');
  }
  return context;
}
