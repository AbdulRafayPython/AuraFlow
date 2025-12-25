import React, { useState, useEffect } from 'react';
import { Brain, MessageSquare, Users, Clock, FileText, Loader2, AlertCircle, Download } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAIAgents } from '@/contexts/AIAgentContext';
import { useRealtime } from '@/hooks/useRealtime';
import { SummaryResult } from '@/services/aiAgentService';

export default function SummarizerAgent() {
  const { isDarkMode } = useTheme();
  const { generateSummary, getChannelSummaries, summaries } = useAIAgents();
  const { currentChannel } = useRealtime();
  
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

  const formatTimeRange = (timeRange: string | undefined) => {
    if (!timeRange) return 'Recent messages';
    
    try {
      const [start, end] = timeRange.split(' to ');
      const startDate = new Date(start);
      const endDate = new Date(end);
      
      return `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
    } catch {
      return timeRange;
    }
  };

  if (!currentChannel) {
    return (
      <div className="p-6 text-center">
        <Brain className={`w-16 h-16 mx-auto mb-4 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`} />
        <h3 className={`text-lg font-medium mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
          Summarizer Agent
        </h3>
        <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          Select a channel to generate conversation summaries
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className={`p-4 border-b ${isDarkMode ? 'border-slate-700' : 'border-gray-200'}`}>
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-blue-500/20 rounded-lg">
            <Brain className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Conversation Summarizer
            </h3>
            <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Generate intelligent summaries of #{currentChannel.name}
            </p>
          </div>
        </div>

        {/* Generate Summary Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className={`text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Messages:
            </label>
            <select
              value={messageCount}
              onChange={(e) => setMessageCount(Number(e.target.value))}
              disabled={isGenerating}
              className={`px-3 py-1.5 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                isDarkMode 
                  ? 'bg-slate-800 border-slate-600 text-white' 
                  : 'bg-white border-gray-300 text-gray-900'
              } disabled:opacity-50`}
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
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              isGenerating
                ? isDarkMode
                  ? 'bg-slate-700 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Brain className="w-4 h-4" />
                Generate Summary
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
              <h4 className="font-medium mb-1">Summary Generation Failed</h4>
              <p className="text-sm">{error}</p>
            </div>
          </div>
        )}

        {/* Current Summary Display */}
        {selectedSummary && (
          <div className="p-4 border-b border-slate-700">
            <div className="mb-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  Latest Summary
                </h4>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Clock className="w-4 h-4" />
                  Just now
                </div>
              </div>

              {/* Summary Metadata */}
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className={`text-center p-2 rounded-lg ${
                  isDarkMode ? 'bg-slate-800' : 'bg-gray-50'
                }`}>
                  <MessageSquare className={`w-4 h-4 mx-auto mb-1 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                  <div className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {selectedSummary.message_count}
                  </div>
                  <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Messages
                  </div>
                </div>
                <div className={`text-center p-2 rounded-lg ${
                  isDarkMode ? 'bg-slate-800' : 'bg-gray-50'
                }`}>
                  <Users className={`w-4 h-4 mx-auto mb-1 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} />
                  <div className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {selectedSummary.participants?.length || 0}
                  </div>
                  <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Participants
                  </div>
                </div>
                <div className={`text-center p-2 rounded-lg ${
                  isDarkMode ? 'bg-slate-800' : 'bg-gray-50'
                }`}>
                  <FileText className={`w-4 h-4 mx-auto mb-1 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />
                  <div className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {selectedSummary.key_points?.length || 0}
                  </div>
                  <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Key Points
                  </div>
                </div>
              </div>

              {/* Summary Text */}
              <div className={`p-4 rounded-lg border ${
                isDarkMode ? 'bg-slate-800/50 border-slate-600' : 'bg-gray-50 border-gray-200'
              }`}>
                <h5 className={`font-medium mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  Summary
                </h5>
                <p className={`text-sm leading-relaxed ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  {selectedSummary.summary}
                </p>
              </div>

              {/* Key Points */}
              {selectedSummary.key_points && selectedSummary.key_points.length > 0 && (
                <div className="mt-4">
                  <h5 className={`font-medium mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    Key Points
                  </h5>
                  <ul className="space-y-2">
                    {selectedSummary.key_points.map((point, index) => (
                      <li key={index} className={`flex items-start gap-2 text-sm ${
                        isDarkMode ? 'text-gray-300' : 'text-gray-700'
                      }`}>
                        <div className={`w-1.5 h-1.5 rounded-full mt-2 ${
                          isDarkMode ? 'bg-blue-400' : 'bg-blue-600'
                        }`} />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Participants */}
              {selectedSummary.participants && selectedSummary.participants.length > 0 && (
                <div className="mt-4">
                  <h5 className={`font-medium mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    Participants
                  </h5>
                  <div className="flex flex-wrap gap-2">
                    {selectedSummary.participants.map((participant, index) => (
                      <span key={index} className={`px-2 py-1 rounded-full text-xs ${
                        isDarkMode ? 'bg-slate-700 text-gray-300' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {participant}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Recent Summaries */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h4 className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Recent Summaries
            </h4>
            {isLoadingSummaries && (
              <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
            )}
          </div>

          {channelSummaries.length === 0 && !isLoadingSummaries ? (
            <div className="text-center py-8">
              <FileText className={`w-12 h-12 mx-auto mb-3 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`} />
              <h5 className={`font-medium mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                No Summaries Yet
              </h5>
              <p className={`text-sm ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                Generate your first conversation summary
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {channelSummaries.map((summary, index) => (
                <button
                  key={summary?.summary_id || index}
                  onClick={() => setSelectedSummary(summary)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedSummary?.summary_id === summary?.summary_id
                      ? isDarkMode ? 'bg-blue-900/20 border-blue-700' : 'bg-blue-50 border-blue-200'
                      : isDarkMode ? 'bg-slate-800 border-slate-600 hover:bg-slate-700' : 'bg-white border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      {formatTimeRange(summary?.time_range)}
                    </span>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>{summary?.message_count || 0} messages</span>
                      <span>{summary?.participants?.length || 0} people</span>
                    </div>
                  </div>
                  <p className={`text-sm line-clamp-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
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