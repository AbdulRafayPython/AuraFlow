import React, { useState, useEffect } from 'react';
import { Shield, AlertTriangle, CheckCircle, XCircle, Loader2, AlertCircle, Eye, EyeOff, Lock, Activity, Zap } from 'lucide-react';
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
      const history = await getModerationHistory(currentCommunity.id, currentChannel?.id, 50);
      console.log('[ModerationAgent] Loaded history:', history);
      setModerationHistory(history);
      setError(null);
    } catch (err: any) {
      console.error('[ModerationAgent] Error loading history:', err);
      setError(err.message);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const loadModerationStats = async () => {
    if (!currentCommunity) return;
    
    setIsLoadingStats(true);
    try {
      const stats = await getModerationStats(currentCommunity.id, 7, currentChannel?.id);
      console.log('[ModerationAgent] Loaded stats:', stats);
      setModerationStats(stats);
      setError(null);
    } catch (err: any) {
      console.error('[ModerationAgent] Error loading stats:', err);
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
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-[hsl(var(--theme-bg-secondary))] flex items-center justify-center border border-[hsl(var(--theme-border-default))]">
            <AlertCircle className="w-10 h-10 text-[hsl(var(--theme-text-muted))]" />
          </div>
          <h3 className="text-xl font-semibold mb-3 text-[hsl(var(--theme-text-primary))]">
            No Community Selected
          </h3>
          <p className="text-sm text-[hsl(var(--theme-text-muted))]">
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
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center border border-amber-500/30">
            <Lock className="w-10 h-10 text-amber-400" />
          </div>
          <h3 className="text-xl font-semibold mb-3 text-[hsl(var(--theme-text-primary))]">
            Owner Access Required
          </h3>
          <p className="text-sm text-[hsl(var(--theme-text-muted))]">
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
        return 'text-red-400 bg-red-500/20 border-red-500/30';
      case 'medium':
        return 'text-amber-400 bg-amber-500/20 border-amber-500/30';
      case 'low':
        return 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30';
      default:
        return 'text-[hsl(var(--theme-text-muted))] bg-[hsl(var(--theme-bg-tertiary))] border-[hsl(var(--theme-border-default))]';
    }
  };

  const getModerationIcon = (action: string) => {
    switch (action) {
      case 'block':
        return <XCircle className="w-4 h-4 text-red-400" />;
      case 'warn':
        return <AlertTriangle className="w-4 h-4 text-amber-400" />;
      case 'allow':
        return <CheckCircle className="w-4 h-4 text-emerald-400" />;
      default:
        return <Shield className="w-4 h-4 text-[hsl(var(--theme-text-muted))]" />;
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'block':
        return 'text-red-400';
      case 'warn':
        return 'text-amber-400';
      case 'allow':
        return 'text-emerald-400';
      default:
        return 'text-[hsl(var(--theme-text-muted))]';
    }
  };

  const toggleDetails = (index: number) => {
    setShowDetails(prev => ({ ...prev, [index]: !prev[index] }));
  };

  return (
    <div className="h-full flex flex-col bg-[hsl(var(--theme-bg-primary))]">
      {/* Header */}
      <div className="p-5 border-b border-[hsl(var(--theme-border-default))] relative overflow-hidden">
        {/* Gradient accent line at top */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-500 via-orange-500 to-amber-500" />
        
        <div className="flex items-center gap-4 mb-5">
          <div className="relative">
            <div className="p-3 bg-gradient-to-br from-red-500/20 to-orange-500/20 rounded-xl border border-red-500/30">
              <Shield className="w-6 h-6 text-red-400" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[hsl(var(--theme-bg-primary))]" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-[hsl(var(--theme-text-primary))] flex items-center gap-2">
              Content Moderation
              <Zap className="w-4 h-4 text-amber-400" />
            </h3>
            <p className="text-sm text-[hsl(var(--theme-text-muted))]">
              AI-powered content filtering and safety analysis
            </p>
          </div>
        </div>

        {/* Quick Stats */}
        {moderationStats && (
          <div className="grid grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-[hsl(var(--theme-bg-secondary))] border border-[hsl(var(--theme-border-default))] hover:border-[hsl(var(--theme-border-hover))] transition-all duration-300">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/20">
                  <Activity className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <div className="text-lg font-bold text-[hsl(var(--theme-text-primary))]">
                    {moderationStats.total_messages || 0}
                  </div>
                  <div className="text-xs text-[hsl(var(--theme-text-muted))]">
                    Total Checked
                  </div>
                </div>
              </div>
            </div>
            <div className="p-4 rounded-xl bg-[hsl(var(--theme-bg-secondary))] border border-[hsl(var(--theme-border-default))] hover:border-[hsl(var(--theme-border-hover))] transition-all duration-300">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-500/20">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                </div>
                <div>
                  <div className="text-lg font-bold text-[hsl(var(--theme-text-primary))]">
                    {moderationStats.flagged_messages || 0}
                  </div>
                  <div className="text-xs text-[hsl(var(--theme-text-muted))]">
                    Flagged
                  </div>
                </div>
              </div>
            </div>
            <div className="p-4 rounded-xl bg-[hsl(var(--theme-bg-secondary))] border border-[hsl(var(--theme-border-default))] hover:border-[hsl(var(--theme-border-hover))] transition-all duration-300">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${moderationStats.flagged_messages > 0 ? 'bg-red-500/20' : 'bg-emerald-500/20'}`}>
                  <Shield className={`w-4 h-4 ${moderationStats.flagged_messages > 0 ? 'text-red-400' : 'text-emerald-400'}`} />
                </div>
                <div>
                  <div className={`text-lg font-bold ${
                    moderationStats.flagged_messages > 0 ? 'text-red-400' : 'text-emerald-400'
                  }`}>
                    {moderationStats.total_messages > 0 
                      ? Math.round((moderationStats.flagged_messages / moderationStats.total_messages) * 100)
                      : 0
                    }%
                  </div>
                  <div className="text-xs text-[hsl(var(--theme-text-muted))]">
                    Risk Rate
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'hsl(var(--theme-bg-tertiary)) transparent' }}>
        {/* Error Display */}
        {error && (
          <div className="m-5 p-4 rounded-xl border flex items-start gap-3 bg-red-500/10 border-red-500/30">
            <div className="p-2 rounded-lg bg-red-500/20">
              <AlertCircle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h4 className="font-medium mb-1 text-red-400">Moderation Failed</h4>
              <p className="text-sm text-red-300/80">{error}</p>
            </div>
          </div>
        )}

        {/* Message Moderation Tester */}
        <div className="p-5 border-b border-[hsl(var(--theme-border-default))]">
          <h4 className="font-semibold mb-4 text-[hsl(var(--theme-text-primary))] flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            Test Content Moderation
          </h4>
          
          <div className="space-y-4">
            <div>
              <textarea
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                placeholder="Type a message to check for inappropriate content, spam, or violations..."
                disabled={isModeratingMessage}
                className="w-full px-4 py-3 rounded-xl text-sm border focus:outline-none focus:ring-2 focus:ring-red-500/50 resize-none bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))] placeholder:text-[hsl(var(--theme-text-muted))] disabled:opacity-50 transition-all duration-300"
                rows={3}
              />
            </div>
            
            <button
              onClick={handleModerateMessage}
              disabled={!testMessage.trim() || isModeratingMessage}
              className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 flex items-center gap-2 ${
                !testMessage.trim() || isModeratingMessage
                  ? 'bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-muted))] cursor-not-allowed'
                  : 'bg-gradient-to-r from-red-500 to-orange-500 text-white hover:shadow-lg hover:shadow-red-500/25'
              }`}
            >
              {isModeratingMessage ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Moderating...
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4" />
                  Moderate Content
                </>
              )}
            </button>

            {/* Moderation Result */}
            {moderationResult && moderationResult.analysis && (
              <div className="p-5 rounded-xl bg-[hsl(var(--theme-bg-secondary))] border border-[hsl(var(--theme-border-default))]">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${
                      moderationResult.analysis.recommended_action === 'block' ? 'bg-red-500/20' :
                      moderationResult.analysis.recommended_action === 'warn' ? 'bg-amber-500/20' : 'bg-emerald-500/20'
                    }`}>
                      {getModerationIcon(moderationResult.analysis.recommended_action)}
                    </div>
                    <div>
                      <span className={`font-semibold capitalize ${getActionColor(moderationResult.analysis.recommended_action)}`}>
                        {moderationResult.analysis.recommended_action}
                      </span>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`px-2.5 py-1 rounded-lg text-xs border font-medium ${
                          getRiskLevelColor(moderationResult.analysis.risk_level)
                        }`}>
                          {moderationResult.analysis.risk_level} risk
                        </span>
                        <span className="text-sm text-[hsl(var(--theme-text-muted))]">
                          {Math.round(moderationResult.analysis.confidence_score * 100)}% confidence
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Violations */}
                {moderationResult.analysis.violations && moderationResult.analysis.violations.length > 0 && (
                  <div className="mb-4">
                    <h6 className="text-sm font-medium mb-3 text-[hsl(var(--theme-text-secondary))]">
                      Detected Violations
                    </h6>
                    <div className="space-y-2">
                      {moderationResult.analysis.violations.map((violation: any, index: number) => (
                        <div key={index} className="p-3 rounded-lg border bg-red-500/10 border-red-500/30">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-red-400">
                              {violation.type}
                            </span>
                            <span className="text-xs text-red-400/80 font-medium">
                              {Math.round(violation.confidence * 100)}%
                            </span>
                          </div>
                          {violation.description && (
                            <div className="text-xs mt-1.5 text-red-300/70">
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
                  <div className="mb-4">
                    <h6 className="text-sm font-medium mb-3 text-[hsl(var(--theme-text-secondary))]">
                      Category Scores
                    </h6>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(moderationResult.analysis.flagged_categories).map(([category, score]) => (
                        <div key={category} className="p-3 rounded-lg border bg-[hsl(var(--theme-bg-tertiary))] border-[hsl(var(--theme-border-default))]">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium capitalize text-[hsl(var(--theme-text-secondary))]">
                              {category.replace('_', ' ')}
                            </span>
                            <span className={`text-xs font-medium ${
                              (score as number) > 0.5 ? 'text-red-400' : 'text-[hsl(var(--theme-text-muted))]'
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
                    <h6 className="text-sm font-medium mb-2 text-[hsl(var(--theme-text-secondary))]">
                      Analysis
                    </h6>
                    <p className="text-sm text-[hsl(var(--theme-text-muted))]">
                      {moderationResult.analysis.explanation}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Moderation History */}
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold text-[hsl(var(--theme-text-primary))] flex items-center gap-2">
              <Activity className="w-4 h-4 text-[hsl(var(--theme-accent-primary))]" />
              Recent Moderation Actions
            </h4>
            {isLoadingHistory && (
              <Loader2 className="w-4 h-4 animate-spin text-[hsl(var(--theme-text-muted))]" />
            )}
          </div>

          {moderationHistory.length === 0 && !isLoadingHistory ? (
            <div className="text-center py-12 px-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[hsl(var(--theme-bg-secondary))] flex items-center justify-center border border-[hsl(var(--theme-border-default))]">
                <Shield className="w-8 h-8 text-[hsl(var(--theme-text-muted))]" />
              </div>
              <h5 className="font-medium mb-2 text-[hsl(var(--theme-text-secondary))]">
                No Moderation History
              </h5>
              <p className="text-sm text-[hsl(var(--theme-text-muted))]">
                Content moderation logs will appear here
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {moderationHistory.map((entry, index) => (
                <div
                  key={index}
                  className="p-4 rounded-xl border bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))] hover:border-[hsl(var(--theme-border-hover))] transition-all duration-300"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        entry.action === 'block' ? 'bg-red-500/20' :
                        entry.action === 'warn' ? 'bg-amber-500/20' : 'bg-emerald-500/20'
                      }`}>
                        {getModerationIcon(entry.action)}
                      </div>
                      <div>
                        <div className={`font-medium capitalize ${getActionColor(entry.action)}`}>
                          {entry.action}
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className={`px-2 py-0.5 rounded-lg border font-medium ${
                            getRiskLevelColor(entry.severity)
                          }`}>
                            {entry.severity}
                          </span>
                          <span className="text-[hsl(var(--theme-text-muted))]">
                            {entry.confidence ? Math.round(entry.confidence * 100) : 0}% confidence
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleDetails(index)}
                        className={`p-2 rounded-lg transition-all duration-300 ${
                          showDetails[index]
                            ? 'bg-[hsl(var(--theme-accent-primary)/0.1)] text-[hsl(var(--theme-accent-primary))]'
                            : 'bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-secondary))]'
                        }`}
                      >
                        {showDetails[index] ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <div className="text-xs text-[hsl(var(--theme-text-muted))]">
                        {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : 'N/A'}
                      </div>
                    </div>
                  </div>

                  {showDetails[index] && (
                    <div className="mt-4 p-4 rounded-xl border bg-[hsl(var(--theme-bg-tertiary))] border-[hsl(var(--theme-border-default))]">
                      {/* Original Message */}
                      <div className="mb-4">
                        <h6 className="text-sm font-medium mb-2 text-[hsl(var(--theme-text-secondary))]">
                          Content
                        </h6>
                        <p className="text-sm text-[hsl(var(--theme-text-muted))] break-words">
                          {entry.message || 'Content hidden for privacy'}
                        </p>
                      </div>

                      {/* Violations */}
                      {entry.reasons && entry.reasons.length > 0 && (
                        <div className="mb-4">
                          <h6 className="text-sm font-medium mb-2 text-[hsl(var(--theme-text-secondary))]">
                            Reasons
                          </h6>
                          <div className="flex flex-wrap gap-2">
                            {entry.reasons.map((reason: string, vIndex: number) => (
                              <span key={vIndex} className="px-2.5 py-1 rounded-lg text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30">
                                {reason}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Explanation */}
                      {entry.explanation && (
                        <div>
                          <h6 className="text-sm font-medium mb-2 text-[hsl(var(--theme-text-secondary))]">
                            Explanation
                          </h6>
                          <p className="text-sm text-[hsl(var(--theme-text-muted))]">
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