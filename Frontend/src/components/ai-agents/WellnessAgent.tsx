import React, { useState, useEffect } from 'react';
import { Heart, Activity, TrendingUp, Calendar, Target, Loader2, AlertCircle, Zap, Shield } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAIAgents } from '@/contexts/AIAgentContext';
import { useAuth } from '@/contexts/AuthContext';

export default function WellnessAgent() {
  const { isDarkMode } = useTheme();
  const { analyzeWellness, getWellnessInsights, getWellnessRecommendations } = useAIAgents();
  const { user } = useAuth();
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);
  const [timePeriod, setTimePeriod] = useState(24);
  const [wellnessAnalysis, setWellnessAnalysis] = useState<any>(null);
  const [wellnessInsights, setWellnessInsights] = useState<any>(null);
  const [wellnessRecommendations, setWellnessRecommendations] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadWellnessInsights();
    loadWellnessRecommendations();
  }, []);

  const loadWellnessInsights = async () => {
    setIsLoadingInsights(true);
    try {
      const insights = await getWellnessInsights(7); // Last 7 days
      setWellnessInsights(insights);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoadingInsights(false);
    }
  };

  const loadWellnessRecommendations = async () => {
    setIsLoadingRecommendations(true);
    try {
      const recommendations = await getWellnessRecommendations();
      setWellnessRecommendations(recommendations);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoadingRecommendations(false);
    }
  };

  const handleAnalyzeWellness = async () => {
    setIsAnalyzing(true);
    setError(null);
    
    try {
      const analysis = await analyzeWellness(timePeriod);
      setWellnessAnalysis(analysis);
      await loadWellnessInsights(); // Refresh insights
      await loadWellnessRecommendations(); // Refresh recommendations
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getWellnessLevelColor = (level: string) => {
    switch (level) {
      case 'excellent':
        return 'text-emerald-500 bg-emerald-100 border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-800';
      case 'good':
        return 'text-green-500 bg-green-100 border-green-200 dark:bg-green-900/30 dark:border-green-800';
      case 'moderate':
        return 'text-yellow-500 bg-yellow-100 border-yellow-200 dark:bg-yellow-900/30 dark:border-yellow-800';
      case 'concerning':
        return 'text-orange-500 bg-orange-100 border-orange-200 dark:bg-orange-900/30 dark:border-orange-800';
      case 'poor':
        return 'text-red-500 bg-red-100 border-red-200 dark:bg-red-900/30 dark:border-red-800';
      default:
        return 'text-gray-500 bg-gray-100 border-gray-200 dark:bg-gray-900/30 dark:border-gray-800';
    }
  };

  const getWellnessIcon = (category: string) => {
    switch (category) {
      case 'mental_health':
        return <Heart className="w-4 h-4 text-pink-500" />;
      case 'social_health':
        return <Activity className="w-4 h-4 text-blue-500" />;
      case 'digital_wellness':
        return <Shield className="w-4 h-4 text-purple-500" />;
      case 'communication_patterns':
        return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'stress_indicators':
        return <Zap className="w-4 h-4 text-orange-500" />;
      default:
        return <Target className="w-4 h-4 text-gray-500" />;
    }
  };

  const getRiskLevel = (score: number) => {
    if (score >= 0.8) return 'excellent';
    if (score >= 0.7) return 'good';
    if (score >= 0.5) return 'moderate';
    if (score >= 0.3) return 'concerning';
    return 'poor';
  };

  const formatScore = (score: number) => {
    return Math.round(score * 100);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className={`p-4 border-b ${isDarkMode ? 'border-slate-700' : 'border-gray-200'}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-emerald-500/20 rounded-lg">
            <Heart className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h3 className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Wellness Monitor
            </h3>
            <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Digital wellness insights and mental health tracking
            </p>
          </div>
        </div>

        {/* Analysis Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className={`text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Analysis Period:
            </label>
            <select
              value={timePeriod}
              onChange={(e) => setTimePeriod(Number(e.target.value))}
              disabled={isAnalyzing}
              className={`px-3 py-1.5 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
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
          
          <button
            onClick={handleAnalyzeWellness}
            disabled={isAnalyzing}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              isAnalyzing
                ? isDarkMode
                  ? 'bg-slate-700 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-emerald-600 text-white hover:bg-emerald-700'
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
              <h4 className="font-medium mb-1">Wellness Analysis Failed</h4>
              <p className="text-sm">{error}</p>
            </div>
          </div>
        )}

        {/* Current Wellness Analysis */}
        {wellnessAnalysis && wellnessAnalysis.success && (
          <div className="p-4 border-b border-slate-700">
            <h4 className={`font-medium mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Wellness Analysis Results
            </h4>

            {/* Overall Wellness Score */}
            <div className={`p-4 rounded-lg border mb-4 ${
              isDarkMode ? 'bg-slate-800/50 border-slate-600' : 'bg-gray-50 border-gray-200'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h5 className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    Overall Wellness Score
                  </h5>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`px-3 py-1 rounded-full text-sm border font-medium ${
                      getWellnessLevelColor(getRiskLevel(wellnessAnalysis.analysis.overall_wellness_score))
                    }`}>
                      {getRiskLevel(wellnessAnalysis.analysis.overall_wellness_score)}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-2xl font-bold ${
                    wellnessAnalysis.analysis.overall_wellness_score >= 0.7 ? 'text-green-500' :
                    wellnessAnalysis.analysis.overall_wellness_score >= 0.5 ? 'text-yellow-500' : 'text-red-500'
                  }`}>
                    {formatScore(wellnessAnalysis.analysis.overall_wellness_score)}
                  </div>
                  <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    out of 100
                  </div>
                </div>
              </div>
            </div>

            {/* Wellness Categories */}
            {wellnessAnalysis.analysis.category_scores && (
              <div className="mb-4">
                <h5 className={`font-medium mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  Wellness Categories
                </h5>
                <div className="space-y-3">
                  {Object.entries(wellnessAnalysis.analysis.category_scores).map(([category, score]) => (
                    <div
                      key={category}
                      className={`p-3 rounded-lg border ${
                        isDarkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {getWellnessIcon(category)}
                          <div>
                            <div className={`font-medium capitalize ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                              {category.replace('_', ' ')}
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-xs border ${
                              getWellnessLevelColor(getRiskLevel(score as number))
                            }`}>
                              {getRiskLevel(score as number)}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`font-semibold ${
                            (score as number) >= 0.7 ? 'text-green-500' :
                            (score as number) >= 0.5 ? 'text-yellow-500' : 'text-red-500'
                          }`}>
                            {formatScore(score as number)}
                          </div>
                          <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            /100
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Risk Factors */}
            {wellnessAnalysis.analysis.risk_factors && wellnessAnalysis.analysis.risk_factors.length > 0 && (
              <div className="mb-4">
                <h5 className={`font-medium mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  Risk Factors Identified
                </h5>
                <div className="space-y-2">
                  {wellnessAnalysis.analysis.risk_factors.map((factor: any, index: number) => (
                    <div
                      key={index}
                      className={`p-3 rounded-lg border ${
                        factor.severity === 'high'
                          ? isDarkMode ? 'bg-red-900/20 border-red-800' : 'bg-red-50 border-red-200'
                          : factor.severity === 'medium'
                          ? isDarkMode ? 'bg-yellow-900/20 border-yellow-800' : 'bg-yellow-50 border-yellow-200'
                          : isDarkMode ? 'bg-blue-900/20 border-blue-800' : 'bg-blue-50 border-blue-200'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <AlertCircle className={`w-4 h-4 mt-1 ${
                          factor.severity === 'high' ? 'text-red-500' :
                          factor.severity === 'medium' ? 'text-yellow-500' : 'text-blue-500'
                        }`} />
                        <div className="flex-1">
                          <div className={`font-medium ${
                            factor.severity === 'high' ? 'text-red-500' :
                            factor.severity === 'medium' ? 'text-yellow-500' : 'text-blue-500'
                          }`}>
                            {factor.factor}
                          </div>
                          <div className={`text-sm mt-1 ${
                            factor.severity === 'high'
                              ? isDarkMode ? 'text-red-300' : 'text-red-700'
                              : factor.severity === 'medium'
                              ? isDarkMode ? 'text-yellow-300' : 'text-yellow-700'
                              : isDarkMode ? 'text-blue-300' : 'text-blue-700'
                          }`}>
                            {factor.description}
                          </div>
                          <div className={`text-xs mt-1 ${
                            factor.severity === 'high'
                              ? isDarkMode ? 'text-red-400' : 'text-red-600'
                              : factor.severity === 'medium'
                              ? isDarkMode ? 'text-yellow-400' : 'text-yellow-600'
                              : isDarkMode ? 'text-blue-400' : 'text-blue-600'
                          }`}>
                            Severity: {factor.severity} • Impact: {Math.round(factor.impact_score * 100)}%
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
              <div className="mb-4">
                <h5 className={`font-medium mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  Positive Wellness Indicators
                </h5>
                <div className="space-y-2">
                  {wellnessAnalysis.analysis.positive_indicators.map((indicator: string, index: number) => (
                    <div
                      key={index}
                      className={`flex items-center gap-2 p-2 rounded-lg ${
                        isDarkMode ? 'bg-green-900/20 text-green-300' : 'bg-green-50 text-green-700'
                      }`}
                    >
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-sm">{indicator}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Wellness Insights */}
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h4 className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Recent Wellness Insights
            </h4>
            {isLoadingInsights && (
              <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
            )}
          </div>

          {(!wellnessInsights || (Array.isArray(wellnessInsights) && wellnessInsights.length === 0)) && !isLoadingInsights ? (
            <div className="text-center py-6">
              <Activity className={`w-10 h-10 mx-auto mb-2 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`} />
              <h5 className={`font-medium mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                No Insights Available
              </h5>
              <p className={`text-sm ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                Wellness insights will appear as data is collected
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {(Array.isArray(wellnessInsights) ? wellnessInsights : []).slice(0, 5).map((insight, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg border ${
                    isDarkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {getWellnessIcon(insight.category)}
                    <div className="flex-1">
                      <div className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        {insight.title || insight.insight}
                      </div>
                      <div className={`text-sm mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        {insight.description || `Category: ${insight.category}`}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs border ${
                          getWellnessLevelColor(getRiskLevel(insight.impact_score || 0.5))
                        }`}>
                          Impact: {formatScore(insight.impact_score || 0.5)}%
                        </span>
                        <span className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                          {new Date(insight.created_at || Date.now()).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Wellness Recommendations */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h4 className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Wellness Recommendations
            </h4>
            {isLoadingRecommendations && (
              <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
            )}
          </div>

          {wellnessRecommendations.length === 0 && !isLoadingRecommendations ? (
            <div className="text-center py-6">
              <Target className={`w-10 h-10 mx-auto mb-2 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`} />
              <h5 className={`font-medium mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                No Recommendations
              </h5>
              <p className={`text-sm ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                Wellness recommendations will appear based on analysis
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {wellnessRecommendations.slice(0, 5).map((rec, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-lg border ${
                    isDarkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${
                      rec.priority === 'high'
                        ? 'bg-red-500/20'
                        : rec.priority === 'medium'
                        ? 'bg-yellow-500/20'
                        : 'bg-blue-500/20'
                    }`}>
                      <Target className={`w-4 h-4 ${
                        rec.priority === 'high'
                          ? 'text-red-400'
                          : rec.priority === 'medium'
                          ? 'text-yellow-400'
                          : 'text-blue-400'
                      }`} />
                    </div>
                    <div className="flex-1">
                      <div className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        {rec.title || rec.recommendation}
                      </div>
                      <div className={`text-sm mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        {rec.description}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                          rec.priority === 'high'
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            : rec.priority === 'medium'
                            ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                        }`}>
                          {rec.priority || 'medium'} priority
                        </span>
                        {rec.category && (
                          <span className={`px-2 py-0.5 rounded-full text-xs ${
                            isDarkMode ? 'bg-slate-700 text-gray-300' : 'bg-gray-100 text-gray-700'
                          }`}>
                            {rec.category}
                          </span>
                        )}
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