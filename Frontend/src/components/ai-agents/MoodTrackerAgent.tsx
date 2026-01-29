import React, { useState, useEffect } from 'react';
import { 
  Heart, TrendingUp, TrendingDown, Minus, Smile, Frown, Meh, Loader2, 
  AlertCircle, Clock, RefreshCw, Activity, Send, ChevronLeft, ChevronRight,
  Sparkles, MessageSquare
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAIAgents } from '@/contexts/AIAgentContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  PieChart as RechartsPie, Pie, Cell, ResponsiveContainer, Tooltip, Legend
} from 'recharts';

// Professional color palette with gradients
const COLORS = {
  positive: '#10b981',
  positiveLight: '#34d399',
  neutral: '#64748b', 
  neutralLight: '#94a3b8',
  negative: '#ef4444',
  negativeLight: '#f87171',
  primary: '#ec4899',
  primaryLight: '#f472b6',
  secondary: '#8b5cf6',
  secondaryLight: '#a78bfa',
  accent: '#06b6d4',
  accentLight: '#22d3ee'
};

// Custom Tooltip Component
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="px-3 py-2 rounded-xl shadow-xl border backdrop-blur-sm bg-[hsl(var(--theme-bg-secondary)/0.95)] border-[hsl(var(--theme-border-default))]">
        <p className="text-sm font-semibold mb-1 text-[hsl(var(--theme-text-primary))]">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-xs flex items-center gap-2" style={{ color: entry.color }}>
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function MoodTrackerAgent() {
  const { isDarkMode } = useTheme();
  const { trackMood, getMoodHistory, analyzeMessageSentiment, currentMoodAnalysis } = useAIAgents();
  const { user } = useAuth();
  
  // Tracking states
  const [isTracking, setIsTracking] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [timePeriod, setTimePeriod] = useState(24);
  const [moodHistory, setMoodHistory] = useState<any[]>([]);
  const [testMessage, setTestMessage] = useState('');
  const [messageAnalysis, setMessageAnalysis] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Pagination states for history
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  useEffect(() => {
    if (user?.id) {
      loadMoodHistory();
    }
  }, [user?.id]);

  const loadMoodHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const history = await getMoodHistory(50); // Load more for pagination
      setMoodHistory(history);
      setCurrentPage(1); // Reset to first page on reload
      setError(null);
    } catch (err: any) {
      console.error('Error loading history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleTrackMood = async () => {
    if (!user?.id) {
      return;
    }
    
    setIsTracking(true);
    setError(null);
    
    try {
      await trackMood(timePeriod);
      await loadMoodHistory();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsTracking(false);
    }
  };

  const handleAnalyzeMessage = async () => {
    if (!testMessage.trim()) return;
    
    setIsAnalyzing(true);
    setError(null);
    try {
      console.log('[MOOD UI] Analyzing message:', testMessage);
      const analysis = await analyzeMessageSentiment(testMessage);
      console.log('[MOOD UI] Analysis result:', analysis);
      setMessageAnalysis(analysis);
    } catch (err: any) {
      console.error('[MOOD UI] Analysis error:', err);
      setError(err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getSentimentIcon = (sentiment: string, size: string = 'w-5 h-5') => {
    switch (sentiment) {
      case 'positive':
        return <Smile className={`${size} text-emerald-500`} />;
      case 'negative':
        return <Frown className={`${size} text-red-500`} />;
      case 'neutral':
      default:
        return <Meh className={`${size} text-slate-400`} />;
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving':
        return <TrendingUp className="w-4 h-4 text-emerald-500" />;
      case 'declining':
        return <TrendingDown className="w-4 h-4 text-red-500" />;
      case 'stable':
      default:
        return <Minus className="w-4 h-4 text-slate-400" />;
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.7) return 'text-emerald-500';
    if (confidence >= 0.4) return 'text-amber-500';
    return 'text-red-500';
  };

  const getSentimentGradient = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return 'from-emerald-500 to-emerald-600';
      case 'negative': return 'from-red-500 to-red-600';
      default: return 'from-slate-500 to-slate-600';
    }
  };

  return (
    <div className="h-full flex flex-col bg-[hsl(var(--theme-bg-primary))]">
      {/* Professional Header */}
      <div className="p-5 border-b border-[hsl(var(--theme-border-default))] relative overflow-hidden">
        {/* Gradient accent line at top */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-pink-500 via-rose-500 to-red-500" />
        
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 bg-pink-500 rounded-xl blur-lg opacity-40"></div>
            <div className="relative p-3 bg-gradient-to-br from-pink-500 to-rose-600 rounded-xl shadow-lg border border-pink-400/30">
              <Heart className="w-6 h-6 text-white" />
            </div>
          </div>
          <div>
            <h3 className="text-lg font-bold text-[hsl(var(--theme-text-primary))] flex items-center gap-2">
              Mood Analytics
              <Sparkles className="w-4 h-4 text-pink-400" />
            </h3>
            <p className="text-sm text-[hsl(var(--theme-text-muted))]">
              AI-powered emotion analysis • English & Roman Urdu
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'hsl(var(--theme-bg-tertiary)) transparent' }}>
        {/* Error Display */}
        {error && (
          <div className="mx-5 mt-4 p-4 rounded-xl border flex items-start gap-3 bg-red-500/10 border-red-500/30">
            <div className="p-2 rounded-lg bg-red-500/20">
              <AlertCircle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h4 className="font-semibold text-red-400">Error</h4>
              <p className="text-sm text-red-300/80">{error}</p>
            </div>
          </div>
        )}

        {/* ANALYZE SECTION */}
        <div className="p-5 space-y-5">
          {/* Quick Analysis Card */}
          <div className="p-5 rounded-xl border transition-all duration-300 bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))] hover:border-[hsl(var(--theme-border-hover))]">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-lg bg-amber-500/20">
                <Activity className="w-5 h-5 text-amber-400" />
              </div>
              <h4 className="font-semibold text-[hsl(var(--theme-text-primary))]">
                Quick Analysis
              </h4>
            </div>
            
            <div className="flex items-center gap-3 flex-wrap">
              <select
                value={timePeriod}
                onChange={(e) => setTimePeriod(Number(e.target.value))}
                disabled={isTracking}
                className="px-4 py-2.5 rounded-xl text-sm border font-medium focus:outline-none focus:ring-2 focus:ring-pink-500/50 transition-all bg-[hsl(var(--theme-bg-tertiary))] border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))] hover:border-[hsl(var(--theme-border-hover))] disabled:opacity-50"
              >
                <option value={6}>Last 6 hours</option>
                <option value={12}>Last 12 hours</option>
                <option value={24}>Last 24 hours</option>
                <option value={48}>Last 48 hours</option>
                <option value={168}>Last 7 days</option>
              </select>
              
              <button
                onClick={handleTrackMood}
                disabled={isTracking}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ${
                  isTracking
                    ? 'bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-muted))] cursor-not-allowed'
                    : 'bg-gradient-to-r from-pink-500 to-rose-600 text-white hover:shadow-lg hover:shadow-pink-500/25 hover:-translate-y-0.5 active:translate-y-0'
                }`}
              >
                {isTracking ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Analyze Mood
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Current Analysis Result - Advanced Visualization */}
          {currentMoodAnalysis && currentMoodAnalysis.success && (
            <div className="p-5 rounded-xl border transition-all duration-300 bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-pink-500/20">
                    <Activity className="w-5 h-5 text-pink-400" />
                  </div>
                  <h4 className="font-semibold text-[hsl(var(--theme-text-primary))]">
                    Analysis Result
                  </h4>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[hsl(var(--theme-bg-tertiary))] border border-[hsl(var(--theme-border-default))]">
                  {getTrendIcon(currentMoodAnalysis.trend || 'stable')}
                  <span className="text-xs font-semibold capitalize text-[hsl(var(--theme-text-secondary))]">
                    {currentMoodAnalysis.trend || 'Stable'}
                  </span>
                </div>
              </div>
              
              {/* Advanced Mood Visualization */}
              <div className="grid grid-cols-2 gap-5">
                {/* Left: Radial Gauge */}
                <div className="flex flex-col items-center justify-center">
                  <div className="relative w-40 h-40">
                    {/* Background circle */}
                    <svg className="w-full h-full transform -rotate-90">
                      <circle
                        cx="80"
                        cy="80"
                        r="70"
                        fill="none"
                        stroke="hsl(var(--theme-bg-tertiary))"
                        strokeWidth="12"
                      />
                      {/* Positive arc */}
                      <circle
                        cx="80"
                        cy="80"
                        r="70"
                        fill="none"
                        stroke="url(#positiveGradient)"
                        strokeWidth="12"
                        strokeLinecap="round"
                        strokeDasharray={`${((currentMoodAnalysis.sentiment_distribution?.positive || 0) / (currentMoodAnalysis.message_count || 1)) * 440} 440`}
                        className="transition-all duration-1000 ease-out"
                      />
                      <defs>
                        <linearGradient id="positiveGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#10b981" />
                          <stop offset="100%" stopColor="#34d399" />
                        </linearGradient>
                      </defs>
                    </svg>
                    {/* Center content */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <div className={`p-3 rounded-full bg-gradient-to-br ${getSentimentGradient(currentMoodAnalysis.overall_mood || 'neutral')} shadow-lg`}>
                        {getSentimentIcon(currentMoodAnalysis.overall_mood || 'neutral', 'w-8 h-8 text-white')}
                      </div>
                      <span className="mt-2 text-lg font-bold capitalize text-[hsl(var(--theme-text-primary))]">
                        {currentMoodAnalysis.overall_mood || 'Neutral'}
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-[hsl(var(--theme-text-muted))]">
                    <span className="font-semibold text-pink-400">{currentMoodAnalysis.message_count || 0}</span> messages analyzed
                  </p>
                </div>

                {/* Right: Sentiment Bars */}
                <div className="flex flex-col justify-center space-y-4">
                  {[
                    { label: 'Positive', value: currentMoodAnalysis.sentiment_distribution?.positive || 0, color: 'from-emerald-500 to-emerald-400', bgColor: 'bg-emerald-500/20' },
                    { label: 'Neutral', value: currentMoodAnalysis.sentiment_distribution?.neutral || 0, color: 'from-slate-500 to-slate-400', bgColor: 'bg-slate-500/20' },
                    { label: 'Negative', value: currentMoodAnalysis.sentiment_distribution?.negative || 0, color: 'from-red-500 to-red-400', bgColor: 'bg-red-500/20' },
                  ].map((item) => {
                    const total = currentMoodAnalysis.message_count || 1;
                    const percent = Math.round((item.value / total) * 100);
                    return (
                      <div key={item.label} className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-[hsl(var(--theme-text-secondary))]">{item.label}</span>
                          <span className="text-sm font-bold text-[hsl(var(--theme-text-primary))]">{percent}%</span>
                        </div>
                        <div className={`h-3 rounded-full ${item.bgColor} overflow-hidden`}>
                          <div 
                            className={`h-full rounded-full bg-gradient-to-r ${item.color} transition-all duration-1000 ease-out`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <span className="text-xs text-[hsl(var(--theme-text-muted))]">{item.value} messages</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Mini Chart - Sentiment Distribution Donut */}
              <div className="mt-5 pt-5 border-t border-[hsl(var(--theme-border-default))]">
                <div className="h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPie>
                      <defs>
                        <linearGradient id="piePositive" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor={COLORS.positive} />
                          <stop offset="100%" stopColor={COLORS.positiveLight} />
                        </linearGradient>
                        <linearGradient id="pieNeutral" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor={COLORS.neutral} />
                          <stop offset="100%" stopColor={COLORS.neutralLight} />
                        </linearGradient>
                        <linearGradient id="pieNegative" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor={COLORS.negative} />
                          <stop offset="100%" stopColor={COLORS.negativeLight} />
                        </linearGradient>
                      </defs>
                      <Pie
                        data={[
                          { name: 'Positive', value: currentMoodAnalysis.sentiment_distribution?.positive || 0 },
                          { name: 'Neutral', value: currentMoodAnalysis.sentiment_distribution?.neutral || 0 },
                          { name: 'Negative', value: currentMoodAnalysis.sentiment_distribution?.negative || 0 },
                        ].filter(d => d.value > 0)}
                        cx="50%"
                        cy="50%"
                        innerRadius={35}
                        outerRadius={55}
                        paddingAngle={4}
                        dataKey="value"
                        stroke="none"
                      >
                        <Cell fill="url(#piePositive)" />
                        <Cell fill="url(#pieNeutral)" />
                        <Cell fill="url(#pieNegative)" />
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                      <Legend 
                        verticalAlign="middle"
                        align="right"
                        layout="vertical"
                        iconType="circle"
                        iconSize={8}
                        formatter={(value) => <span className="text-xs text-[hsl(var(--theme-text-secondary))]">{value}</span>}
                      />
                    </RechartsPie>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* Message Sentiment Tester */}
          <div className="p-5 rounded-xl border transition-all duration-300 bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))] hover:border-[hsl(var(--theme-border-hover))]">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-lg bg-blue-500/20">
                <MessageSquare className="w-5 h-5 text-blue-400" />
              </div>
              <h4 className="font-semibold text-[hsl(var(--theme-text-primary))]">
                Test Message Sentiment
              </h4>
            </div>
            
            <div className="relative">
              <textarea
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                placeholder="Type a message in English or Roman Urdu... (e.g., 'Bohat acha lag raha hai' or 'I'm feeling great!')"
                disabled={isAnalyzing}
                className="w-full px-4 py-3 rounded-xl text-sm border focus:outline-none focus:ring-2 focus:ring-pink-500/50 resize-none transition-all bg-[hsl(var(--theme-bg-tertiary))] border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))] placeholder:text-[hsl(var(--theme-text-muted))] hover:border-[hsl(var(--theme-border-hover))] disabled:opacity-50"
                rows={3}
              />
            </div>
            
            <button
              onClick={handleAnalyzeMessage}
              disabled={!testMessage.trim() || isAnalyzing}
              className={`mt-3 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ${
                !testMessage.trim() || isAnalyzing
                  ? 'bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-muted))] cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white hover:shadow-lg hover:shadow-blue-500/25 hover:-translate-y-0.5'
              }`}
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Analyze Message
                </>
              )}
            </button>

            {/* Message Analysis Result */}
            {messageAnalysis && (
              <div className="mt-4 p-4 rounded-xl border bg-[hsl(var(--theme-bg-tertiary))] border-[hsl(var(--theme-border-default))]">
                <div className="flex items-center gap-4 mb-3">
                  <div className={`p-2.5 rounded-xl bg-gradient-to-br ${getSentimentGradient(messageAnalysis.sentiment)} shadow-lg`}>
                    {getSentimentIcon(messageAnalysis.sentiment, 'w-6 h-6 text-white')}
                  </div>
                  <div>
                    <span className="text-lg font-bold capitalize text-[hsl(var(--theme-text-primary))]">
                      {messageAnalysis.sentiment}
                    </span>
                    <div className={`text-sm font-medium ${getConfidenceColor(messageAnalysis.confidence)}`}>
                      {Math.round(messageAnalysis.confidence * 100)}% confidence
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {messageAnalysis.detected_language && (
                    <div className="flex items-center gap-2 text-[hsl(var(--theme-text-secondary))]">
                      <span className="text-lg">🌐</span>
                      <span className="capitalize">{messageAnalysis.detected_language.replace('_', ' ')}</span>
                    </div>
                  )}
                  {messageAnalysis.primary_mood && (
                    <div className="flex items-center gap-2 text-[hsl(var(--theme-text-secondary))]">
                      <span className="text-lg">💭</span>
                      <span className="capitalize">{messageAnalysis.primary_mood}</span>
                    </div>
                  )}
                </div>

                {messageAnalysis.detected_words && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {messageAnalysis.detected_words.positive?.slice(0, 5).map((word: string, i: number) => (
                      <span key={i} className="px-2.5 py-1 bg-emerald-500/20 text-emerald-400 rounded-lg text-xs font-medium border border-emerald-500/30">
                        {word}
                      </span>
                    ))}
                    {messageAnalysis.detected_words.negative?.slice(0, 5).map((word: string, i: number) => (
                      <span key={i} className="px-2.5 py-1 bg-red-500/20 text-red-400 rounded-lg text-xs font-medium border border-red-500/30">
                        {word}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Mood History with Pagination */}
          <div className="p-5 rounded-xl border transition-all duration-300 bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-purple-500/20">
                  <Clock className="w-5 h-5 text-purple-400" />
                </div>
                <h4 className="font-semibold text-[hsl(var(--theme-text-primary))]">
                  Recent History
                </h4>
                {moodHistory.length > 0 && (
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-muted))] border border-[hsl(var(--theme-border-default))]">
                    {moodHistory.length} entries
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isLoadingHistory && <Loader2 className="w-4 h-4 animate-spin text-pink-400" />}
                <button
                  onClick={loadMoodHistory}
                  disabled={isLoadingHistory}
                  className="p-2 rounded-lg hover:bg-[hsl(var(--theme-bg-tertiary))] transition-colors"
                  title="Refresh history"
                >
                  <RefreshCw className={`w-4 h-4 text-[hsl(var(--theme-text-muted))] ${isLoadingHistory ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {moodHistory.length === 0 && !isLoadingHistory ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[hsl(var(--theme-bg-tertiary))] flex items-center justify-center border border-[hsl(var(--theme-border-default))]">
                  <Heart className="w-8 h-8 text-[hsl(var(--theme-text-muted))]" />
                </div>
                <p className="font-medium text-[hsl(var(--theme-text-secondary))]">
                  No mood history yet
                </p>
                <p className="text-xs text-[hsl(var(--theme-text-muted))] mt-1">
                  Run your first analysis to get started
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {moodHistory
                    .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                    .map((entry, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-4 rounded-xl transition-all hover:scale-[1.01] bg-[hsl(var(--theme-bg-tertiary))] hover:bg-[hsl(var(--theme-bg-tertiary)/0.8)] border border-[hsl(var(--theme-border-default))]"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg bg-gradient-to-br ${getSentimentGradient(entry.mood || entry.overall_sentiment)}`}>
                          {getSentimentIcon(entry.mood || entry.overall_sentiment, 'w-4 h-4 text-white')}
                        </div>
                        <div>
                          <div className="font-semibold capitalize text-[hsl(var(--theme-text-primary))]">
                            {entry.mood || entry.overall_sentiment}
                          </div>
                          <div className="text-xs text-[hsl(var(--theme-text-muted))]">
                            {new Date(entry.created_at).toLocaleString()}
                          </div>
                        </div>
                      </div>
                      <div className={`text-sm font-bold ${getConfidenceColor(entry.confidence || 0.5)}`}>
                        {Math.round((entry.confidence || 0.5) * 100)}%
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination Controls */}
                {moodHistory.length > itemsPerPage && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-[hsl(var(--theme-border-default))]">
                    <span className="text-xs text-[hsl(var(--theme-text-muted))]">
                      Showing {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, moodHistory.length)} of {moodHistory.length}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className={`p-2 rounded-lg transition-all ${
                          currentPage === 1
                            ? 'opacity-50 cursor-not-allowed'
                            : 'hover:bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))]'
                        }`}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="text-sm font-medium min-w-[60px] text-center text-[hsl(var(--theme-text-secondary))]">
                        {currentPage} / {Math.ceil(moodHistory.length / itemsPerPage)}
                      </span>
                      <button
                        onClick={() => setCurrentPage(p => Math.min(Math.ceil(moodHistory.length / itemsPerPage), p + 1))}
                        disabled={currentPage >= Math.ceil(moodHistory.length / itemsPerPage)}
                        className={`p-2 rounded-lg transition-all ${
                          currentPage >= Math.ceil(moodHistory.length / itemsPerPage)
                            ? 'opacity-50 cursor-not-allowed'
                            : 'hover:bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))]'
                        }`}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
