import React, { useState, useCallback, useEffect } from 'react';
import { Home as HomeIcon, Plus, Search, AlertCircle } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useRealtime } from '@/hooks/useRealtime';
import CreateCommunityModal from '@/components/modals/CreateCommunityModal';
import JoinCommunityModal from '@/components/modals/JoinCommunityModal';
import { channelService } from '@/services/channelService';
import { useToast } from '@/hooks/use-toast';
import type { Community } from '@/types';

interface CommunityFormData {
  name: string;
  description: string;
  icon: string;
  color: string;
}

export default function Home() {
  const { isDarkMode } = useTheme();
  const { reloadCommunities, communities } = useRealtime();
  const { toast } = useToast();
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Log when component mounts and when communities change
  useEffect(() => {
    console.log('[HOME] Component mounted. Current communities:', communities);
  }, [communities]);

  const handleCreateCommunity = useCallback(
    async (data: CommunityFormData): Promise<Community> => {
      try {
        setApiError(null);
        const newCommunity = await channelService.createCommunity(data);
        // Do not reload or close here — modal will handle uploads then refresh/select
        toast({
          title: '✅ Community created',
          description: `Proceed to branding and uploads.`,
        });
        return newCommunity;
      } catch (error: any) {
        const errorMsg = error.message || 'Failed to create community';
        setApiError(errorMsg);
        toast({
          title: '❌ Error',
          description: errorMsg,
          variant: 'destructive',
        });
        throw error;
      }
    },
    [toast]
  );

  const handleDiscoverCommunities = useCallback(
    async (search: string, limit: number, offset: number): Promise<Community[]> => {
      try {
        setApiError(null);
        const communities = await channelService.discoverCommunities(search, limit, offset);
        return communities;
      } catch (error: any) {
        const errorMsg = error.message || 'Failed to discover communities';
        console.error('[HOME] Discovery error:', errorMsg);
        setApiError(errorMsg);
        return [];
      }
    },
    []
  );

  const handleJoinCommunity = useCallback(
    async (communityId: number) => {
      try {
        setApiError(null);
        await channelService.joinCommunity(communityId);
        toast({
          title: '✅ Success',
          description: 'You have joined the community!',
        });
        setShowJoinModal(false);
        // Reload communities to update the list
        await reloadCommunities();
      } catch (error: any) {
        const errorMsg = error.message || 'Failed to join community';
        
        // Differentiate between "blocked" and other errors
        if (errorMsg.includes('blocked')) {
          setApiError('You are blocked from this community. Please contact the community owner.');
        } else if (errorMsg.includes('already a member')) {
          setApiError('You are already a member of this community!');
        } else {
          setApiError(errorMsg);
        }
        
        toast({
          title: '❌ Error',
          description: errorMsg,
          variant: 'destructive',
        });
      }
    },
    [toast, reloadCommunities]
  );

  return (
    <div className={`flex-1 flex flex-col items-center justify-center p-6 overflow-y-auto ${
      isDarkMode ? 'bg-slate-900' : 'bg-gray-50'
    }`}>
      <div className="max-w-2xl w-full">
        {/* API Error Display */}
        {apiError && (
          <div className={`mb-6 p-4 rounded-lg border flex items-start gap-3 ${
            isDarkMode
              ? 'bg-red-900/20 border-red-700 text-red-400'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium mb-1">Unable to complete action</p>
              <p className="text-sm">{apiError}</p>
            </div>
          </div>
        )}

        {/* Icon & Header */}
        <div className="text-center mb-12">
          <div className={`inline-flex p-4 rounded-full mb-6 ${
            isDarkMode ? 'bg-blue-500/10' : 'bg-blue-50'
          }`}>
            <HomeIcon className={`w-16 h-16 ${
              isDarkMode ? 'text-blue-400' : 'text-blue-600'
            }`} />
          </div>

          <h1 className={`text-4xl font-bold mb-3 ${
            isDarkMode ? 'text-white' : 'text-gray-900'
          }`}>
            Welcome to AuroFlow
          </h1>

          <p className={`text-lg mb-2 ${
            isDarkMode ? 'text-gray-300' : 'text-gray-700'
          }`}>
            You haven't joined any communities yet.
          </p>
          <p className={`text-base ${
            isDarkMode ? 'text-gray-400' : 'text-gray-600'
          }`}>
            Create your own community or explore and join existing ones to get started.
          </p>
          <p className={`text-sm mt-4 ${
            isDarkMode ? 'text-gray-500' : 'text-gray-500'
          }`}>
            💬 You can still chat with your friends using the sidebar!
          </p>
        </div>

        {/* Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Create Community Card */}
          <button
            onClick={() => setShowCreateModal(true)}
            className={`p-8 rounded-xl border-2 transition-all hover:scale-105 ${
              isDarkMode
                ? 'bg-slate-800 border-blue-500/30 hover:border-blue-500/60 hover:bg-slate-700'
                : 'bg-white border-blue-200 hover:border-blue-400 hover:bg-blue-50'
            }`}
          >
            <div className={`inline-flex p-3 rounded-lg mb-4 ${
              isDarkMode ? 'bg-blue-500/10' : 'bg-blue-100'
            }`}>
              <Plus className={`w-8 h-8 ${
                isDarkMode ? 'text-blue-400' : 'text-blue-600'
              }`} />
            </div>
            <h3 className={`text-xl font-semibold mb-2 ${
              isDarkMode ? 'text-white' : 'text-gray-900'
            }`}>
              Create Community
            </h3>
            <p className={`text-sm ${
              isDarkMode ? 'text-gray-400' : 'text-gray-600'
            }`}>
              Build your own community and invite members to collaborate.
            </p>
          </button>

          {/* Explore Communities Card */}
          <button
            onClick={() => setShowJoinModal(true)}
            className={`p-8 rounded-xl border-2 transition-all hover:scale-105 ${
              isDarkMode
                ? 'bg-slate-800 border-purple-500/30 hover:border-purple-500/60 hover:bg-slate-700'
                : 'bg-white border-purple-200 hover:border-purple-400 hover:bg-purple-50'
            }`}
          >
            <div className={`inline-flex p-3 rounded-lg mb-4 ${
              isDarkMode ? 'bg-purple-500/10' : 'bg-purple-100'
            }`}>
              <Search className={`w-8 h-8 ${
                isDarkMode ? 'text-purple-400' : 'text-purple-600'
              }`} />
            </div>
            <h3 className={`text-xl font-semibold mb-2 ${
              isDarkMode ? 'text-white' : 'text-gray-900'
            }`}>
              Explore Communities
            </h3>
            <p className={`text-sm ${
              isDarkMode ? 'text-gray-400' : 'text-gray-600'
            }`}>
              Discover and join communities that match your interests.
            </p>
          </button>
        </div>
      </div>

      {/* Modals */}
      <CreateCommunityModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreateCommunity={handleCreateCommunity}
      />

      <JoinCommunityModal
        isOpen={showJoinModal}
        onClose={() => setShowJoinModal(false)}
        onJoinCommunity={handleJoinCommunity}
        onDiscoverCommunities={handleDiscoverCommunities}
      />
    </div>
  );
}
