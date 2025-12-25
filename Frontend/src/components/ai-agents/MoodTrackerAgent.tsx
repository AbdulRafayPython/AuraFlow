import React, { useState, useEffect } from 'react';
import { Heart, TrendingUp, TrendingDown, Minus, Smile, Frown, Meh, Loader2, AlertCircle, BarChart3 } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAIAgents } from '@/contexts/AIAgentContext';
import { useAuth } from '@/contexts/AuthContext';
import { MoodTrackingResult } from '@/services/aiAgentService';

export default function MoodTrackerAgent() {
  const { isDarkMode } = useTheme();
  const { trackMood, getMoodHistory, analyzeMessageSentiment, currentMoodAnalysis } = useAIAgents();
  const { user } = useAuth();
  
  const [isTracking, setIsTracking] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [timePeriod, setTimePeriod] = useState(24);
  const [moodHistory, setMoodHistory] = useState<any[]>([]);
  const [testMessage, setTestMessage] = useState('');
  const [messageAnalysis, setMessageAnalysis] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMoodHistory();
  }, []);

  const loadMoodHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const history = await getMoodHistory(10);
      setMoodHistory(history);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleTrackMood = async () => {
    setIsTracking(true);
    setError(null);
    
    try {
      await trackMood(timePeriod);
      await loadMoodHistory(); // Refresh history
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsTracking(false);
    }
  };

  const handleAnalyzeMessage = async () => {
    if (!testMessage.trim()) return;
    
    setIsAnalyzing(true);
    try {
      const analysis = await analyzeMessageSentiment(testMessage);
      setMessageAnalysis(analysis);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case 'positive':
        return <Smile className="w-5 h-5 text-green-500" />;
      case 'negative':
        return <Frown className="w-5 h-5 text-red-500" />;
      case 'neutral':
      default:
        return <Meh className="w-5 h-5 text-gray-500" />;
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving':
        return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'declining':
        return <TrendingDown className="w-4 h-4 text-red-500" />;
      case 'stable':
      default:
        return <Minus className="w-4 h-4 text-gray-500" />;
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-500';
    if (confidence >= 0.6) return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className={`p-4 border-b ${isDarkMode ? 'border-slate-700' : 'border-gray-200'}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-pink-500/20 rounded-lg">
            <Heart className="w-5 h-5 text-pink-400" />
          </div>
          <div>
            <h3 className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Mood Tracker
            </h3>
            <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Analyze emotional patterns and sentiment (Roman Urdu supported)
            </p>
          </div>
        </div>

        {/* Tracking Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className={`text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Time Period:
            </label>
            <select
              value={timePeriod}
              onChange={(e) => setTimePeriod(Number(e.target.value))}
              disabled={isTracking}
              className={`px-3 py-1.5 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-pink-500 ${
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
            onClick={handleTrackMood}
            disabled={isTracking}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              isTracking
                ? isDarkMode
                  ? 'bg-slate-700 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-pink-600 text-white hover:bg-pink-700'
            }`}
          >
            {isTracking ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <BarChart3 className="w-4 h-4" />
                Track Mood
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
              <h4 className="font-medium mb-1">Mood Analysis Failed</h4>
              <p className="text-sm">{error}</p>
            </div>
          </div>
        )}

        {/* Current Mood Analysis */}
        {currentMoodAnalysis && currentMoodAnalysis.success && (
          <div className="p-4 border-b border-slate-700">
            <h4 className={`font-medium mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Current Mood Analysis
            </h4>

            {/* Overall Sentiment */}
            <div className={`p-4 rounded-lg border mb-4 ${
              isDarkMode ? 'bg-slate-800/50 border-slate-600' : 'bg-gray-50 border-gray-200'
            }`}>
              <div className="flex items-center gap-3 mb-3">
                {getSentimentIcon(currentMoodAnalysis.analysis.overall_sentiment)}
                <div>
                  <h5 className={`font-medium capitalize ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {currentMoodAnalysis.analysis.overall_sentiment} Mood
                  </h5>
                  <div className="flex items-center gap-2 mt-1">
                    {getTrendIcon(currentMoodAnalysis.analysis.mood_trend)}
                    <span className={`text-sm capitalize ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      {currentMoodAnalysis.analysis.mood_trend}
                    </span>
                  </div>
                </div>
                <div className="ml-auto text-right">
                  <div className={`text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    {currentMoodAnalysis.analysis.message_count} messages
                  </div>
                  <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                    {timePeriod}h period
                  </div>
                </div>
              </div>

              {/* Sentiment Distribution */}
              {currentMoodAnalysis.analysis.sentiment_distribution && (
                <div className="mt-3">
                  <h6 className={`text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Sentiment Distribution
                  </h6>
                  <div className="grid grid-cols-3 gap-3">
                    {Object.entries(currentMoodAnalysis.analysis.sentiment_distribution).map(([sentiment, percentage]) => (
                      <div key={sentiment} className="text-center">
                        <div className={`text-lg font-semibold ${
                          sentiment === 'positive' ? 'text-green-500' :
                          sentiment === 'negative' ? 'text-red-500' : 'text-gray-500'
                        }`}>
                          {Math.round((percentage as number) * 100)}%
                        </div>
                        <div className={`text-xs capitalize ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          {sentiment}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Emotional Keywords */}
            {currentMoodAnalysis.analysis.emotional_keywords && currentMoodAnalysis.analysis.emotional_keywords.length > 0 && (
              <div className="mb-4">
                <h5 className={`font-medium mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  Emotional Keywords
                </h5>
                <div className="flex flex-wrap gap-2">
                  {currentMoodAnalysis.analysis.emotional_keywords.map((keyword, index) => (
                    <span key={index} className={`px-2 py-1 rounded-full text-xs ${
                      isDarkMode ? 'bg-pink-900/30 text-pink-300' : 'bg-pink-100 text-pink-700'
                    }`}>
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {currentMoodAnalysis.analysis.recommendations && currentMoodAnalysis.analysis.recommendations.length > 0 && (
              <div>
                <h5 className={`font-medium mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  Recommendations
                </h5>
                <ul className="space-y-2">
                  {currentMoodAnalysis.analysis.recommendations.map((rec, index) => (
                    <li key={index} className={`flex items-start gap-2 text-sm ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      <div className={`w-1.5 h-1.5 rounded-full mt-2 ${
                        isDarkMode ? 'bg-pink-400' : 'bg-pink-600'
                      }`} />
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Message Sentiment Tester */}
        <div className="p-4 border-b border-slate-700">
          <h4 className={`font-medium mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            Test Message Sentiment
          </h4>
          
          <div className="space-y-3">
            <div>
              <textarea
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                placeholder="Type a message to analyze sentiment (English and Roman Urdu supported)..."
                disabled={isAnalyzing}
                className={`w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-pink-500 resize-none ${
                  isDarkMode 
                    ? 'bg-slate-800 border-slate-600 text-white placeholder-gray-500' 
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                } disabled:opacity-50`}
                rows={3}
              />
            </div>
            
            <button
              onClick={handleAnalyzeMessage}
              disabled={!testMessage.trim() || isAnalyzing}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                !testMessage.trim() || isAnalyzing
                  ? isDarkMode
                    ? 'bg-slate-700 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-pink-600 text-white hover:bg-pink-700'
              }`}
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Analyzing...
                </>
              ) : (
                'Analyze Sentiment'
              )}
            </button>

            {/* Message Analysis Result */}
            {messageAnalysis && (
              <div className={`p-3 rounded-lg border ${
                isDarkMode ? 'bg-slate-800/50 border-slate-600' : 'bg-gray-50 border-gray-200'
              }`}>
                <div className="flex items-center gap-3 mb-2">
                  {getSentimentIcon(messageAnalysis.sentiment)}
                  <div>
                    <span className={`font-medium capitalize ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      {messageAnalysis.sentiment}
                    </span>
                    <span className={`ml-2 text-sm ${getConfidenceColor(messageAnalysis.confidence)}`}>
                      {Math.round(messageAnalysis.confidence * 100)}% confidence
                    </span>
                  </div>
                </div>
                
                {messageAnalysis.detected_language && (
                  <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Language: {messageAnalysis.detected_language}
                  </div>
                )}
                
                {messageAnalysis.detected_emotions && messageAnalysis.detected_emotions.length > 0 && (
                  <div className="mt-2">
                    <div className={`text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Emotions:
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {messageAnalysis.detected_emotions.map((emotion: string, index: number) => (
                        <span key={index} className={`px-2 py-0.5 rounded-full text-xs ${
                          isDarkMode ? 'bg-slate-700 text-gray-300' : 'bg-gray-100 text-gray-700'
                        }`}>
                          {emotion}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Mood History */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h4 className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Mood History
            </h4>
            {isLoadingHistory && (
              <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
            )}
          </div>

          {moodHistory.length === 0 && !isLoadingHistory ? (
            <div className="text-center py-8">
              <Heart className={`w-12 h-12 mx-auto mb-3 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`} />
              <h5 className={`font-medium mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                No Mood Data
              </h5>
              <p className={`text-sm ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                Track your first mood analysis
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {moodHistory.map((entry, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg border ${
                    isDarkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getSentimentIcon(entry.overall_sentiment)}
                      <div>
                        <div className={`font-medium capitalize ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                          {entry.overall_sentiment}
                        </div>
                        <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          {entry.message_count} messages • {entry.time_period_hours}h period
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                        {new Date(entry.created_at || Date.now()).toLocaleDateString()}
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