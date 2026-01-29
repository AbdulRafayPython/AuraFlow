import React, { useState, useEffect } from 'react';
import { 
  Heart, Activity, TrendingUp, TrendingDown, Minus, Target, Loader2, AlertCircle, 
  Zap, Shield, Coffee, Moon, Droplet, Eye, Brain, Sparkles, RefreshCw,
  Clock, CheckCircle, AlertTriangle, BarChart3, PieChart as PieChartIcon
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAIAgents } from '@/contexts/AIAgentContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  AreaChart, Area, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadialBarChart, RadialBar
} from 'recharts';

// Professional color palette
const COLORS = {
  excellent: '#10b981',
  excellentLight: '#34d399',
  good: '#22c55e',
  goodLight: '#4ade80',
  moderate: '#eab308',
  moderateLight: '#facc15',
  concerning: '#f97316',
  concerningLight: '#fb923c',
  poor: '#ef4444',
  poorLight: '#f87171',
  primary: '#ec4899',
  primaryLight: '#f472b6',
  secondary: '#8b5cf6',
  secondaryLight: '#a78bfa',
  accent: '#06b6d4',
  accentLight: '#22d3ee'
};

// Category colors
const CATEGORY_COLORS: Record<string, string> = {
  activity_balance: '#8b5cf6',
  stress_level: '#f97316',
  communication_health: '#10b981',
  digital_wellbeing: '#06b6d4',
  emotional_wellness: '#ec4899'
};

// Custom Tooltip Component
const CustomTooltip = ({ active, payload, label, isDarkMode }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className={`px-3 py-2 rounded-xl shadow-xl border backdrop-blur-sm ${
        'bg-[hsl(var(--theme-bg-secondary)/0.9)] border-[hsl(var(--theme-border-default))]'
      }`}>
        <p className={`text-sm font-medium mb-1 ${'text-[hsl(var(--theme-text-primary))]'}`}>
          {label}
        </p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-xs" style={{ color: entry.color }}>
            {entry.name}: {typeof entry.value === 'number' ? entry.value.toFixed(0) : entry.value}
            {entry.name.includes('Score') || entry.name.includes('Wellness') ? '%' : ''}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function WellnessAgent() {
  const { isDarkMode } = useTheme();
  const { 
    checkWellness, 
    analyzeWellness, 
    getWellnessRecommendations, 
    getWellnessTrends 
  } = useAIAgents();
  const { user } = useAuth();
  
  const [activeTab, setActiveTab] = useState<'overview' | 'analysis' | 'trends' | 'recommendations'>('overview');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);
  const [isLoadingTrends, setIsLoadingTrends] = useState(false);
  const [timePeriod, setTimePeriod] = useState(24);
  const [wellnessCheck, setWellnessCheck] = useState<any>(null);
  const [wellnessAnalysis, setWellnessAnalysis] = useState<any>(null);
  const [recommendations, setRecommendations] = useState<any>(null);
  const [trends, setTrends] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setError(null);
      const check = await checkWellness();
      setWellnessCheck(check);
      loadRecommendations();
      loadTrends();
    } catch (err: any) {
      console.error('Error loading wellness data:', err);
    }
  };

  const loadRecommendations = async () => {
    setIsLoadingRecommendations(true);
    try {
      const result = await getWellnessRecommendations();
      setRecommendations(result);
    } catch (err: any) {
      console.error('Error loading recommendations:', err);
    } finally {
      setIsLoadingRecommendations(false);
    }
  };

  const loadTrends = async () => {
    setIsLoadingTrends(true);
    try {
      const result = await getWellnessTrends(7);
      setTrends(result);
    } catch (err: any) {
      console.error('Error loading trends:', err);
    } finally {
      setIsLoadingTrends(false);
    }
  };

  const handleAnalyzeWellness = async () => {
    setIsAnalyzing(true);
    setError(null);
    
    try {
      const analysis = await analyzeWellness(timePeriod);
      setWellnessAnalysis(analysis);
      loadRecommendations();
      loadTrends();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getWellnessLevelColor = (level: string) => {
    switch (level?.toLowerCase()) {
      case 'excellent':
        return { bg: 'bg-emerald-500', text: 'text-emerald-500', light: 'bg-emerald-500/20' };
      case 'good':
        return { bg: 'bg-green-500', text: 'text-green-500', light: 'bg-green-500/20' };
      case 'moderate':
      case 'monitor':
        return { bg: 'bg-yellow-500', text: 'text-yellow-500', light: 'bg-yellow-500/20' };
      case 'attention_needed':
      case 'concerning':
        return { bg: 'bg-orange-500', text: 'text-orange-500', light: 'bg-orange-500/20' };
      case 'poor':
        return { bg: 'bg-red-500', text: 'text-red-500', light: 'bg-red-500/20' };
      default:
        return { bg: 'bg-gray-500', text: 'text-gray-500', light: 'bg-gray-500/20' };
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return COLORS.excellent;
    if (score >= 0.6) return COLORS.good;
    if (score >= 0.4) return COLORS.moderate;
    if (score >= 0.2) return COLORS.concerning;
    return COLORS.poor;
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'activity_balance':
        return <Activity className="w-4 h-4" />;
      case 'stress_level':
        return <Brain className="w-4 h-4" />;
      case 'communication_health':
        return <Heart className="w-4 h-4" />;
      case 'digital_wellbeing':
        return <Shield className="w-4 h-4" />;
      default:
        return <Target className="w-4 h-4" />;
    }
  };

  const getRecommendationIcon = (icon: string) => {
    switch (icon) {
      case 'coffee': return <Coffee className="w-4 h-4" />;
      case 'pause': return <Clock className="w-4 h-4" />;
      case 'brain': return <Brain className="w-4 h-4" />;
      case 'moon': return <Moon className="w-4 h-4" />;
      case 'droplet': return <Droplet className="w-4 h-4" />;
      case 'activity': return <Activity className="w-4 h-4" />;
      case 'eye': return <Eye className="w-4 h-4" />;
      case 'sparkles': return <Sparkles className="w-4 h-4" />;
      default: return <Target className="w-4 h-4" />;
    }
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Heart },
    { id: 'analysis', label: 'Analysis', icon: BarChart3 },
    { id: 'trends', label: 'Trends', icon: TrendingUp },
    { id: 'recommendations', label: 'Tips', icon: Sparkles }
  ];

  const categoryChartData = wellnessAnalysis?.analysis?.category_scores 
    ? Object.entries(wellnessAnalysis.analysis.category_scores).map(([key, value]) => ({
        name: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        score: Math.round((value as number) * 100),
        fill: CATEGORY_COLORS[key] || COLORS.primary
      }))
    : [];

  const radialData = wellnessAnalysis?.analysis?.overall_wellness_score
    ? [{
        name: 'Wellness',
        value: Math.round(wellnessAnalysis.analysis.overall_wellness_score * 100),
        fill: getScoreColor(wellnessAnalysis.analysis.overall_wellness_score)
      }]
    : [];

  return (
    <div className="h-full flex flex-col bg-[hsl(var(--theme-bg-primary))]">
      {/* Header with Gradient */}
      <div className="p-5 border-b border-[hsl(var(--theme-border-default))] relative overflow-hidden">
        {/* Gradient accent line at top */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500" />
        
        <div className="flex items-center gap-4 mb-5">
          <div className="relative">
            <div className="absolute inset-0 bg-emerald-500 rounded-xl blur-lg opacity-40"></div>
            <div className="relative p-3 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl shadow-lg border border-emerald-400/30">
              <Heart className="w-6 h-6 text-white" />
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-[hsl(var(--theme-text-primary))] flex items-center gap-2">
              Wellness Monitor
              <Sparkles className="w-4 h-4 text-emerald-400" />
            </h3>
            <p className="text-sm text-[hsl(var(--theme-text-muted))]">
              Digital wellness insights and mental health tracking
            </p>
          </div>
        </div>

        {/* Analysis Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-[hsl(var(--theme-text-secondary))]">
              Period:
            </label>
            <select
              value={timePeriod}
              onChange={(e) => setTimePeriod(Number(e.target.value))}
              disabled={isAnalyzing}
              className="px-4 py-2 rounded-xl text-sm border focus:outline-none focus:ring-2 focus:ring-emerald-500/50 bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))] disabled:opacity-50 transition-all"
            >
              <option value={6}>Last 6 hours</option>
              <option value={12}>Last 12 hours</option>
              <option value={24}>Last 24 hours</option>
              <option value={48}>Last 48 hours</option>
              <option value={168}>Last week</option>
            </select>
          </div>
          
          <button
            onClick={handleAnalyzeWellness}
            disabled={isAnalyzing}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
              isAnalyzing
                ? 'bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-muted))] cursor-not-allowed'
                : 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:shadow-lg hover:shadow-emerald-500/25'
            }`}
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Activity className="w-4 h-4" />
                Analyze Wellness
              </>
            )}
          </button>

          <button
            onClick={loadInitialData}
            disabled={isAnalyzing}
            className="p-2.5 rounded-xl transition-all duration-300 bg-[hsl(var(--theme-bg-secondary))] text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))] border border-[hsl(var(--theme-border-default))] hover:border-[hsl(var(--theme-border-hover))]"
          >
            <RefreshCw className={`w-4 h-4 ${isAnalyzing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 mt-5 p-1.5 rounded-xl bg-[hsl(var(--theme-bg-secondary))] border border-[hsl(var(--theme-border-default))]">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 flex-1 justify-center ${
                  activeTab === tab.id
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/25'
                    : 'text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))] hover:bg-[hsl(var(--theme-bg-tertiary))]'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'hsl(var(--theme-bg-tertiary)) transparent' }}>
        {/* Error Display */}
        {error && (
          <div className="m-5 p-4 rounded-xl border flex items-start gap-3 bg-red-500/10 border-red-500/30">
            <div className="p-2 rounded-lg bg-red-500/20">
              <AlertCircle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h4 className="font-semibold mb-1 text-red-400">Analysis Error</h4>
              <p className="text-sm text-red-300/80">{error}</p>
            </div>
          </div>
        )}

        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="p-5 space-y-5">
            {/* Quick Status Card */}
            {wellnessCheck?.success && (
              <div className={`p-5 rounded-xl border ${'bg-[hsl(var(--theme-bg-secondary)/0.5)] border-[hsl(var(--theme-border-default))]'}`}>
                <div className="flex items-center justify-between mb-4">
                  <h4 className={`font-semibold ${'text-[hsl(var(--theme-text-primary))]'}`}>
                    Current Wellness Status
                  </h4>
                  <div className={`px-3 py-1 rounded-full text-sm font-medium ${getWellnessLevelColor(wellnessCheck.wellness_level).light} ${getWellnessLevelColor(wellnessCheck.wellness_level).text}`}>
                    {wellnessCheck.wellness_level?.replace(/_/g, ' ').toUpperCase()}
                  </div>
                </div>

                {/* Quick Metrics */}
                {wellnessCheck.metrics && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <div className={`p-3 rounded-lg ${'bg-[hsl(var(--theme-bg-tertiary)/0.5)]'}`}>
                      <div className={`text-xs ${'text-[hsl(var(--theme-text-muted))]'}`}>Messages Today</div>
                      <div className={`text-xl font-bold ${'text-[hsl(var(--theme-text-primary))]'}`}>
                        {wellnessCheck.metrics.messages_today || 0}
                      </div>
                    </div>
                    <div className={`p-3 rounded-lg ${'bg-[hsl(var(--theme-bg-tertiary)/0.5)]'}`}>
                      <div className={`text-xs ${'text-[hsl(var(--theme-text-muted))]'}`}>Active Hours</div>
                      <div className={`text-xl font-bold ${'text-[hsl(var(--theme-text-primary))]'}`}>
                        {wellnessCheck.metrics.active_duration_hours?.toFixed(1) || '0'}h
                      </div>
                    </div>
                    <div className={`p-3 rounded-lg ${'bg-[hsl(var(--theme-bg-tertiary)/0.5)]'}`}>
                      <div className={`text-xs ${'text-[hsl(var(--theme-text-muted))]'}`}>Msgs/Hour</div>
                      <div className={`text-xl font-bold ${'text-[hsl(var(--theme-text-primary))]'}`}>
                        {wellnessCheck.metrics.avg_messages_per_hour?.toFixed(1) || '0'}
                      </div>
                    </div>
                    <div className={`p-3 rounded-lg ${'bg-[hsl(var(--theme-bg-tertiary)/0.5)]'}`}>
                      <div className={`text-xs ${'text-[hsl(var(--theme-text-muted))]'}`}>Peak Hour</div>
                      <div className={`text-xl font-bold ${'text-[hsl(var(--theme-text-primary))]'}`}>
                        {wellnessCheck.metrics.peak_hour !== null ? `${wellnessCheck.metrics.peak_hour}:00` : '-'}
                      </div>
                    </div>
                  </div>
                )}

                {/* Suggestions */}
                {wellnessCheck.suggestions && wellnessCheck.suggestions.length > 0 && (
                  <div className="space-y-2">
                    <div className={`text-sm font-medium ${'text-[hsl(var(--theme-text-primary))]'}`}>Suggestions</div>
                    {wellnessCheck.suggestions.slice(0, 3).map((suggestion: any, index: number) => (
                      <div 
                        key={index}
                        className={`flex items-start gap-3 p-3 rounded-lg ${
                          suggestion.priority === 'high' 
                            ? isDarkMode ? 'bg-orange-900/20 border border-orange-800/30' : 'bg-orange-50 border border-orange-200'
                            : suggestion.priority === 'medium'
                            ? isDarkMode ? 'bg-yellow-900/20 border border-yellow-800/30' : 'bg-yellow-50 border border-yellow-200'
                            : isDarkMode ? 'bg-emerald-900/20 border border-emerald-800/30' : 'bg-emerald-50 border border-emerald-200'
                        }`}
                      >
                        <div className={`p-1.5 rounded-lg ${
                          suggestion.priority === 'high' ? 'bg-orange-500/20' :
                          suggestion.priority === 'medium' ? 'bg-yellow-500/20' : 'bg-emerald-500/20'
                        }`}>
                          {suggestion.type === 'break' ? <Coffee className="w-4 h-4 text-orange-500" /> :
                           suggestion.type === 'sleep' ? <Moon className="w-4 h-4 text-blue-500" /> :
                           suggestion.type === 'wellness' ? <Heart className="w-4 h-4 text-pink-500" /> :
                           <Sparkles className="w-4 h-4 text-emerald-500" />}
                        </div>
                        <p className={`text-sm ${'text-[hsl(var(--theme-text-primary))]'}`}>{suggestion.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* No Data State */}
            {!wellnessCheck?.success && !isAnalyzing && (
              <div className="text-center py-16">
                <div className={`w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center ${'bg-[hsl(var(--theme-bg-tertiary)/0.5)]'}`}>
                  <Heart className={`w-10 h-10 ${'text-[hsl(var(--theme-text-muted))]'}`} />
                </div>
                <p className={`font-semibold mb-2 ${'text-[hsl(var(--theme-text-muted))]'}`}>No Wellness Data Yet</p>
                <p className={`text-sm ${'text-[hsl(var(--theme-text-muted))]'}`}>Click "Analyze Wellness" to get started</p>
              </div>
            )}

            {/* Quick Recommendations Preview */}
            {recommendations?.recommendations && recommendations.recommendations.length > 0 && (
              <div className={`p-5 rounded-xl border ${'bg-[hsl(var(--theme-bg-secondary)/0.5)] border-[hsl(var(--theme-border-default))]'}`}>
                <div className="flex items-center justify-between mb-4">
                  <h4 className={`font-semibold ${'text-[hsl(var(--theme-text-primary))]'}`}>Top Recommendations</h4>
                  <button onClick={() => setActiveTab('recommendations')} className={`text-sm text-emerald-500 hover:text-emerald-400`}>View All →</button>
                </div>
                <div className="space-y-2">
                  {recommendations.recommendations.slice(0, 3).map((rec: any, index: number) => (
                    <div key={index} className={`flex items-center gap-3 p-3 rounded-lg ${'bg-[hsl(var(--theme-bg-tertiary)/0.5)]'}`}>
                      <div className={`p-2 rounded-lg ${
                        rec.priority === 'high' ? 'bg-red-500/20 text-red-500' :
                        rec.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-500' : 'bg-emerald-500/20 text-emerald-500'
                      }`}>
                        {getRecommendationIcon(rec.icon)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`font-medium text-sm truncate ${'text-[hsl(var(--theme-text-primary))]'}`}>{rec.title}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ANALYSIS TAB */}
        {activeTab === 'analysis' && (
          <div className="p-5 space-y-5">
            {wellnessAnalysis?.success ? (
              <>
                {/* Overall Score with Radial Chart */}
                <div className={`p-5 rounded-xl border ${'bg-[hsl(var(--theme-bg-secondary)/0.5)] border-[hsl(var(--theme-border-default))]'}`}>
                  <h4 className={`font-semibold mb-4 ${'text-[hsl(var(--theme-text-primary))]'}`}>Overall Wellness Score</h4>
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    <div className="relative w-48 h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadialBarChart cx="50%" cy="50%" innerRadius="70%" outerRadius="100%" startAngle={180} endAngle={0} data={radialData}>
                          <RadialBar dataKey="value" cornerRadius={10} background={{ fill: isDarkMode ? '#1e293b' : '#f1f5f9' }} />
                        </RadialBarChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <div className={`text-4xl font-bold ${getWellnessLevelColor(wellnessAnalysis.analysis.wellness_level).text}`}>
                          {Math.round(wellnessAnalysis.analysis.overall_wellness_score * 100)}
                        </div>
                        <div className={`text-sm ${'text-[hsl(var(--theme-text-muted))]'}`}>out of 100</div>
                      </div>
                    </div>
                    <div className="flex-1 space-y-3">
                      <div className={`px-4 py-2 rounded-lg inline-block ${getWellnessLevelColor(wellnessAnalysis.analysis.wellness_level).light}`}>
                        <span className={`font-semibold ${getWellnessLevelColor(wellnessAnalysis.analysis.wellness_level).text}`}>
                          {wellnessAnalysis.analysis.wellness_level?.replace(/_/g, ' ').toUpperCase()}
                        </span>
                      </div>
                      <p className={`text-sm ${'text-[hsl(var(--theme-text-secondary))]'}`}>
                        Based on your activity over the last {wellnessAnalysis.analysis.time_period_hours} hours
                      </p>
                    </div>
                  </div>
                </div>

                {/* Category Scores */}
                {categoryChartData.length > 0 && (
                  <div className={`p-5 rounded-xl border ${'bg-[hsl(var(--theme-bg-secondary)/0.5)] border-[hsl(var(--theme-border-default))]'}`}>
                    <h4 className={`font-semibold mb-4 ${'text-[hsl(var(--theme-text-primary))]'}`}>Wellness Categories</h4>
                    <div className="h-64 mb-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={categoryChartData} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#334155' : '#e2e8f0'} />
                          <XAxis type="number" domain={[0, 100]} tick={{ fill: isDarkMode ? '#94a3b8' : '#64748b', fontSize: 12 }} />
                          <YAxis dataKey="name" type="category" width={120} tick={{ fill: isDarkMode ? '#94a3b8' : '#64748b', fontSize: 12 }} />
                          <Tooltip content={<CustomTooltip isDarkMode={isDarkMode} />} />
                          <Bar dataKey="score" radius={[0, 6, 6, 0]}>
                            {categoryChartData.map((entry, index) => (
                              <Cell key={index} fill={entry.fill} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {Object.entries(wellnessAnalysis.analysis.category_scores || {}).map(([key, value]) => (
                        <div key={key} className={`p-3 rounded-lg border ${isDarkMode ? 'bg-slate-700/50 border-slate-600/50' : 'bg-gray-50 border-gray-200'}`}>
                          <div className="flex items-center gap-2 mb-2">
                            <div className="p-1.5 rounded-lg" style={{ backgroundColor: `${CATEGORY_COLORS[key]}20` }}>
                              <span style={{ color: CATEGORY_COLORS[key] }}>{getCategoryIcon(key)}</span>
                            </div>
                            <span className={`text-xs font-medium capitalize ${'text-[hsl(var(--theme-text-primary))]'}`}>
                              {key.replace(/_/g, ' ')}
                            </span>
                          </div>
                          <div className={`text-2xl font-bold`} style={{ color: getScoreColor(value as number) }}>
                            {Math.round((value as number) * 100)}%
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Risk Factors */}
                {wellnessAnalysis.analysis.risk_factors && wellnessAnalysis.analysis.risk_factors.length > 0 && (
                  <div className={`p-5 rounded-xl border ${'bg-[hsl(var(--theme-bg-secondary)/0.5)] border-[hsl(var(--theme-border-default))]'}`}>
                    <h4 className={`font-semibold mb-4 flex items-center gap-2 ${'text-[hsl(var(--theme-text-primary))]'}`}>
                      <AlertTriangle className="w-5 h-5 text-orange-500" />Risk Factors
                    </h4>
                    <div className="space-y-3">
                      {wellnessAnalysis.analysis.risk_factors.map((factor: any, index: number) => (
                        <div key={index} className={`p-4 rounded-lg border ${
                          factor.severity === 'high' ? isDarkMode ? 'bg-red-900/20 border-red-800/30' : 'bg-red-50 border-red-200' :
                          factor.severity === 'medium' ? isDarkMode ? 'bg-orange-900/20 border-orange-800/30' : 'bg-orange-50 border-orange-200' :
                          isDarkMode ? 'bg-yellow-900/20 border-yellow-800/30' : 'bg-yellow-50 border-yellow-200'
                        }`}>
                          <div className="flex items-start gap-3">
                            <AlertCircle className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                              factor.severity === 'high' ? 'text-red-500' : factor.severity === 'medium' ? 'text-orange-500' : 'text-yellow-500'
                            }`} />
                            <div className="flex-1">
                              <div className={`font-semibold ${
                                factor.severity === 'high' ? 'text-red-500' : factor.severity === 'medium' ? 'text-orange-500' : 'text-yellow-500'
                              }`}>{factor.factor}</div>
                              <p className={`text-sm mt-1 ${'text-[hsl(var(--theme-text-secondary))]'}`}>{factor.description}</p>
                              <div className="flex items-center gap-4 mt-2 text-xs">
                                <span className={`px-2 py-0.5 rounded-full ${
                                  factor.severity === 'high' ? 'bg-red-500/20 text-red-500' :
                                  factor.severity === 'medium' ? 'bg-orange-500/20 text-orange-500' : 'bg-yellow-500/20 text-yellow-500'
                                }`}>{factor.severity} severity</span>
                                <span className={'text-[hsl(var(--theme-text-muted))]'}>Impact: {Math.round(factor.impact_score * 100)}%</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Positive Indicators */}
                {wellnessAnalysis.analysis.positive_indicators && wellnessAnalysis.analysis.positive_indicators.length > 0 && (
                  <div className={`p-5 rounded-xl border ${'bg-[hsl(var(--theme-bg-secondary)/0.5)] border-[hsl(var(--theme-border-default))]'}`}>
                    <h4 className={`font-semibold mb-4 flex items-center gap-2 ${'text-[hsl(var(--theme-text-primary))]'}`}>
                      <CheckCircle className="w-5 h-5 text-emerald-500" />Positive Indicators
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {wellnessAnalysis.analysis.positive_indicators.map((indicator: string, index: number) => (
                        <div key={index} className={`flex items-center gap-2 px-3 py-2 rounded-lg ${isDarkMode ? 'bg-emerald-900/20 text-emerald-400' : 'bg-emerald-50 text-emerald-700'}`}>
                          <CheckCircle className="w-4 h-4" />
                          <span className="text-sm">{indicator}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Mood-Wellness Correlation */}
                {wellnessAnalysis.mood_summary?.has_mood_data && (
                  <div className={`p-5 rounded-xl border ${isDarkMode ? 'bg-gradient-to-br from-purple-900/20 to-pink-900/20 border-purple-800/30' : 'bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200 shadow-sm'}`}>
                    <h4 className={`font-semibold mb-4 flex items-center gap-2 ${'text-[hsl(var(--theme-text-primary))]'}`}>
                      <Brain className="w-5 h-5 text-purple-500" />Mood-Wellness Correlation
                    </h4>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                      {/* Dominant Mood */}
                      <div className={`p-4 rounded-lg ${'bg-[hsl(var(--theme-bg-secondary)/0.5)]'}`}>
                        <div className={`text-xs ${'text-[hsl(var(--theme-text-muted))]'} mb-1`}>Dominant Mood</div>
                        <div className={`text-lg font-bold capitalize ${
                          wellnessAnalysis.mood_summary.dominant_mood === 'positive' ? 'text-emerald-500' :
                          wellnessAnalysis.mood_summary.dominant_mood === 'negative' ? 'text-red-500' : 'text-gray-500'
                        }`}>
                          {wellnessAnalysis.mood_summary.dominant_mood || 'Neutral'}
                        </div>
                      </div>
                      
                      {/* Mood Trend */}
                      <div className={`p-4 rounded-lg ${'bg-[hsl(var(--theme-bg-secondary)/0.5)]'}`}>
                        <div className={`text-xs ${'text-[hsl(var(--theme-text-muted))]'} mb-1`}>Mood Trend</div>
                        <div className="flex items-center gap-2">
                          {wellnessAnalysis.mood_summary.mood_trend === 'improving' ? (
                            <><TrendingUp className="w-5 h-5 text-emerald-500" /><span className="text-lg font-bold text-emerald-500">Improving</span></>
                          ) : wellnessAnalysis.mood_summary.mood_trend === 'declining' ? (
                            <><TrendingDown className="w-5 h-5 text-red-500" /><span className="text-lg font-bold text-red-500">Declining</span></>
                          ) : (
                            <><Minus className="w-5 h-5 text-gray-500" /><span className="text-lg font-bold text-gray-500">Stable</span></>
                          )}
                        </div>
                      </div>
                      
                      {/* Emotional Wellness Score */}
                      <div className={`p-4 rounded-lg ${'bg-[hsl(var(--theme-bg-secondary)/0.5)]'}`}>
                        <div className={`text-xs ${'text-[hsl(var(--theme-text-muted))]'} mb-1`}>Emotional Wellness</div>
                        <div className={`text-lg font-bold`} style={{ color: getScoreColor(wellnessAnalysis.analysis.category_scores?.emotional_wellness || 0) }}>
                          {Math.round((wellnessAnalysis.analysis.category_scores?.emotional_wellness || 0) * 100)}%
                        </div>
                      </div>
                    </div>
                    
                    {/* Sentiment Distribution */}
                    {wellnessAnalysis.mood_summary.sentiment_distribution && Object.keys(wellnessAnalysis.mood_summary.sentiment_distribution).length > 0 && (
                      <div className="mb-4">
                        <div className={`text-xs font-medium ${'text-[hsl(var(--theme-text-muted))]'} mb-2`}>Sentiment Distribution</div>
                        <div className="flex h-4 rounded-full overflow-hidden">
                          {(() => {
                            const dist = wellnessAnalysis.mood_summary.sentiment_distribution;
                            const total = Object.values(dist).reduce((a: number, b: any) => a + b, 0) as number;
                            if (total === 0) return null;
                            return (
                              <>
                                {dist.positive > 0 && (
                                  <div 
                                    className="bg-emerald-500 transition-all" 
                                    style={{ width: `${(dist.positive / total) * 100}%` }}
                                    title={`Positive: ${Math.round((dist.positive / total) * 100)}%`}
                                  />
                                )}
                                {dist.neutral > 0 && (
                                  <div 
                                    className="bg-gray-400 transition-all" 
                                    style={{ width: `${(dist.neutral / total) * 100}%` }}
                                    title={`Neutral: ${Math.round((dist.neutral / total) * 100)}%`}
                                  />
                                )}
                                {dist.negative > 0 && (
                                  <div 
                                    className="bg-red-500 transition-all" 
                                    style={{ width: `${(dist.negative / total) * 100}%` }}
                                    title={`Negative: ${Math.round((dist.negative / total) * 100)}%`}
                                  />
                                )}
                              </>
                            );
                          })()}
                        </div>
                        <div className="flex justify-between mt-2 text-xs">
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full bg-emerald-500" />
                            <span className={'text-[hsl(var(--theme-text-secondary))]'}>Positive</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full bg-gray-400" />
                            <span className={'text-[hsl(var(--theme-text-secondary))]'}>Neutral</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full bg-red-500" />
                            <span className={'text-[hsl(var(--theme-text-secondary))]'}>Negative</span>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Mood Alerts */}
                    {wellnessAnalysis.mood_summary.mood_alerts && wellnessAnalysis.mood_summary.mood_alerts.length > 0 && (
                      <div className="space-y-2">
                        <div className={`text-xs font-medium ${'text-[hsl(var(--theme-text-muted))]'}`}>Mood Alerts</div>
                        {wellnessAnalysis.mood_summary.mood_alerts.map((alert: any, index: number) => (
                          <div key={index} className={`flex items-start gap-2 p-3 rounded-lg ${
                            alert.severity === 'warning' 
                              ? isDarkMode ? 'bg-orange-900/20 border border-orange-800/30' : 'bg-orange-50 border border-orange-200'
                              : isDarkMode ? 'bg-blue-900/20 border border-blue-800/30' : 'bg-blue-50 border border-blue-200'
                          }`}>
                            <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${alert.severity === 'warning' ? 'text-orange-500' : 'text-blue-500'}`} />
                            <span className={`text-sm ${'text-[hsl(var(--theme-text-primary))]'}`}>{alert.message}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Connection Info */}
                    <div className={`mt-4 p-3 rounded-lg ${'bg-[hsl(var(--theme-bg-tertiary)/0.3)]'}`}>
                      <p className={`text-xs ${'text-[hsl(var(--theme-text-muted))]'}`}>
                        <span className="font-medium">💡 Tip:</span> Your emotional wellness score is calculated from your recent message sentiment patterns. 
                        Positive communication habits contribute to better overall wellness.
                      </p>
                    </div>
                  </div>
                )}

                {/* No Mood Data Info */}
                {!wellnessAnalysis.mood_summary?.has_mood_data && (
                  <div className={`p-5 rounded-xl border ${'bg-[hsl(var(--theme-bg-secondary)/0.5)] border-[hsl(var(--theme-border-default))]'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`p-3 rounded-xl ${isDarkMode ? 'bg-purple-900/20' : 'bg-purple-50'}`}>
                        <Brain className={`w-6 h-6 ${'text-purple-400'}`} />
                      </div>
                      <div>
                        <h4 className={`font-semibold ${'text-[hsl(var(--theme-text-primary))]'}`}>Mood Tracking Available</h4>
                        <p className={`text-sm ${'text-[hsl(var(--theme-text-secondary))]'}`}>
                          Send messages to start tracking your emotional wellness patterns
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-16">
                <div className={`w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center ${'bg-[hsl(var(--theme-bg-tertiary)/0.5)]'}`}>
                  <BarChart3 className={`w-10 h-10 ${'text-[hsl(var(--theme-text-muted))]'}`} />
                </div>
                <p className={`font-semibold mb-2 ${'text-[hsl(var(--theme-text-muted))]'}`}>No Analysis Available</p>
                <p className={`text-sm ${'text-[hsl(var(--theme-text-muted))]'}`}>Click "Analyze Wellness" to get a detailed wellness report</p>
              </div>
            )}
          </div>
        )}

        {/* TRENDS TAB */}
        {activeTab === 'trends' && (
          <div className="p-5 space-y-5">
            {isLoadingTrends ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 className="w-10 h-10 animate-spin text-emerald-500 mb-3" />
                <p className={`text-sm ${'text-[hsl(var(--theme-text-muted))]'}`}>Loading trends...</p>
              </div>
            ) : trends?.trends && trends.trends.length > 0 ? (
              <>
                {/* Trend Summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className={`p-4 rounded-xl border ${'bg-[hsl(var(--theme-bg-secondary)/0.5)] border-[hsl(var(--theme-border-default))]'}`}>
                    <div className={`text-xs ${'text-[hsl(var(--theme-text-muted))]'}`}>Total Checks</div>
                    <div className={`text-2xl font-bold ${'text-[hsl(var(--theme-text-primary))]'}`}>{trends.total_checks || 0}</div>
                  </div>
                  <div className={`p-4 rounded-xl border ${'bg-[hsl(var(--theme-bg-secondary)/0.5)] border-[hsl(var(--theme-border-default))]'}`}>
                    <div className={`text-xs ${'text-[hsl(var(--theme-text-muted))]'}`}>Period</div>
                    <div className={`text-2xl font-bold ${'text-[hsl(var(--theme-text-primary))]'}`}>{trends.days || 7} Days</div>
                  </div>
                  <div className={`p-4 rounded-xl border ${'bg-[hsl(var(--theme-bg-secondary)/0.5)] border-[hsl(var(--theme-border-default))]'}`}>
                    <div className={`text-xs ${'text-[hsl(var(--theme-text-muted))]'}`}>Avg Score</div>
                    <div className={`text-2xl font-bold text-emerald-500`}>
                      {trends.trends.length > 0 ? Math.round(trends.trends.reduce((acc: number, t: any) => acc + t.wellness_score, 0) / trends.trends.length) : 0}%
                    </div>
                  </div>
                  <div className={`p-4 rounded-xl border ${'bg-[hsl(var(--theme-bg-secondary)/0.5)] border-[hsl(var(--theme-border-default))]'}`}>
                    <div className={`text-xs ${'text-[hsl(var(--theme-text-muted))]'}`}>Trend</div>
                    <div className="flex items-center gap-1">
                      {(() => {
                        const first = trends.trends[0]?.wellness_score || 0;
                        const last = trends.trends[trends.trends.length - 1]?.wellness_score || 0;
                        const diff = last - first;
                        return diff > 5 ? (<><TrendingUp className="w-5 h-5 text-emerald-500" /><span className="text-lg font-bold text-emerald-500">Up</span></>) :
                               diff < -5 ? (<><TrendingDown className="w-5 h-5 text-red-500" /><span className="text-lg font-bold text-red-500">Down</span></>) :
                               (<><Minus className="w-5 h-5 text-gray-500" /><span className="text-lg font-bold text-gray-500">Stable</span></>);
                      })()}
                    </div>
                  </div>
                </div>

                {/* Wellness Trend Chart */}
                <div className={`p-5 rounded-xl border ${'bg-[hsl(var(--theme-bg-secondary)/0.5)] border-[hsl(var(--theme-border-default))]'}`}>
                  <h4 className={`font-semibold mb-4 ${'text-[hsl(var(--theme-text-primary))]'}`}>Wellness Score Over Time</h4>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trends.trends}>
                        <defs>
                          <linearGradient id="wellnessGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={COLORS.excellent} stopOpacity={0.3}/>
                            <stop offset="95%" stopColor={COLORS.excellent} stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#334155' : '#e2e8f0'} />
                        <XAxis dataKey="date" tick={{ fill: isDarkMode ? '#94a3b8' : '#64748b', fontSize: 12 }}
                          tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} />
                        <YAxis domain={[0, 100]} tick={{ fill: isDarkMode ? '#94a3b8' : '#64748b', fontSize: 12 }} />
                        <Tooltip content={<CustomTooltip isDarkMode={isDarkMode} />} />
                        <Area type="monotone" dataKey="wellness_score" name="Wellness Score" stroke={COLORS.excellent} strokeWidth={2} fill="url(#wellnessGradient)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Daily Breakdown */}
                <div className={`p-5 rounded-xl border ${'bg-[hsl(var(--theme-bg-secondary)/0.5)] border-[hsl(var(--theme-border-default))]'}`}>
                  <h4 className={`font-semibold mb-4 ${'text-[hsl(var(--theme-text-primary))]'}`}>Daily Breakdown</h4>
                  <div className="space-y-3">
                    {trends.trends.slice(-7).map((day: any, index: number) => (
                      <div key={index} className={`p-3 rounded-lg ${'bg-[hsl(var(--theme-bg-tertiary)/0.5)]'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-sm font-medium ${'text-[hsl(var(--theme-text-primary))]'}`}>
                            {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                          </span>
                          <span className={`text-sm font-bold ${day.wellness_score >= 70 ? 'text-emerald-500' : day.wellness_score >= 50 ? 'text-yellow-500' : 'text-red-500'}`}>
                            {day.wellness_score}%
                          </span>
                        </div>
                        <div className={`h-2 rounded-full overflow-hidden ${'bg-[hsl(var(--theme-bg-tertiary))]'}`}>
                          <div className="h-full rounded-full transition-all" style={{ 
                            width: `${day.wellness_score}%`,
                            backgroundColor: day.wellness_score >= 70 ? COLORS.excellent : day.wellness_score >= 50 ? COLORS.moderate : COLORS.poor
                          }} />
                        </div>
                        <div className="flex items-center justify-between mt-2 text-xs">
                          <span className={'text-[hsl(var(--theme-text-muted))]'}>{day.checks_count} checks</span>
                          <span className={`px-2 py-0.5 rounded-full ${getWellnessLevelColor(day.dominant_level).light} ${getWellnessLevelColor(day.dominant_level).text}`}>
                            {day.dominant_level}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-16">
                <div className={`w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center ${'bg-[hsl(var(--theme-bg-tertiary)/0.5)]'}`}>
                  <TrendingUp className={`w-10 h-10 ${'text-[hsl(var(--theme-text-muted))]'}`} />
                </div>
                <p className={`font-semibold mb-2 ${'text-[hsl(var(--theme-text-muted))]'}`}>No Trend Data Yet</p>
                <p className={`text-sm ${'text-[hsl(var(--theme-text-muted))]'}`}>Analyze wellness regularly to build trend data</p>
              </div>
            )}
          </div>
        )}

        {/* RECOMMENDATIONS TAB */}
        {activeTab === 'recommendations' && (
          <div className="p-5 space-y-5">
            {isLoadingRecommendations ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 className="w-10 h-10 animate-spin text-emerald-500 mb-3" />
                <p className={`text-sm ${'text-[hsl(var(--theme-text-muted))]'}`}>Loading recommendations...</p>
              </div>
            ) : recommendations?.recommendations && recommendations.recommendations.length > 0 ? (
              <>
                {/* Status Banner */}
                <div className={`p-4 rounded-xl border flex items-center gap-4 ${
                  recommendations.wellness_level === 'good' 
                    ? isDarkMode ? 'bg-emerald-900/20 border-emerald-800/30' : 'bg-emerald-50 border-emerald-200'
                    : isDarkMode ? 'bg-yellow-900/20 border-yellow-800/30' : 'bg-yellow-50 border-yellow-200'
                }`}>
                  <div className={`p-3 rounded-xl ${recommendations.wellness_level === 'good' ? 'bg-emerald-500/20' : 'bg-yellow-500/20'}`}>
                    {recommendations.wellness_level === 'good' ? <CheckCircle className="w-6 h-6 text-emerald-500" /> : <AlertTriangle className="w-6 h-6 text-yellow-500" />}
                  </div>
                  <div>
                    <div className={`font-semibold ${'text-[hsl(var(--theme-text-primary))]'}`}>
                      {recommendations.wellness_level === 'good' ? 'You\'re doing great!' : 'Some areas need attention'}
                    </div>
                    <p className={`text-sm ${'text-[hsl(var(--theme-text-secondary))]'}`}>
                      {recommendations.concerns_count === 0 ? 'Keep up the healthy habits!' : `${recommendations.concerns_count} concern${recommendations.concerns_count > 1 ? 's' : ''} identified`}
                    </p>
                  </div>
                </div>

                {/* Recommendations List */}
                <div className="space-y-3">
                  {recommendations.recommendations.map((rec: any, index: number) => (
                    <div key={index} className={`p-4 rounded-xl border transition-all hover:shadow-md ${
                      isDarkMode ? 'bg-slate-800/50 border-slate-700/50 hover:border-slate-600' : 'bg-white border-gray-200 hover:border-gray-300 shadow-sm'
                    }`}>
                      <div className="flex items-start gap-4">
                        <div className={`p-3 rounded-xl flex-shrink-0 ${
                          rec.priority === 'high' ? 'bg-red-500/20' : rec.priority === 'medium' ? 'bg-yellow-500/20' : 'bg-emerald-500/20'
                        }`}>
                          <span className={rec.priority === 'high' ? 'text-red-500' : rec.priority === 'medium' ? 'text-yellow-500' : 'text-emerald-500'}>
                            {getRecommendationIcon(rec.icon)}
                          </span>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <h5 className={`font-semibold ${'text-[hsl(var(--theme-text-primary))]'}`}>{rec.title}</h5>
                            <span className={`text-xs px-2 py-1 rounded-full ${
                              rec.priority === 'high' ? 'bg-red-500/20 text-red-500' :
                              rec.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-500' : 'bg-emerald-500/20 text-emerald-500'
                            }`}>{rec.priority}</span>
                          </div>
                          <p className={`text-sm ${'text-[hsl(var(--theme-text-secondary))]'}`}>{rec.description}</p>
                          {rec.category && (
                            <span className={`inline-block mt-2 text-xs px-2 py-1 rounded-full ${
                              'bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-secondary))]'
                            }`}>{rec.category}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-16">
                <div className={`w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center ${'bg-[hsl(var(--theme-bg-tertiary)/0.5)]'}`}>
                  <Sparkles className={`w-10 h-10 ${'text-[hsl(var(--theme-text-muted))]'}`} />
                </div>
                <p className={`font-semibold mb-2 ${'text-[hsl(var(--theme-text-muted))]'}`}>No Recommendations Yet</p>
                <p className={`text-sm ${'text-[hsl(var(--theme-text-muted))]'}`}>Analyze wellness to get personalized recommendations</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}