import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, Users, MessageSquare, Target, Loader2, AlertCircle, 
  BarChart3, Clock, Copy, Check, Sparkles, Gamepad2, HelpCircle,
  Vote, RefreshCw, ChevronDown, ChevronUp, Play, Trophy, Activity
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAIAgents } from '@/contexts/AIAgentContext';
import { useAuth } from '@/contexts/AuthContext';
import { aiAgentService } from '@/services/aiAgentService';

interface IcebreakerActivity {
  title: string;
  description: string;
  questions?: string[];
  instructions?: string[];
  example?: string;
  duration: string;
}

interface QuickPoll {
  question: string;
  options: string[];
  category: string;
  id: string;
}

interface FunChallenge {
  title: string;
  description: string;
  current_theme: string;
  all_themes: string[];
  duration: string;
}

export default function EngagementAgent() {
  const { isDarkMode } = useTheme();
  const { analyzeEngagement, getEngagementMetrics, getEngagementHistory } = useAIAgents();
  const { user } = useAuth();
  
  // Analysis states
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [timePeriod, setTimePeriod] = useState(6);
  const [engagementAnalysis, setEngagementAnalysis] = useState<any>(null);
  const [engagementMetrics, setEngagementMetrics] = useState<any>(null);
  const [engagementHistory, setEngagementHistory] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // Ice-breaker states
  const [activeTab, setActiveTab] = useState<'analysis' | 'icebreakers'>('analysis');
  const [currentActivity, setCurrentActivity] = useState<IcebreakerActivity | null>(null);
  const [currentPoll, setCurrentPoll] = useState<QuickPoll | null>(null);
  const [currentChallenge, setCurrentChallenge] = useState<FunChallenge | null>(null);
  const [currentStarters, setCurrentStarters] = useState<string[]>([]);
  const [starterCategory, setStarterCategory] = useState('general');
  const [isLoadingActivity, setIsLoadingActivity] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>('starters');

  useEffect(() => {
    loadEngagementMetrics();
    loadEngagementHistory();
    loadConversationStarters('general');
  }, []);

  const loadEngagementMetrics = async () => {
    setIsLoadingMetrics(true);
    try {
      const result = await getEngagementMetrics(24);
      setEngagementMetrics(result?.metrics || null);
      setError(null);
    } catch (err: any) {
      console.error('Error loading metrics:', err);
    } finally {
      setIsLoadingMetrics(false);
    }
  };

  const loadEngagementHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const history = await getEngagementHistory(5);
      setEngagementHistory(history || []);
    } catch (err: any) {
      console.error('Error loading history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const loadConversationStarters = async (category: string) => {
    try {
      const result = await aiAgentService.getConversationStarters(category);
      if (result?.success) {
        setCurrentStarters(result.starters || []);
        setStarterCategory(category);
      }
    } catch (err) {
      console.error('Error loading starters:', err);
    }
  };

  const handleAnalyzeEngagement = async () => {
    setIsAnalyzing(true);
    setError(null);
    
    try {
      const result = await analyzeEngagement(timePeriod);
      console.log('Engagement analysis result:', result);
      setEngagementAnalysis(result?.analysis || null);
      await loadEngagementMetrics();
      await loadEngagementHistory();
    } catch (err: any) {
      console.error('Error analyzing engagement:', err);
      setError(err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGetIcebreaker = async (activityType: string = 'random') => {
    setIsLoadingActivity(true);
    try {
      const result = await aiAgentService.getIcebreaker(activityType);
      if (result?.success) {
        setCurrentActivity(result.activity);
        setExpandedSection('activity');
      }
    } catch (err) {
      console.error('Error getting icebreaker:', err);
    } finally {
      setIsLoadingActivity(false);
    }
  };

  const handleGetPoll = async () => {
    setIsLoadingActivity(true);
    try {
      const result = await aiAgentService.getQuickPoll('random');
      if (result?.success) {
        setCurrentPoll(result.poll);
        setExpandedSection('poll');
      }
    } catch (err) {
      console.error('Error getting poll:', err);
    } finally {
      setIsLoadingActivity(false);
    }
  };

  const handleGetChallenge = async () => {
    setIsLoadingActivity(true);
    try {
      const result = await aiAgentService.getFunChallenge('random');
      if (result?.success) {
        setCurrentChallenge(result.challenge);
        setExpandedSection('challenge');
      }
    } catch (err) {
      console.error('Error getting challenge:', err);
    } finally {
      setIsLoadingActivity(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const getEngagementLevelColor = (level: string) => {
    switch (level?.toLowerCase()) {
      case 'high':
        return 'text-green-500 bg-green-100 border-green-200 dark:bg-green-900/30 dark:border-green-800';
      case 'medium':
      case 'moderate':
        return 'text-yellow-500 bg-yellow-100 border-yellow-200 dark:bg-yellow-900/30 dark:border-yellow-800';
      case 'low':
      case 'inactive':
        return 'text-red-500 bg-red-100 border-red-200 dark:bg-red-900/30 dark:border-red-800';
      default:
        return 'text-gray-500 bg-gray-100 border-gray-200 dark:bg-gray-900/30 dark:border-gray-800';
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'k';
    }
    return num.toString();
  };

  const formatPercentage = (value: number) => {
    return `${Math.round(value * 100)}%`;
  };

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  return (
    <div className="h-full flex flex-col bg-[hsl(var(--theme-bg-primary))]">
      {/* Header */}
      <div className="p-5 border-b border-[hsl(var(--theme-border-default))] relative overflow-hidden">
        {/* Gradient accent line at top */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
        
        <div className="flex items-center gap-4 mb-5">
          <div className="relative">
            <div className="absolute inset-0 bg-blue-500 rounded-xl blur-lg opacity-40"></div>
            <div className="relative p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg border border-blue-400/30">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-[hsl(var(--theme-text-primary))] flex items-center gap-2">
              Engagement Analytics
              <Sparkles className="w-4 h-4 text-blue-400" />
            </h3>
            <p className="text-sm text-[hsl(var(--theme-text-muted))]">
              Track activity & boost engagement with ice-breakers
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-2 mb-5">
          <button
            onClick={() => setActiveTab('analysis')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
              activeTab === 'analysis'
                ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/25'
                : 'bg-[hsl(var(--theme-bg-secondary))] text-[hsl(var(--theme-text-secondary))] border border-[hsl(var(--theme-border-default))] hover:border-[hsl(var(--theme-border-hover))]'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Analysis
          </button>
          <button
            onClick={() => setActiveTab('icebreakers')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
              activeTab === 'icebreakers'
                ? 'bg-gradient-to-r from-purple-500 to-pink-600 text-white shadow-lg shadow-purple-500/25'
                : 'bg-[hsl(var(--theme-bg-secondary))] text-[hsl(var(--theme-text-secondary))] border border-[hsl(var(--theme-border-default))] hover:border-[hsl(var(--theme-border-hover))]'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            Ice-Breakers
          </button>
        </div>

        {/* Analysis Controls - only show on Analysis tab */}
        {activeTab === 'analysis' && (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-[hsl(var(--theme-text-secondary))]">
                Time Period:
              </label>
              <select
                value={timePeriod}
                onChange={(e) => setTimePeriod(Number(e.target.value))}
                disabled={isAnalyzing}
                className="px-4 py-2 rounded-xl text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500/50 bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))] disabled:opacity-50 transition-all"
              >
                <option value={6}>Last 6 hours</option>
                <option value={12}>Last 12 hours</option>
                <option value={24}>Last 24 hours</option>
                <option value={48}>Last 48 hours</option>
                <option value={168}>Last week</option>
              </select>
            </div>
            
            <button
              onClick={handleAnalyzeEngagement}
              disabled={isAnalyzing}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                isAnalyzing
                  ? 'bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-muted))] cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white hover:shadow-lg hover:shadow-blue-500/25'
              }`}
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <BarChart3 className="w-4 h-4" />
                  Analyze
                </>
              )}
            </button>
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
              <h4 className="font-medium mb-1 text-red-400">Analysis Failed</h4>
              <p className="text-sm text-red-300/80">{error}</p>
            </div>
          </div>
        )}

        {/* ANALYSIS TAB */}
        {activeTab === 'analysis' && (
          <>
            {/* Quick Metrics */}
        {engagementMetrics && (
          <div className="p-5 border-b border-[hsl(var(--theme-border-default))]">
            <h4 className="font-semibold mb-4 text-[hsl(var(--theme-text-primary))] flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-400" />
              Quick Metrics
            </h4>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-4 rounded-xl border bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))] hover:border-[hsl(var(--theme-border-hover))] transition-all duration-300">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-lg bg-blue-500/20">
                    <MessageSquare className="w-4 h-4 text-blue-400" />
                  </div>
                  <span className="text-xs font-medium text-[hsl(var(--theme-text-muted))]">
                    Messages
                  </span>
                </div>
                <div className="text-xl font-bold text-[hsl(var(--theme-text-primary))]">
                  {formatNumber(engagementMetrics.total_messages || 0)}
                </div>
              </div>

              <div className="p-4 rounded-xl border bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))] hover:border-[hsl(var(--theme-border-hover))] transition-all duration-300">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-lg bg-emerald-500/20">
                    <Users className="w-4 h-4 text-emerald-400" />
                  </div>
                  <span className="text-xs font-medium text-[hsl(var(--theme-text-muted))]">
                    Active Users
                  </span>
                </div>
                <div className="text-xl font-bold text-[hsl(var(--theme-text-primary))]">
                  {engagementMetrics.active_users || 0}
                </div>
              </div>

              <div className="p-4 rounded-xl border bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))] hover:border-[hsl(var(--theme-border-hover))] transition-all duration-300">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-lg bg-purple-500/20">
                    <Clock className="w-4 h-4 text-purple-400" />
                  </div>
                  <span className="text-xs font-medium text-[hsl(var(--theme-text-muted))]">
                    Avg/User
                  </span>
                </div>
                <div className="text-xl font-bold text-[hsl(var(--theme-text-primary))]">
                  {engagementMetrics.avg_messages_per_user ? engagementMetrics.avg_messages_per_user.toFixed(1) : '0'}
                </div>
              </div>

              <div className="p-4 rounded-xl border bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))] hover:border-[hsl(var(--theme-border-hover))] transition-all duration-300">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-lg bg-amber-500/20">
                    <Target className="w-4 h-4 text-amber-400" />
                  </div>
                  <span className="text-xs font-medium text-[hsl(var(--theme-text-muted))]">
                    Engagement Score
                  </span>
                </div>
                <div className="text-xl font-bold text-[hsl(var(--theme-text-primary))]">
                  {engagementMetrics.engagement_score || 0}%
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Current Engagement Analysis */}
        {engagementAnalysis && (
          <div className="p-4 border-b border-[hsl(var(--theme-border-default))]">
            <h4 className={`font-medium mb-3 ${'text-[hsl(var(--theme-text-primary))]'}`}>
              Engagement Analysis Results
            </h4>

            {/* Overall Engagement Level */}
            <div className={`p-4 rounded-lg border mb-4 ${
              'bg-[hsl(var(--theme-bg-secondary)/0.5)] border-[hsl(var(--theme-border-default))]'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h5 className={`font-medium ${'text-[hsl(var(--theme-text-primary))]'}`}>
                    Overall Engagement
                  </h5>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`px-2 py-1 rounded-full text-xs border ${
                      getEngagementLevelColor(engagementAnalysis.engagement_level)
                    }`}>
                      {engagementAnalysis.engagement_level} engagement
                    </span>
                    <span className={`text-sm ${'text-[hsl(var(--theme-text-secondary))]'}`}>
                      Score: {engagementAnalysis.engagement_score}/100
                    </span>
                  </div>
                </div>
              </div>

              {/* Key Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
                <div className="text-center">
                  <div className={`text-lg font-semibold ${'text-[hsl(var(--theme-text-primary))]'}`}>
                    {engagementAnalysis.message_count || 0}
                  </div>
                  <div className={`text-xs ${'text-[hsl(var(--theme-text-secondary))]'}`}>
                    Messages
                  </div>
                </div>
                <div className="text-center">
                  <div className={`text-lg font-semibold ${'text-[hsl(var(--theme-text-primary))]'}`}>
                    {engagementAnalysis.participant_count || 0}
                  </div>
                  <div className={`text-xs ${'text-[hsl(var(--theme-text-secondary))]'}`}>
                    Participants
                  </div>
                </div>
                <div className="text-center">
                  <div className={`text-lg font-semibold ${'text-[hsl(var(--theme-text-primary))]'}`}>
                    {engagementAnalysis.avg_messages_per_user?.toFixed(1) || 0}
                  </div>
                  <div className={`text-xs ${'text-[hsl(var(--theme-text-secondary))]'}`}>
                    Avg/User
                  </div>
                </div>
                <div className="text-center">
                  <div className={`text-lg font-semibold ${'text-[hsl(var(--theme-text-primary))]'}`}>
                    {Math.round(engagementAnalysis.silence_minutes || 0)}m
                  </div>
                  <div className={`text-xs ${'text-[hsl(var(--theme-text-secondary))]'}`}>
                    Silence Time
                  </div>
                </div>
                <div className="text-center">
                  <div className={`text-lg font-semibold ${'text-[hsl(var(--theme-text-primary))]'}`}>
                    {formatPercentage(engagementAnalysis.participation_balance || 0)}
                  </div>
                  <div className={`text-xs ${'text-[hsl(var(--theme-text-secondary))]'}`}>
                    Balance
                  </div>
                </div>
                <div className="text-center">
                  <div className={`text-lg font-semibold ${'text-[hsl(var(--theme-text-primary))]'}`}>
                    {engagementAnalysis.time_period_hours || 0}h
                  </div>
                  <div className={`text-xs ${'text-[hsl(var(--theme-text-secondary))]'}`}>
                    Period
                  </div>
                </div>
              </div>
            </div>

            {/* AI Suggestions */}
            {engagementAnalysis.suggestions && engagementAnalysis.suggestions.length > 0 && (
              <div>
                <h5 className={`font-medium mb-3 ${'text-[hsl(var(--theme-text-primary))]'}`}>
                  💡 AI Suggestions
                </h5>
                <div className="space-y-3">
                  {engagementAnalysis.suggestions.map((suggestion: any, index: number) => (
                    <div key={index} className={`p-3 rounded-lg border ${
                      'bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))]'
                    }`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-500/20 text-blue-400">
                              {suggestion.type}
                            </span>
                          </div>
                          <p className={`text-sm font-medium mb-1 ${'text-[hsl(var(--theme-text-primary))]'}`}>
                            {suggestion.message}
                          </p>
                          <p className={`text-xs ${'text-[hsl(var(--theme-text-secondary))]'}`}>
                            {suggestion.reason}
                          </p>
                        </div>
                        <button
                          onClick={() => copyToClipboard(suggestion.message)}
                          className="px-3 py-1 rounded text-xs font-medium transition-colors bg-[hsl(var(--theme-bg-tertiary))] hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-secondary))]"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Engagement History */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h4 className={`font-medium ${'text-[hsl(var(--theme-text-primary))]'}`}>
              Recent Engagement History
            </h4>
            {isLoadingHistory && (
              <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
            )}
          </div>

          {engagementHistory.length === 0 && !isLoadingHistory ? (
            <div className="text-center py-8">
              <TrendingUp className={`w-12 h-12 mx-auto mb-3 ${'text-[hsl(var(--theme-text-muted))]'}`} />
              <h5 className={`font-medium mb-1 ${'text-[hsl(var(--theme-text-secondary))]'}`}>
                No History Data
              </h5>
              <p className={`text-sm ${'text-[hsl(var(--theme-text-muted))]'}`}>
                Engagement history will appear after you run analyses
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {engagementHistory.map((item, index) => (
                <div
                  key={item.id || index}
                  className={`p-3 rounded-lg border ${
                    'bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <TrendingUp className="w-4 h-4 text-blue-500" />
                      <div>
                        <div className={`font-medium ${'text-[hsl(var(--theme-text-primary))]'}`}>
                          {item.created_at ? new Date(item.created_at).toLocaleString() : 'Unknown date'}
                        </div>
                        <div className={`text-sm ${'text-[hsl(var(--theme-text-secondary))]'}`}>
                          {item.analysis?.engagement_level || 'N/A'} engagement • {item.analysis?.message_count || 0} messages
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-medium ${
                        item.engagement_score > 70 ? 'text-green-500' :
                        item.engagement_score > 40 ? 'text-yellow-500' : 'text-red-500'
                      }`}>
                        {item.engagement_score || 0}/100
                      </div>
                      <div className={`text-xs ${'text-[hsl(var(--theme-text-muted))]'}`}>
                        Score
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
          </>
        )}

        {/* ICE-BREAKERS TAB */}
        {activeTab === 'icebreakers' && (
          <div className="p-4 space-y-4">
            {/* Quick Actions */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <button
                onClick={() => handleGetIcebreaker('quick_questions')}
                disabled={isLoadingActivity}
                className={`p-3 rounded-lg border text-left transition-all hover:scale-[1.02] ${
                  'bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))] hover:border-purple-500'
                }`}
              >
                <HelpCircle className="w-5 h-5 text-purple-500 mb-2" />
                <div className={`text-sm font-medium ${'text-[hsl(var(--theme-text-primary))]'}`}>
                  Quick Question
                </div>
                <div className={`text-xs ${'text-[hsl(var(--theme-text-muted))]'}`}>
                  Fun questions
                </div>
              </button>

              <button
                onClick={() => handleGetIcebreaker('games')}
                disabled={isLoadingActivity}
                className={`p-3 rounded-lg border text-left transition-all hover:scale-[1.02] ${
                  'bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))] hover:border-green-500'
                }`}
              >
                <Gamepad2 className="w-5 h-5 text-green-500 mb-2" />
                <div className={`text-sm font-medium ${'text-[hsl(var(--theme-text-primary))]'}`}>
                  Mini Game
                </div>
                <div className={`text-xs ${'text-[hsl(var(--theme-text-muted))]'}`}>
                  Interactive fun
                </div>
              </button>

              <button
                onClick={handleGetPoll}
                disabled={isLoadingActivity}
                className={`p-3 rounded-lg border text-left transition-all hover:scale-[1.02] ${
                  'bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))] hover:border-blue-500'
                }`}
              >
                <Vote className="w-5 h-5 text-blue-500 mb-2" />
                <div className={`text-sm font-medium ${'text-[hsl(var(--theme-text-primary))]'}`}>
                  Quick Poll
                </div>
                <div className={`text-xs ${'text-[hsl(var(--theme-text-muted))]'}`}>
                  Easy voting
                </div>
              </button>

              <button
                onClick={handleGetChallenge}
                disabled={isLoadingActivity}
                className={`p-3 rounded-lg border text-left transition-all hover:scale-[1.02] ${
                  'bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))] hover:border-orange-500'
                }`}
              >
                <Trophy className="w-5 h-5 text-orange-500 mb-2" />
                <div className={`text-sm font-medium ${'text-[hsl(var(--theme-text-primary))]'}`}>
                  Challenge
                </div>
                <div className={`text-xs ${'text-[hsl(var(--theme-text-muted))]'}`}>
                  Fun tasks
                </div>
              </button>
            </div>

            {/* Conversation Starters Section */}
            <div className={`rounded-lg border ${'bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))]'}`}>
              <button
                onClick={() => toggleSection('starters')}
                className={`w-full p-4 flex items-center justify-between ${'text-[hsl(var(--theme-text-primary))]'}`}
              >
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-blue-500" />
                  <span className="font-medium">Conversation Starters</span>
                </div>
                {expandedSection === 'starters' ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
              </button>
              
              {expandedSection === 'starters' && (
                <div className="px-4 pb-4">
                  <div className="flex gap-2 mb-3 flex-wrap">
                    {['general', 'tech', 'casual', 'icebreaker', 'motivational'].map((cat) => (
                      <button
                        key={cat}
                        onClick={() => loadConversationStarters(cat)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          starterCategory === cat
                            ? 'bg-blue-600 text-white'
                            : 'bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))]'
                        }`}
                      >
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </button>
                    ))}
                  </div>
                  
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {currentStarters.map((starter, index) => (
                      <div
                        key={index}
                        className={`p-3 rounded-lg flex items-center justify-between ${
                          'bg-[hsl(var(--theme-bg-tertiary)/0.5)]'
                        }`}
                      >
                        <p className={`text-sm flex-1 ${'text-[hsl(var(--theme-text-primary))]'}`}>
                          {starter}
                        </p>
                        <button
                          onClick={() => copyToClipboard(starter)}
                          className={`ml-2 p-2 rounded-lg transition-colors ${
                            'hover:bg-[hsl(var(--theme-bg-hover))]'
                          }`}
                        >
                          {copiedText === starter ? (
                            <Check className="w-4 h-4 text-green-500" />
                          ) : (
                            <Copy className="w-4 h-4 text-gray-400" />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Current Activity */}
            {currentActivity && (
              <div className={`rounded-lg border ${'bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))]'}`}>
                <button
                  onClick={() => toggleSection('activity')}
                  className={`w-full p-4 flex items-center justify-between ${'text-[hsl(var(--theme-text-primary))]'}`}
                >
                  <div className="flex items-center gap-2">
                    <Play className="w-5 h-5 text-purple-500" />
                    <span className="font-medium">{currentActivity.title}</span>
                  </div>
                  {expandedSection === 'activity' ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </button>
                
                {expandedSection === 'activity' && (
                  <div className="px-4 pb-4">
                    <p className={`text-sm mb-3 ${'text-[hsl(var(--theme-text-secondary))]'}`}>
                      {currentActivity.description}
                    </p>
                    <div className={`text-xs px-2 py-1 rounded-full inline-block mb-3 ${
                      'bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-secondary))]'
                    }`}>
                      ⏱️ {currentActivity.duration}
                    </div>
                    
                    {currentActivity.questions && (
                      <div className="space-y-2">
                        <h5 className={`text-xs font-medium ${'text-[hsl(var(--theme-text-muted))]'}`}>
                          Questions:
                        </h5>
                        {currentActivity.questions.map((q, i) => (
                          <div
                            key={i}
                            className={`p-2 rounded-lg flex items-center justify-between ${
                              'bg-[hsl(var(--theme-bg-tertiary)/0.5)]'
                            }`}
                          >
                            <span className={`text-sm ${'text-[hsl(var(--theme-text-primary))]'}`}>{q}</span>
                            <button onClick={() => copyToClipboard(q)} className="p-1.5">
                              {copiedText === q ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3 text-gray-400" />}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {currentActivity.instructions && (
                      <div className="mt-3">
                        <h5 className={`text-xs font-medium mb-2 ${'text-[hsl(var(--theme-text-muted))]'}`}>
                          How to play:
                        </h5>
                        <ol className="list-decimal list-inside space-y-1">
                          {currentActivity.instructions.map((inst, i) => (
                            <li key={i} className={`text-sm ${'text-[hsl(var(--theme-text-secondary))]'}`}>
                              {inst}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                    
                    <button
                      onClick={() => handleGetIcebreaker('random')}
                      className="mt-4 w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Get Another Activity
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Current Poll */}
            {currentPoll && (
              <div className={`rounded-lg border ${'bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))]'}`}>
                <button
                  onClick={() => toggleSection('poll')}
                  className={`w-full p-4 flex items-center justify-between ${'text-[hsl(var(--theme-text-primary))]'}`}
                >
                  <div className="flex items-center gap-2">
                    <Vote className="w-5 h-5 text-blue-500" />
                    <span className="font-medium">Quick Poll</span>
                  </div>
                  {expandedSection === 'poll' ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </button>
                
                {expandedSection === 'poll' && (
                  <div className="px-4 pb-4">
                    <p className={`text-lg font-medium mb-3 ${'text-[hsl(var(--theme-text-primary))]'}`}>
                      {currentPoll.question}
                    </p>
                    
                    <div className="space-y-2">
                      {currentPoll.options.map((option, i) => (
                        <div
                          key={i}
                          className={`p-3 rounded-lg flex items-center justify-between ${
                            'bg-[hsl(var(--theme-bg-tertiary)/0.5)] hover:bg-[hsl(var(--theme-bg-hover))]'
                          } cursor-pointer transition-colors`}
                        >
                          <span className={`text-sm ${'text-[hsl(var(--theme-text-primary))]'}`}>{option}</span>
                        </div>
                      ))}
                    </div>
                    
                    <button
                      onClick={() => copyToClipboard(`📊 ${currentPoll.question}\n\n${currentPoll.options.map((o, i) => `${i + 1}. ${o}`).join('\n')}`)}
                      className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] transition-colors"
                    >
                      <Copy className="w-4 h-4" />
                      Copy Poll to Clipboard
                    </button>
                    
                    <button
                      onClick={handleGetPoll}
                      className="mt-2 w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Get Another Poll
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Current Challenge */}
            {currentChallenge && (
              <div className={`rounded-lg border ${'bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))]'}`}>
                <button
                  onClick={() => toggleSection('challenge')}
                  className={`w-full p-4 flex items-center justify-between ${'text-[hsl(var(--theme-text-primary))]'}`}
                >
                  <div className="flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-orange-500" />
                    <span className="font-medium">{currentChallenge.title}</span>
                  </div>
                  {expandedSection === 'challenge' ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </button>
                
                {expandedSection === 'challenge' && (
                  <div className="px-4 pb-4">
                    <p className={`text-sm mb-3 ${'text-[hsl(var(--theme-text-secondary))]'}`}>
                      {currentChallenge.description}
                    </p>
                    
                    <div className="p-4 rounded-lg mb-3 bg-orange-500/10 border border-orange-500/30">
                      <p className="text-xs font-medium mb-1 text-orange-400">
                        Current Theme:
                      </p>
                      <p className="text-lg font-semibold text-orange-300">
                        {currentChallenge.current_theme}
                      </p>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 mb-3">
                      {currentChallenge.all_themes.map((theme, i) => (
                        <span
                          key={i}
                          className={`px-2 py-1 rounded text-xs ${
                            theme === currentChallenge.current_theme
                              ? 'bg-orange-500 text-white'
                              : 'bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-secondary))]'
                          }`}
                        >
                          {theme}
                        </span>
                      ))}
                    </div>
                    
                    <button
                      onClick={() => copyToClipboard(`🏆 ${currentChallenge.title}\n\n${currentChallenge.description}\n\n📌 Theme: ${currentChallenge.current_theme}\n⏱️ Duration: ${currentChallenge.duration}`)}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] transition-colors"
                    >
                      <Copy className="w-4 h-4" />
                      Copy Challenge
                    </button>
                    
                    <button
                      onClick={handleGetChallenge}
                      className="mt-2 w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-orange-600 text-white hover:bg-orange-700 transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Get Another Challenge
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Loading indicator */}
            {isLoadingActivity && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
              </div>
            )}

            {/* Empty State for Ice-Breakers */}
            {!currentActivity && !currentPoll && !currentChallenge && !isLoadingActivity && expandedSection !== 'starters' && (
              <div className="text-center py-8">
                <Sparkles className={`w-12 h-12 mx-auto mb-3 ${'text-purple-400'}`} />
                <h5 className={`font-medium mb-1 ${'text-[hsl(var(--theme-text-primary))]'}`}>
                  Ready to Break the Ice?
                </h5>
                <p className={`text-sm ${'text-[hsl(var(--theme-text-muted))]'}`}>
                  Click any button above to get started with fun activities!
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}