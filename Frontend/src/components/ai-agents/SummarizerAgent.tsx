import React, { useState, useEffect } from 'react';
import { Brain, MessageSquare, Users, Clock, FileText, Loader2, AlertCircle, Sparkles, BarChart3, ArrowLeft, Timer, Play, Settings2, CalendarClock, Zap } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAIAgents } from '@/contexts/AIAgentContext';
import { useRealtime } from '@/hooks/useRealtime';
import { SummaryResult } from '@/services/aiAgentService';
import { useNavigate } from 'react-router-dom';

export default function SummarizerAgent() {
  const { isDarkMode, currentTheme } = useTheme();
  const isBasicTheme = currentTheme === 'basic';
  const { generateSummary, getChannelSummaries, summaries, configureCommunityAgent, getSummarizerSchedule, triggerAutoSummarize } = useAIAgents();
  const { currentChannel, currentCommunity } = useRealtime();
  const navigate = useNavigate();
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingSummaries, setIsLoadingSummaries] = useState(false);
  const [messageCount, setMessageCount] = useState(100);
  const [selectedSummary, setSelectedSummary] = useState<SummaryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Scheduler state
  const [showScheduleConfig, setShowScheduleConfig] = useState(false);
  const [autoSummarizeEnabled, setAutoSummarizeEnabled] = useState(false);
  const [scheduleTime, setScheduleTime] = useState('21:00');
  const [autoMessageCount, setAutoMessageCount] = useState(200);
  const [lastAutoSummaryDate, setLastAutoSummaryDate] = useState('');
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [isTriggering, setIsTriggering] = useState(false);
  const [scheduleSuccess, setScheduleSuccess] = useState<string | null>(null);

  const channelSummaries = currentChannel ? (summaries[currentChannel.id] || []) : [];

  const isAdmin = currentCommunity?.role === 'owner' || currentCommunity?.role === 'admin';

  useEffect(() => {
    if (currentChannel) {
      loadExistingSummaries();
    }
  }, [currentChannel]);

  // Load scheduler settings for admins
  useEffect(() => {
    if (currentCommunity?.id && isAdmin) {
      loadScheduleSettings();
    }
  }, [currentCommunity?.id, isAdmin]);

  const loadScheduleSettings = async () => {
    if (!currentCommunity?.id) return;
    try {
      const data = await getSummarizerSchedule(currentCommunity.id);
      setAutoSummarizeEnabled(data.auto_summarize_enabled || false);
      setScheduleTime(data.schedule_time || '21:00');
      setAutoMessageCount(data.auto_summarize_message_count || 200);
      setLastAutoSummaryDate(data.last_auto_summary_date || '');
    } catch {
      // Agent may not be installed — that's fine
    }
  };

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

  const handleSaveSchedule = async () => {
    if (!currentCommunity?.id) return;
    setIsSavingSchedule(true);
    setScheduleSuccess(null);
    setError(null);

    try {
      await configureCommunityAgent(currentCommunity.id, 'summarizer', {
        auto_summarize_enabled: autoSummarizeEnabled,
        schedule_time: scheduleTime,
        auto_summarize_message_count: autoMessageCount,
      });
      setScheduleSuccess('Schedule saved successfully!');
      setTimeout(() => setScheduleSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const handleTriggerNow = async () => {
    if (!currentCommunity?.id) return;
    setIsTriggering(true);
    setError(null);

    try {
      const result = await triggerAutoSummarize(currentCommunity.id);
      setScheduleSuccess(`Auto-summarize complete! ${result.channels_processed} channels processed.`);
      setTimeout(() => setScheduleSuccess(null), 5000);
      // Reload summaries for current channel
      if (currentChannel) {
        await getChannelSummaries(currentChannel.id);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsTriggering(false);
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

  const formatScheduleTime = (time24: string) => {
    try {
      const [h, m] = time24.split(':').map(Number);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
    } catch {
      return time24;
    }
  };

  if (!currentChannel) {
    return (
      <div className="h-full flex flex-col bg-[hsl(var(--theme-bg-primary))]">
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

          {/* Schedule Config Toggle (admins only) */}
          {isAdmin && (
            <button
              onClick={() => setShowScheduleConfig(!showScheduleConfig)}
              className={`p-2.5 rounded-xl border transition-all duration-300 ${
                showScheduleConfig
                  ? 'bg-[hsl(var(--theme-accent-primary)/0.15)] border-[hsl(var(--theme-accent-primary)/0.5)] text-[hsl(var(--theme-accent-primary))]'
                  : 'bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))] hover:border-[hsl(var(--theme-border-hover))]'
              }`}
              title="Schedule Settings"
            >
              <CalendarClock className="w-5 h-5" />
            </button>
          )}
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

        {/* ── Scheduler Config Panel (admins only) ────────────────── */}
        {showScheduleConfig && isAdmin && (
          <div className="m-4 p-5 rounded-2xl border bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))]">
            <div className="flex items-center gap-3 mb-5">
              <div className={`p-2.5 ${isBasicTheme ? 'rounded-md' : 'rounded-xl'} bg-purple-500/15 border border-purple-500/30`}>
                <Timer className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h4 className="font-bold text-[hsl(var(--theme-text-primary))]">Auto-Summarize Scheduler</h4>
                <p className="text-xs text-[hsl(var(--theme-text-muted))]">
                  Automatically summarize all channels and post as a bot message
                </p>
              </div>
            </div>

            {/* Enable Toggle */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-[hsl(var(--theme-bg-tertiary))] border border-[hsl(var(--theme-border-default))] mb-4">
              <div>
                <div className="text-sm font-medium text-[hsl(var(--theme-text-primary))]">
                  Enable Auto-Summarize
                </div>
                <div className="text-xs text-[hsl(var(--theme-text-muted))] mt-0.5">
                  Summarizer will run daily at the scheduled time
                </div>
              </div>
              <button
                onClick={() => setAutoSummarizeEnabled(!autoSummarizeEnabled)}
                className={`relative w-12 h-7 rounded-full transition-all duration-300 ${
                  autoSummarizeEnabled
                    ? 'bg-purple-500 shadow-[0_0_12px_rgba(168,85,247,0.4)]'
                    : 'bg-[hsl(var(--theme-bg-primary))] border border-[hsl(var(--theme-border-default))]'
                }`}
              >
                <span className={`absolute top-1 w-5 h-5 rounded-full transition-all duration-300 ${
                  autoSummarizeEnabled
                    ? 'left-6 bg-white'
                    : 'left-1 bg-[hsl(var(--theme-text-muted))]'
                }`} />
              </button>
            </div>

            {/* Schedule Time */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-[hsl(var(--theme-text-secondary))] mb-2">
                  <Clock className="w-3.5 h-3.5 inline mr-1.5" />
                  Schedule Time (UTC)
                </label>
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-sm border focus:outline-none focus:ring-2 focus:ring-purple-500 bg-[hsl(var(--theme-input-bg))] border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))] transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[hsl(var(--theme-text-secondary))] mb-2">
                  <MessageSquare className="w-3.5 h-3.5 inline mr-1.5" />
                  Messages to Analyze
                </label>
                <select
                  value={autoMessageCount}
                  onChange={(e) => setAutoMessageCount(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-xl text-sm border focus:outline-none focus:ring-2 focus:ring-purple-500 bg-[hsl(var(--theme-input-bg))] border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))] transition-all"
                >
                  <option value={50}>50 messages</option>
                  <option value={100}>100 messages</option>
                  <option value={150}>150 messages</option>
                  <option value={200}>200 messages</option>
                </select>
              </div>
            </div>

            {/* Status info */}
            {autoSummarizeEnabled && (
              <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 mb-4">
                <div className="flex items-center gap-2 text-sm">
                  <CalendarClock className="w-4 h-4 text-purple-400" />
                  <span className="text-purple-300 font-medium">
                    Runs daily at {formatScheduleTime(scheduleTime)} UTC
                  </span>
                </div>
                {lastAutoSummaryDate && (
                  <div className="text-xs text-[hsl(var(--theme-text-muted))] mt-1.5 ml-6">
                    Last auto-summary: {lastAutoSummaryDate}
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveSchedule}
                disabled={isSavingSchedule}
                className={`flex items-center gap-2 px-5 py-2.5 ${isBasicTheme ? 'rounded-md' : 'rounded-xl'} bg-purple-600 hover:bg-purple-500 text-sm font-semibold text-white transition-all duration-300 disabled:opacity-50 hover:shadow-[0_0_20px_rgba(168,85,247,0.3)]`}
              >
                {isSavingSchedule ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Settings2 className="w-4 h-4" />
                )}
                Save Schedule
              </button>

              <button
                onClick={handleTriggerNow}
                disabled={isTriggering}
                className={`flex items-center gap-2 px-5 py-2.5 ${isBasicTheme ? 'rounded-md' : 'rounded-xl'} border text-sm font-medium transition-all duration-300 disabled:opacity-50 bg-[hsl(var(--theme-bg-tertiary))] border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))] hover:border-[hsl(var(--theme-border-hover))]`}
              >
                {isTriggering ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4" />
                )}
                Run Now
              </button>
            </div>

            {/* Success Message */}
            {scheduleSuccess && (
              <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-sm text-emerald-400 font-medium">
                {scheduleSuccess}
              </div>
            )}
          </div>
        )}

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