import React, { useState, useEffect } from 'react';
import { Brain, MessageSquare, Users, Clock, FileText, Loader2, AlertCircle, Download, Sparkles, BarChart3, ArrowLeft } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAIAgents } from '@/contexts/AIAgentContext';
import { useRealtime } from '@/hooks/useRealtime';
import { SummaryResult } from '@/services/aiAgentService';
import { useNavigate } from 'react-router-dom';

export default function SummarizerAgent() {
  const { isDarkMode, currentTheme } = useTheme();
  const isBasicTheme = currentTheme === 'basic';
  const { generateSummary, getChannelSummaries, summaries } = useAIAgents();
  const { currentChannel } = useRealtime();
  const navigate = useNavigate();
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingSummaries, setIsLoadingSummaries] = useState(false);
  const [messageCount, setMessageCount] = useState(100);
  const [selectedSummary, setSelectedSummary] = useState<SummaryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const channelSummaries = currentChannel ? (summaries[currentChannel.id] || []) : [];

  useEffect(() => {
    if (currentChannel) {
      loadExistingSummaries();
    }
  }, [currentChannel]);

  const loadExistingSummaries = async () => {
    if (!currentChannel) return;
    
    setIsLoadingSummaries(true);
    try {
      await getChannelSummaries(currentChannel.id);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoadingSummaries(false);
    }
  };

  const handleGenerateSummary = async () => {
    if (!currentChannel) return;
    
    setIsGenerating(true);
    setError(null);
    
    try {
      const result = await generateSummary(currentChannel.id, messageCount);
      setSelectedSummary(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const formatCreatedAt = (createdAt: string | undefined) => {
    if (!createdAt) return 'Just now';
    
    try {
      const date = new Date(createdAt);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);
      
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      
      return date.toLocaleDateString();
    } catch {
      return 'Just now';
    }
  };

  if (!currentChannel) {
    return (
      <div className="h-full flex flex-col bg-[hsl(var(--theme-bg-primary))]">
        {/* Header with back button */}
        <div className="flex-shrink-0 p-4 border-b border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-header-bg))]">
          <button 
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-sm text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </div>
        
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <div className={`w-20 h-20 mx-auto mb-6 ${isBasicTheme ? 'rounded-lg bg-blue-500/15' : 'rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20'} flex items-center justify-center border border-blue-500/30`}>
              <Brain className="w-10 h-10 text-blue-400" />
            </div>
            <h3 className="text-xl font-bold mb-3 text-[hsl(var(--theme-text-primary))]">
              Summarizer Agent
            </h3>
            <p className="text-sm text-[hsl(var(--theme-text-muted))] leading-relaxed">
              Select a channel to generate intelligent conversation summaries powered by AI
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[hsl(var(--theme-bg-primary))]">
      {/* Header */}
      <div className="flex-shrink-0 p-5 border-b border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-header-bg))]">
        <div className="flex items-center gap-2 mb-4">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3 flex-1">
            <div className={`p-2.5 ${isBasicTheme ? 'rounded-md bg-blue-500/15' : 'rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20'} border border-blue-500/30`}>
              <Brain className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="font-bold text-[hsl(var(--theme-text-primary))]">
                Conversation Summarizer
              </h3>
              <p className="text-sm text-[hsl(var(--theme-text-muted))]">
                Generate AI summaries of #{currentChannel.name}
              </p>
            </div>
          </div>
        </div>

        {/* Generate Summary Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 flex-1">
            <label className="text-sm font-medium text-[hsl(var(--theme-text-secondary))]">
              Messages:
            </label>
            <select
              value={messageCount}
              onChange={(e) => setMessageCount(Number(e.target.value))}
              disabled={isGenerating}
              className="px-3 py-2 rounded-xl text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[hsl(var(--theme-input-bg))] border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))] disabled:opacity-50 transition-all"
            >
              <option value={50}>50 messages</option>
              <option value={100}>100 messages</option>
              <option value={150}>150 messages</option>
              <option value={200}>200 messages</option>
            </select>
          </div>
          
          <button
            onClick={handleGenerateSummary}
            disabled={isGenerating}
            className={`flex items-center gap-2 px-5 py-2.5 ${isBasicTheme ? 'rounded-md bg-blue-600 hover:bg-blue-700' : 'rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 hover:shadow-[0_0_20px_rgba(59,130,246,0.4)]'} text-sm font-semibold transition-all duration-300 text-white disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none`}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Generate
              </>
            )}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'hsl(var(--theme-bg-tertiary)) transparent' }}>
        {/* Error Display */}
        {error && (
          <div className="m-4 p-4 rounded-xl border flex items-start gap-3 bg-red-500/10 border-red-500/30">
            <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-semibold text-red-400 mb-1">Generation Failed</h4>
              <p className="text-sm text-red-400/80">{error}</p>
            </div>
          </div>
        )}

        {/* Current Summary Display */}
        {selectedSummary && (
          <div className="p-5 border-b border-[hsl(var(--theme-border-default))]">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-[hsl(var(--theme-text-primary))] flex items-center gap-2">
                <FileText className="w-4 h-4 text-[hsl(var(--theme-accent-primary))]" />
                Latest Summary
              </h4>
              <div className="flex items-center gap-2 text-xs text-[hsl(var(--theme-text-muted))]">
                <Clock className="w-3.5 h-3.5" />
                {formatCreatedAt(selectedSummary.created_at)}
              </div>
            </div>

            {/* Summary Metadata */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="p-4 rounded-xl bg-[hsl(var(--theme-bg-secondary))] border border-[hsl(var(--theme-border-default))]">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/20">
                    <MessageSquare className="w-4 h-4 text-blue-400" />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-[hsl(var(--theme-text-primary))]">
                      {selectedSummary.message_count}
                    </div>
                    <div className="text-xs text-[hsl(var(--theme-text-muted))]">
                      Messages
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-4 rounded-xl bg-[hsl(var(--theme-bg-secondary))] border border-[hsl(var(--theme-border-default))]">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/20">
                    <Users className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-[hsl(var(--theme-text-primary))]">
                      {selectedSummary.participants?.length || 0}
                    </div>
                    <div className="text-xs text-[hsl(var(--theme-text-muted))]">
                      Participants
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Summary Text */}
            <div className="p-4 rounded-xl bg-[hsl(var(--theme-bg-secondary))] border border-[hsl(var(--theme-border-default))]">
              <div className="text-sm leading-relaxed whitespace-pre-line text-[hsl(var(--theme-text-secondary))]">
                {selectedSummary.summary}
              </div>
            </div>

            {/* Participants */}
            {selectedSummary.participants && selectedSummary.participants.length > 0 && (
              <div className="mt-4">
                <h5 className="text-sm font-medium mb-3 text-[hsl(var(--theme-text-secondary))] flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Participants ({selectedSummary.participants.length})
                </h5>
                <div className="flex flex-wrap gap-2">
                  {selectedSummary.participants.map((participant, index) => (
                    <span 
                      key={index} 
                      className="px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-secondary))] border border-[hsl(var(--theme-border-default))]"
                    >
                      <div className="w-2 h-2 rounded-full bg-emerald-400" />
                      {participant}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Recent Summaries */}
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold text-[hsl(var(--theme-text-primary))] flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[hsl(var(--theme-accent-primary))]" />
              Recent Summaries
            </h4>
            {isLoadingSummaries && (
              <Loader2 className="w-4 h-4 animate-spin text-[hsl(var(--theme-text-muted))]" />
            )}
          </div>

          {channelSummaries.length === 0 && !isLoadingSummaries ? (
            <div className="text-center py-12 px-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[hsl(var(--theme-bg-secondary))] flex items-center justify-center border border-[hsl(var(--theme-border-default))]">
                <FileText className="w-8 h-8 text-[hsl(var(--theme-text-muted))]" />
              </div>
              <h5 className="font-medium mb-2 text-[hsl(var(--theme-text-secondary))]">
                No Summaries Yet
              </h5>
              <p className="text-sm text-[hsl(var(--theme-text-muted))]">
                Generate your first conversation summary
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {channelSummaries.map((summary, index) => (
                <button
                  key={summary?.summary_id || index}
                  onClick={() => setSelectedSummary(summary)}
                  className={`w-full text-left p-4 rounded-xl border transition-all duration-300 hover:shadow-lg ${
                    selectedSummary?.summary_id === summary?.summary_id
                      ? 'bg-[hsl(var(--theme-accent-primary)/0.1)] border-[hsl(var(--theme-accent-primary)/0.5)] shadow-[0_0_20px_hsl(var(--theme-accent-primary)/0.15)]'
                      : 'bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))] hover:border-[hsl(var(--theme-border-hover))]'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="text-xs font-medium px-2.5 py-1 rounded-lg bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-secondary))]">
                      Recent messages
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="flex items-center gap-1.5 text-[hsl(var(--theme-text-muted))]">
                        <MessageSquare className="w-3 h-3" />
                        {summary?.message_count || 0} messages
                      </span>
                      <span className="flex items-center gap-1.5 text-[hsl(var(--theme-text-muted))]">
                        <Users className="w-3 h-3" />
                        {summary?.participants?.length || 0} people
                      </span>
                    </div>
                  </div>
                  <p className="text-sm line-clamp-3 leading-relaxed text-[hsl(var(--theme-text-secondary))]">
                    {summary?.summary || 'No summary available'}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}