import React, { useState, useEffect } from 'react';
import { Shield, AlertTriangle, CheckCircle, XCircle, Loader2, AlertCircle, Eye, EyeOff, Lock } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAIAgents } from '@/contexts/AIAgentContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtime } from '@/hooks/useRealtime';
import { socketService } from '@/services/socketService';

export default function ModerationAgent() {
  const { isDarkMode } = useTheme();
  const { moderateMessage, getModerationHistory, getModerationStats } = useAIAgents();
  const { user } = useAuth();
  const { currentCommunity, currentChannel } = useRealtime();
  
  const [isModeratingMessage, setIsModeratingMessage] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [testMessage, setTestMessage] = useState('');
  const [moderationResult, setModerationResult] = useState<any>(null);
  const [moderationHistory, setModerationHistory] = useState<any[]>([]);
  const [moderationStats, setModerationStats] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState<Record<number, boolean>>({});

  // Check if user is owner of current community
  const isOwner = currentCommunity?.role === 'owner';

  useEffect(() => {
    // Only load data if user is authenticated, community exists, and user is owner
    if (user && currentCommunity && isOwner) {
      loadModerationHistory();
      loadModerationStats();
    }
  }, [user, currentCommunity?.id, isOwner]); // Re-run when community or role changes

  // Listen for real-time moderation actions
  useEffect(() => {
    if (!currentCommunity || !isOwner) return;

    const unsubscribe = socketService.onModerationAction((data) => {
      console.log('[MODERATION] Real-time action received:', data);
      
      // Only refresh if it's for the current community
      if (data.community_id === currentCommunity.id) {
        console.log('[MODERATION] Refreshing logs for current community');
        loadModerationHistory();
        loadModerationStats();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [currentCommunity?.id, isOwner]);

  const loadModerationHistory = async () => {
    if (!currentCommunity) return;
    
    setIsLoadingHistory(true);
    try {
      const history = await getModerationHistory(currentCommunity.id, 10, currentChannel?.id);
      setModerationHistory(history);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const loadModerationStats = async () => {
    if (!currentCommunity) return;
    
    setIsLoadingStats(true);
    try {
      const stats = await getModerationStats(currentCommunity.id, 7, currentChannel?.id); // Last 7 days
      setModerationStats(stats);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoadingStats(false);
    }
  };

  // Show access denied if not owner
  if (!currentCommunity) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <AlertCircle className={`w-16 h-16 mx-auto mb-4 ${
            isDarkMode ? 'text-gray-600' : 'text-gray-400'
          }`} />
          <h3 className={`text-lg font-semibold mb-2 ${
            isDarkMode ? 'text-white' : 'text-gray-900'
          }`}>
            No Community Selected
          </h3>
          <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            Select a community to access moderation features.
          </p>
        </div>
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <Lock className={`w-16 h-16 mx-auto mb-4 ${
            isDarkMode ? 'text-gray-600' : 'text-gray-400'
          }`} />
          <h3 className={`text-lg font-semibold mb-2 ${
            isDarkMode ? 'text-white' : 'text-gray-900'
          }`}>
            Owner Access Required
          </h3>
          <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            Only community owners can access moderation features and logs.
          </p>
        </div>
      </div>
    );
  }

  const handleModerateMessage = async () => {
    if (!testMessage.trim()) return;
    
    setIsModeratingMessage(true);
    try {
      const result = await moderateMessage(testMessage);
      setModerationResult(result);
      await loadModerationHistory(); // Refresh history
      await loadModerationStats(); // Refresh stats
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsModeratingMessage(false);
    }
  };

  const getRiskLevelColor = (level: string) => {
    switch (level) {
      case 'high':
        return 'text-red-500 bg-red-100 border-red-200 dark:bg-red-900/30 dark:border-red-800';
      case 'medium':
        return 'text-yellow-500 bg-yellow-100 border-yellow-200 dark:bg-yellow-900/30 dark:border-yellow-800';
      case 'low':
        return 'text-green-500 bg-green-100 border-green-200 dark:bg-green-900/30 dark:border-green-800';
      default:
        return 'text-gray-500 bg-gray-100 border-gray-200 dark:bg-gray-900/30 dark:border-gray-800';
    }
  };

  const getModerationIcon = (action: string) => {
    switch (action) {
      case 'block':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'warn':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'allow':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      default:
        return <Shield className="w-4 h-4 text-gray-500" />;
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'block':
        return 'text-red-500';
      case 'warn':
        return 'text-yellow-500';
      case 'allow':
        return 'text-green-500';
      default:
        return 'text-gray-500';
    }
  };

  const toggleDetails = (index: number) => {
    setShowDetails(prev => ({ ...prev, [index]: !prev[index] }));
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className={`p-4 border-b ${isDarkMode ? 'border-slate-700' : 'border-gray-200'}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-red-500/20 rounded-lg">
            <Shield className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Content Moderation
            </h3>
            <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              AI-powered content filtering and safety analysis
            </p>
          </div>
        </div>

        {/* Quick Stats */}
        {moderationStats && (
          <div className="grid grid-cols-3 gap-3">
            <div className={`p-3 rounded-lg border ${
              isDarkMode ? 'bg-slate-800/50 border-slate-600' : 'bg-gray-50 border-gray-200'
            }`}>
              <div className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                {moderationStats.total_messages || 0}
              </div>
              <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Total Checked
              </div>
            </div>
            <div className={`p-3 rounded-lg border ${
              isDarkMode ? 'bg-slate-800/50 border-slate-600' : 'bg-gray-50 border-gray-200'
            }`}>
              <div className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                {moderationStats.flagged_messages || 0}
              </div>
              <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Flagged
              </div>
            </div>
            <div className={`p-3 rounded-lg border ${
              isDarkMode ? 'bg-slate-800/50 border-slate-600' : 'bg-gray-50 border-gray-200'
            }`}>
              <div className={`text-lg font-semibold ${
                moderationStats.flagged_messages > 0 ? 'text-red-500' : 'text-green-500'
              }`}>
                {moderationStats.total_messages > 0 
                  ? Math.round((moderationStats.flagged_messages / moderationStats.total_messages) * 100)
                  : 0
                }%
              </div>
              <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Risk Rate
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Error Display */}
        {error && (
          <div className={`m-4 p-3 rounded-lg border flex items-start gap-2 ${
            isDarkMode ? 'bg-red-900/20 border-red-800 text-red-400' : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            <AlertCircle className="w-5 h-5 mt-0.5" />
            <div>
              <h4 className="font-medium mb-1">Moderation Failed</h4>
              <p className="text-sm">{error}</p>
            </div>
          </div>
        )}

        {/* Message Moderation Tester */}
        <div className="p-4 border-b border-slate-700">
          <h4 className={`font-medium mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            Test Content Moderation
          </h4>
          
          <div className="space-y-3">
            <div>
              <textarea
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                placeholder="Type a message to check for inappropriate content, spam, or violations..."
                disabled={isModeratingMessage}
                className={`w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-red-500 resize-none ${
                  isDarkMode 
                    ? 'bg-slate-800 border-slate-600 text-white placeholder-gray-500' 
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                } disabled:opacity-50`}
                rows={3}
              />
            </div>
            
            <button
              onClick={handleModerateMessage}
              disabled={!testMessage.trim() || isModeratingMessage}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                !testMessage.trim() || isModeratingMessage
                  ? isDarkMode
                    ? 'bg-slate-700 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-red-600 text-white hover:bg-red-700'
              }`}
            >
              {isModeratingMessage ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Moderating...
                </>
              ) : (
                'Moderate Content'
              )}
            </button>

            {/* Moderation Result */}
            {moderationResult && moderationResult.analysis && (
              <div className={`p-4 rounded-lg border ${
                isDarkMode ? 'bg-slate-800/50 border-slate-600' : 'bg-gray-50 border-gray-200'
              }`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {getModerationIcon(moderationResult.analysis.recommended_action)}
                    <div>
                      <span className={`font-medium capitalize ${getActionColor(moderationResult.analysis.recommended_action)}`}>
                        {moderationResult.analysis.recommended_action}
                      </span>
                      <div className={`flex items-center gap-2 mt-1 ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}>
                        <span className={`px-2 py-0.5 rounded-full text-xs border ${
                          getRiskLevelColor(moderationResult.analysis.risk_level)
                        }`}>
                          {moderationResult.analysis.risk_level} risk
                        </span>
                        <span className="text-sm">
                          {Math.round(moderationResult.analysis.confidence_score * 100)}% confidence
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Violations */}
                {moderationResult.analysis.violations && moderationResult.analysis.violations.length > 0 && (
                  <div className="mb-3">
                    <h6 className={`text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Detected Violations
                    </h6>
                    <div className="space-y-2">
                      {moderationResult.analysis.violations.map((violation: any, index: number) => (
                        <div key={index} className={`p-2 rounded border ${
                          isDarkMode ? 'bg-red-900/20 border-red-800' : 'bg-red-50 border-red-200'
                        }`}>
                          <div className="flex items-center justify-between">
                            <span className={`text-sm font-medium ${isDarkMode ? 'text-red-400' : 'text-red-700'}`}>
                              {violation.type}
                            </span>
                            <span className={`text-xs ${isDarkMode ? 'text-red-500' : 'text-red-600'}`}>
                              {Math.round(violation.confidence * 100)}%
                            </span>
                          </div>
                          {violation.description && (
                            <div className={`text-xs mt-1 ${isDarkMode ? 'text-red-300' : 'text-red-600'}`}>
                              {violation.description}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Categories */}
                {moderationResult.analysis.flagged_categories && Object.keys(moderationResult.analysis.flagged_categories).length > 0 && (
                  <div className="mb-3">
                    <h6 className={`text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Category Scores
                    </h6>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(moderationResult.analysis.flagged_categories).map(([category, score]) => (
                        <div key={category} className={`p-2 rounded border ${
                          isDarkMode ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-200'
                        }`}>
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-medium capitalize ${
                              isDarkMode ? 'text-gray-300' : 'text-gray-700'
                            }`}>
                              {category.replace('_', ' ')}
                            </span>
                            <span className={`text-xs ${
                              (score as number) > 0.5 ? 'text-red-500' : 'text-gray-500'
                            }`}>
                              {Math.round((score as number) * 100)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Explanation */}
                {moderationResult.analysis.explanation && (
                  <div>
                    <h6 className={`text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Analysis
                    </h6>
                    <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      {moderationResult.analysis.explanation}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Moderation History */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h4 className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Recent Moderation Actions
            </h4>
            {isLoadingHistory && (
              <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
            )}
          </div>

          {moderationHistory.length === 0 && !isLoadingHistory ? (
            <div className="text-center py-8">
              <Shield className={`w-12 h-12 mx-auto mb-3 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`} />
              <h5 className={`font-medium mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                No Moderation History
              </h5>
              <p className={`text-sm ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                Content moderation logs will appear here
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {moderationHistory.map((entry, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg border ${
                    isDarkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      {getModerationIcon(entry.action)}
                      <div>
                        <div className={`font-medium capitalize ${getActionColor(entry.action)}`}>
                          {entry.action}
                        </div>
                        <div className={`flex items-center gap-2 text-xs ${
                          isDarkMode ? 'text-gray-400' : 'text-gray-600'
                        }`}>
                          <span className={`px-2 py-0.5 rounded-full border ${
                            getRiskLevelColor(entry.severity)
                          }`}>
                            {entry.severity}
                          </span>
                          <span>
                            {entry.confidence ? Math.round(entry.confidence * 100) : 0}% confidence
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleDetails(index)}
                        className={`p-1 rounded hover:bg-opacity-80 transition-colors ${
                          showDetails[index]
                            ? isDarkMode
                              ? 'bg-slate-700 text-slate-300'
                              : 'bg-gray-200 text-gray-700'
                            : isDarkMode
                            ? 'bg-slate-800 text-slate-400'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {showDetails[index] ? (
                          <EyeOff className="w-3 h-3" />
                        ) : (
                          <Eye className="w-3 h-3" />
                        )}
                      </button>
                      <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                        {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : 'N/A'}
                      </div>
                    </div>
                  </div>

                  {showDetails[index] && (
                    <div className={`mt-3 p-3 rounded border ${
                      isDarkMode ? 'bg-slate-900/50 border-slate-700' : 'bg-gray-50 border-gray-200'
                    }`}>
                      {/* Original Message */}
                      <div className="mb-3">
                        <h6 className={`text-sm font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          Content
                        </h6>
                        <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'} break-words`}>
                          {entry.message || 'Content hidden for privacy'}
                        </p>
                      </div>

                      {/* Violations */}
                      {entry.reasons && entry.reasons.length > 0 && (
                        <div className="mb-3">
                          <h6 className={`text-sm font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            Reasons
                          </h6>
                          <div className="flex flex-wrap gap-1">
                            {entry.reasons.map((reason: string, vIndex: number) => (
                              <span key={vIndex} className={`px-2 py-0.5 rounded-full text-xs ${
                                isDarkMode ? 'bg-red-900/30 text-red-400' : 'bg-red-100 text-red-700'
                              }`}>
                                {reason}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Explanation */}
                      {entry.explanation && (
                        <div>
                          <h6 className={`text-sm font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            Explanation
                          </h6>
                          <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            {entry.explanation}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}