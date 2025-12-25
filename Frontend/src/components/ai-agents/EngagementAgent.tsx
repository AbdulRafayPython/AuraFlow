import React, { useState, useEffect } from 'react';
import { TrendingUp, Users, MessageSquare, Target, Loader2, AlertCircle, BarChart3, Clock } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAIAgents } from '@/contexts/AIAgentContext';
import { useAuth } from '@/contexts/AuthContext';

export default function EngagementAgent() {
  const { isDarkMode } = useTheme();
  const { analyzeEngagement, getEngagementMetrics, getEngagementTrends } = useAIAgents();
  const { user } = useAuth();
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(false);
  const [isLoadingTrends, setIsLoadingTrends] = useState(false);
  const [timePeriod, setTimePeriod] = useState(24);
  const [channelId, setChannelId] = useState<string>('');
  const [engagementAnalysis, setEngagementAnalysis] = useState<any>(null);
  const [engagementMetrics, setEngagementMetrics] = useState<any>(null);
  const [engagementTrends, setEngagementTrends] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadEngagementMetrics();
    loadEngagementTrends();
  }, []);

  const loadEngagementMetrics = async () => {
    setIsLoadingMetrics(true);
    try {
      const metrics = await getEngagementMetrics(timePeriod);
      setEngagementMetrics(metrics);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoadingMetrics(false);
    }
  };

  const loadEngagementTrends = async () => {
    setIsLoadingTrends(true);
    try {
      const trends = await getEngagementTrends(7); // Last 7 days
      setEngagementTrends(trends);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoadingTrends(false);
    }
  };

  const handleAnalyzeEngagement = async () => {
    setIsAnalyzing(true);
    setError(null);
    
    try {
      const analysis = await analyzeEngagement(timePeriod, channelId || undefined);
      setEngagementAnalysis(analysis);
      await loadEngagementMetrics(); // Refresh metrics
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getEngagementLevelColor = (level: string) => {
    switch (level) {
      case 'high':
        return 'text-green-500 bg-green-100 border-green-200 dark:bg-green-900/30 dark:border-green-800';
      case 'moderate':
        return 'text-yellow-500 bg-yellow-100 border-yellow-200 dark:bg-yellow-900/30 dark:border-yellow-800';
      case 'low':
        return 'text-red-500 bg-red-100 border-red-200 dark:bg-red-900/30 dark:border-red-800';
      default:
        return 'text-gray-500 bg-gray-100 border-gray-200 dark:bg-gray-900/30 dark:border-gray-800';
    }
  };

  const getTrendIcon = (direction: string) => {
    switch (direction) {
      case 'up':
        return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'down':
        return <Target className="w-4 h-4 text-red-500" />; 
      case 'stable':
      default:
        return <BarChart3 className="w-4 h-4 text-gray-500" />;
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

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className={`p-4 border-b ${isDarkMode ? 'border-slate-700' : 'border-gray-200'}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-500/20 rounded-lg">
            <TrendingUp className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Engagement Analytics
            </h3>
            <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Track user interaction patterns and community activity
            </p>
          </div>
        </div>

        {/* Analysis Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className={`text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Time Period:
            </label>
            <select
              value={timePeriod}
              onChange={(e) => setTimePeriod(Number(e.target.value))}
              disabled={isAnalyzing}
              className={`px-3 py-1.5 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                isDarkMode 
                  ? 'bg-slate-800 border-slate-600 text-white' 
                  : 'bg-white border-gray-300 text-gray-900'
              } disabled:opacity-50`}
            >
              <option value={6}>Last 6 hours</option>
              <option value={12}>Last 12 hours</option>
              <option value={24}>Last 24 hours</option>
              <option value={48}>Last 48 hours</option>
              <option value={168}>Last week</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className={`text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Channel ID (Optional):
            </label>
            <input
              type="text"
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              placeholder="Specific channel"
              disabled={isAnalyzing}
              className={`px-3 py-1.5 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500 w-32 ${
                isDarkMode 
                  ? 'bg-slate-800 border-slate-600 text-white placeholder-gray-500' 
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
              } disabled:opacity-50`}
            />
          </div>
          
          <button
            onClick={handleAnalyzeEngagement}
            disabled={isAnalyzing}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              isAnalyzing
                ? isDarkMode
                  ? 'bg-slate-700 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
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
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Error Display */}
        {error && (
          <div className={`m-4 p-3 rounded-lg border flex items-start gap-2 ${
            isDarkMode ? 'bg-red-900/20 border-red-800 text-red-400' : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            <AlertCircle className="w-5 h-5 mt-0.5" />
            <div>
              <h4 className="font-medium mb-1">Analysis Failed</h4>
              <p className="text-sm">{error}</p>
            </div>
          </div>
        )}

        {/* Quick Metrics */}
        {engagementMetrics && (
          <div className="p-4 border-b border-slate-700">
            <h4 className={`font-medium mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Quick Metrics
            </h4>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className={`p-3 rounded-lg border ${
                isDarkMode ? 'bg-slate-800/50 border-slate-600' : 'bg-gray-50 border-gray-200'
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  <MessageSquare className="w-4 h-4 text-blue-500" />
                  <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Messages
                  </span>
                </div>
                <div className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  {formatNumber(engagementMetrics.total_messages || 0)}
                </div>
              </div>

              <div className={`p-3 rounded-lg border ${
                isDarkMode ? 'bg-slate-800/50 border-slate-600' : 'bg-gray-50 border-gray-200'
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  <Users className="w-4 h-4 text-green-500" />
                  <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Active Users
                  </span>
                </div>
                <div className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  {engagementMetrics.unique_users || 0}
                </div>
              </div>

              <div className={`p-3 rounded-lg border ${
                isDarkMode ? 'bg-slate-800/50 border-slate-600' : 'bg-gray-50 border-gray-200'
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-purple-500" />
                  <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Avg Response
                  </span>
                </div>
                <div className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  {engagementMetrics.avg_response_time ? `${Math.round(engagementMetrics.avg_response_time)}m` : 'N/A'}
                </div>
              </div>

              <div className={`p-3 rounded-lg border ${
                isDarkMode ? 'bg-slate-800/50 border-slate-600' : 'bg-gray-50 border-gray-200'
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  <Target className="w-4 h-4 text-orange-500" />
                  <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Engagement Rate
                  </span>
                </div>
                <div className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  {engagementMetrics.engagement_rate ? formatPercentage(engagementMetrics.engagement_rate) : '0%'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Current Engagement Analysis */}
        {engagementAnalysis && engagementAnalysis.success && (
          <div className="p-4 border-b border-slate-700">
            <h4 className={`font-medium mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Engagement Analysis Results
            </h4>

            {/* Overall Engagement Level */}
            <div className={`p-4 rounded-lg border mb-4 ${
              isDarkMode ? 'bg-slate-800/50 border-slate-600' : 'bg-gray-50 border-gray-200'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h5 className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    Overall Engagement
                  </h5>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`px-2 py-1 rounded-full text-xs border ${
                      getEngagementLevelColor(engagementAnalysis.analysis.overall_engagement_level)
                    }`}>
                      {engagementAnalysis.analysis.overall_engagement_level} engagement
                    </span>
                    <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Score: {Math.round(engagementAnalysis.analysis.engagement_score * 100)}/100
                    </span>
                  </div>
                </div>
                {getTrendIcon(engagementAnalysis.analysis.trend_direction)}
              </div>

              {/* Key Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
                <div className="text-center">
                  <div className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {engagementAnalysis.analysis.messages_per_user || 0}
                  </div>
                  <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Msgs/User
                  </div>
                </div>
                <div className="text-center">
                  <div className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {formatPercentage(engagementAnalysis.analysis.user_retention_rate || 0)}
                  </div>
                  <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Retention
                  </div>
                </div>
                <div className="text-center">
                  <div className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {Math.round(engagementAnalysis.analysis.average_response_time || 0)}m
                  </div>
                  <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Response Time
                  </div>
                </div>
              </div>
            </div>

            {/* Most Active Users */}
            {engagementAnalysis.analysis.most_active_users && engagementAnalysis.analysis.most_active_users.length > 0 && (
              <div className="mb-4">
                <h5 className={`font-medium mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  Most Active Users
                </h5>
                <div className="space-y-2">
                  {engagementAnalysis.analysis.most_active_users.slice(0, 5).map((userStat: any, index: number) => (
                    <div key={index} className={`flex items-center justify-between p-3 rounded-lg border ${
                      isDarkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-200'
                    }`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-medium text-sm ${
                          index === 0 ? 'bg-yellow-500/20 text-yellow-400' :
                          index === 1 ? 'bg-gray-500/20 text-gray-400' :
                          index === 2 ? 'bg-orange-500/20 text-orange-400' :
                          isDarkMode ? 'bg-slate-700 text-gray-300' : 'bg-gray-100 text-gray-700'
                        }`}>
                          #{index + 1}
                        </div>
                        <div>
                          <div className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                            User {userStat.user_id}
                          </div>
                          <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            {userStat.message_count} messages • Avg: {Math.round(userStat.avg_response_time)}m
                          </div>
                        </div>
                      </div>
                      <div className={`text-sm font-medium ${
                        userStat.engagement_score > 0.7 ? 'text-green-500' :
                        userStat.engagement_score > 0.4 ? 'text-yellow-500' : 'text-red-500'
                      }`}>
                        {Math.round(userStat.engagement_score * 100)}/100
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Peak Hours */}
            {engagementAnalysis.analysis.peak_hours && engagementAnalysis.analysis.peak_hours.length > 0 && (
              <div className="mb-4">
                <h5 className={`font-medium mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  Peak Activity Hours
                </h5>
                <div className="flex flex-wrap gap-2">
                  {engagementAnalysis.analysis.peak_hours.map((hour: number, index: number) => (
                    <span key={index} className={`px-3 py-1 rounded-full text-sm border ${
                      isDarkMode ? 'bg-blue-900/30 text-blue-300 border-blue-800' : 'bg-blue-100 text-blue-700 border-blue-200'
                    }`}>
                      {hour}:00
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {engagementAnalysis.analysis.recommendations && engagementAnalysis.analysis.recommendations.length > 0 && (
              <div>
                <h5 className={`font-medium mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  Engagement Recommendations
                </h5>
                <ul className="space-y-2">
                  {engagementAnalysis.analysis.recommendations.map((rec: string, index: number) => (
                    <li key={index} className={`flex items-start gap-2 text-sm ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      <div className={`w-1.5 h-1.5 rounded-full mt-2 ${
                        isDarkMode ? 'bg-blue-400' : 'bg-blue-600'
                      }`} />
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Engagement Trends */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h4 className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              7-Day Engagement Trends
            </h4>
            {isLoadingTrends && (
              <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
            )}
          </div>

          {engagementTrends.length === 0 && !isLoadingTrends ? (
            <div className="text-center py-8">
              <TrendingUp className={`w-12 h-12 mx-auto mb-3 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`} />
              <h5 className={`font-medium mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                No Trend Data
              </h5>
              <p className={`text-sm ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                Engagement trends will appear as data accumulates
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {engagementTrends.map((trend, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg border ${
                    isDarkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getTrendIcon(trend.trend_direction)}
                      <div>
                        <div className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                          {new Date(trend.date).toLocaleDateString()}
                        </div>
                        <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          {trend.total_messages} messages • {trend.unique_users} users
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-medium ${
                        trend.engagement_score > 0.7 ? 'text-green-500' :
                        trend.engagement_score > 0.4 ? 'text-yellow-500' : 'text-red-500'
                      }`}>
                        {Math.round(trend.engagement_score * 100)}/100
                      </div>
                      <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                        Engagement Score
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}