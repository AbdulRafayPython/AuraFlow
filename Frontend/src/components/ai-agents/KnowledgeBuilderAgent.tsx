import React, { useState, useEffect } from 'react';
import { BookOpen, Lightbulb, Tag, Search, Loader2, AlertCircle, Archive, Zap, Filter } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAIAgents } from '@/contexts/AIAgentContext';
import { useAuth } from '@/contexts/AuthContext';

export default function KnowledgeBuilderAgent() {
  const { isDarkMode } = useTheme();
  const { extractKnowledge, searchKnowledge, getKnowledgeInsights, getKnowledgeTopics } = useAIAgents();
  const { user } = useAuth();
  
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const [isLoadingTopics, setIsLoadingTopics] = useState(false);
  const [timePeriod, setTimePeriod] = useState(24);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [extractionResult, setExtractionResult] = useState<any>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [knowledgeInsights, setKnowledgeInsights] = useState<any>(null);
  const [knowledgeTopics, setKnowledgeTopics] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadKnowledgeInsights();
    loadKnowledgeTopics();
  }, []);

  const loadKnowledgeInsights = async () => {
    setIsLoadingInsights(true);
    try {
      const insights = await getKnowledgeInsights(timePeriod);
      setKnowledgeInsights(insights);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoadingInsights(false);
    }
  };

  const loadKnowledgeTopics = async () => {
    setIsLoadingTopics(true);
    try {
      const topics = await getKnowledgeTopics(20); // Top 20 topics
      setKnowledgeTopics(topics);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoadingTopics(false);
    }
  };

  const handleExtractKnowledge = async () => {
    setIsExtracting(true);
    setError(null);
    
    try {
      const result = await extractKnowledge(timePeriod, selectedTopic || undefined);
      setExtractionResult(result);
      await loadKnowledgeInsights(); // Refresh insights
      await loadKnowledgeTopics(); // Refresh topics
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSearchKnowledge = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      const results = await searchKnowledge(searchQuery, 10);
      setSearchResults(results);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSearching(false);
    }
  };

  const getRelevanceColor = (score: number) => {
    if (score >= 0.8) return 'text-green-500';
    if (score >= 0.6) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getTopicIcon = (topic: string) => {
    // Simple topic-based icon mapping
    const topicLower = topic.toLowerCase();
    if (topicLower.includes('tech') || topicLower.includes('code') || topicLower.includes('programming')) {
      return <Zap className="w-4 h-4 text-blue-500" />;
    }
    if (topicLower.includes('question') || topicLower.includes('help') || topicLower.includes('problem')) {
      return <Search className="w-4 h-4 text-orange-500" />;
    }
    if (topicLower.includes('idea') || topicLower.includes('suggestion') || topicLower.includes('innovation')) {
      return <Lightbulb className="w-4 h-4 text-yellow-500" />;
    }
    return <Tag className="w-4 h-4 text-purple-500" />;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const truncateText = (text: string, maxLength: number = 100) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className={`p-4 border-b ${isDarkMode ? 'border-slate-700' : 'border-gray-200'}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-purple-500/20 rounded-lg">
            <BookOpen className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Knowledge Builder
            </h3>
            <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Extract and organize knowledge from conversations
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="space-y-3">
          {/* Extraction Controls */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className={`text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Extract from:
              </label>
              <select
                value={timePeriod}
                onChange={(e) => setTimePeriod(Number(e.target.value))}
                disabled={isExtracting}
                className={`px-3 py-1.5 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-purple-500 ${
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
                Topic Filter:
              </label>
              <select
                value={selectedTopic}
                onChange={(e) => setSelectedTopic(e.target.value)}
                disabled={isExtracting || isLoadingTopics}
                className={`px-3 py-1.5 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                  isDarkMode 
                    ? 'bg-slate-800 border-slate-600 text-white' 
                    : 'bg-white border-gray-300 text-gray-900'
                } disabled:opacity-50`}
              >
                <option value="">All Topics</option>
                {knowledgeTopics.slice(0, 10).map((topic, index) => (
                  <option key={index} value={topic.topic || topic.name}>
                    {topic.topic || topic.name} ({topic.count || topic.frequency})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleExtractKnowledge}
              disabled={isExtracting}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isExtracting
                  ? isDarkMode
                    ? 'bg-slate-700 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-purple-600 text-white hover:bg-purple-700'
              }`}
            >
              {isExtracting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Extracting...
                </>
              ) : (
                <>
                  <Archive className="w-4 h-4" />
                  Extract Knowledge
                </>
              )}
            </button>
          </div>

          {/* Search Controls */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search knowledge base..."
                disabled={isSearching}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchKnowledge()}
                className={`w-full px-3 py-1.5 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                  isDarkMode 
                    ? 'bg-slate-800 border-slate-600 text-white placeholder-gray-500' 
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                } disabled:opacity-50`}
              />
            </div>
            
            <button
              onClick={handleSearchKnowledge}
              disabled={!searchQuery.trim() || isSearching}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                !searchQuery.trim() || isSearching
                  ? isDarkMode
                    ? 'bg-slate-700 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-purple-600 text-white hover:bg-purple-700'
              }`}
            >
              {isSearching ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  Search
                </>
              )}
            </button>
          </div>
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
              <h4 className="font-medium mb-1">Knowledge Operation Failed</h4>
              <p className="text-sm">{error}</p>
            </div>
          </div>
        )}

        {/* Knowledge Extraction Results */}
        {extractionResult && extractionResult.success && (
          <div className="p-4 border-b border-slate-700">
            <h4 className={`font-medium mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Knowledge Extraction Results
            </h4>

            {/* Summary */}
            <div className={`p-4 rounded-lg border mb-4 ${
              isDarkMode ? 'bg-slate-800/50 border-slate-600' : 'bg-gray-50 border-gray-200'
            }`}>
              <div className="grid grid-cols-3 gap-4 mb-3">
                <div className="text-center">
                  <div className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {extractionResult.extraction?.total_items || 0}
                  </div>
                  <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Items Extracted
                  </div>
                </div>
                <div className="text-center">
                  <div className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {extractionResult.extraction?.unique_topics || 0}
                  </div>
                  <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Unique Topics
                  </div>
                </div>
                <div className="text-center">
                  <div className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {extractionResult.extraction?.avg_relevance_score ? 
                      Math.round(extractionResult.extraction.avg_relevance_score * 100) : 0}%
                  </div>
                  <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Avg Relevance
                  </div>
                </div>
              </div>
            </div>

            {/* Extracted Knowledge Items */}
            {extractionResult.extraction?.extracted_items && extractionResult.extraction.extracted_items.length > 0 && (
              <div className="mb-4">
                <h5 className={`font-medium mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  Extracted Knowledge Items
                </h5>
                <div className="space-y-3">
                  {extractionResult.extraction.extracted_items.slice(0, 10).map((item: any, index: number) => (
                    <div
                      key={index}
                      className={`p-3 rounded-lg border ${
                        isDarkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-200'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {getTopicIcon(item.topic || 'general')}
                        <div className="flex-1 min-w-0">
                          <div className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                            {item.title || 'Knowledge Item'}
                          </div>
                          <div className={`text-sm mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            {truncateText(item.content || item.description || '')}
                          </div>
                          <div className="flex items-center gap-3 mt-2">
                            <span className={`px-2 py-0.5 rounded-full text-xs border ${
                              isDarkMode ? 'bg-purple-900/30 text-purple-300 border-purple-800' : 'bg-purple-100 text-purple-700 border-purple-200'
                            }`}>
                              {item.topic || 'General'}
                            </span>
                            <span className={`text-xs ${getRelevanceColor(item.relevance_score || 0)}`}>
                              Relevance: {Math.round((item.relevance_score || 0) * 100)}%
                            </span>
                            <span className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                              {item.source_type || 'Conversation'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Identified Topics */}
            {extractionResult.extraction?.topic_summary && Object.keys(extractionResult.extraction.topic_summary).length > 0 && (
              <div>
                <h5 className={`font-medium mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  Topic Distribution
                </h5>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(extractionResult.extraction.topic_summary).slice(0, 8).map(([topic, count]) => (
                    <div key={topic} className={`p-2 rounded-lg border ${
                      isDarkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-200'
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                          {topic}
                        </span>
                        <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          {String(count)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="p-4 border-b border-slate-700">
            <h4 className={`font-medium mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Search Results ({searchResults.length})
            </h4>

            <div className="space-y-3">
              {searchResults.map((result, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg border ${
                    isDarkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {getTopicIcon(result.topic || 'general')}
                    <div className="flex-1 min-w-0">
                      <div className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        {result.title || 'Search Result'}
                      </div>
                      <div className={`text-sm mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        {truncateText(result.content || result.description || result.summary || '')}
                      </div>
                      <div className="flex items-center gap-3 mt-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs border ${
                          isDarkMode ? 'bg-purple-900/30 text-purple-300 border-purple-800' : 'bg-purple-100 text-purple-700 border-purple-200'
                        }`}>
                          {result.topic || 'General'}
                        </span>
                        <span className={`text-xs ${getRelevanceColor(result.relevance_score || result.score || 0)}`}>
                          Match: {Math.round((result.relevance_score || result.score || 0) * 100)}%
                        </span>
                        <span className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                          {formatDate(result.created_at || result.timestamp || new Date().toISOString())}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Knowledge Insights */}
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h4 className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Knowledge Insights
            </h4>
            {isLoadingInsights && (
              <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
            )}
          </div>

          {knowledgeInsights ? (
            <div className="space-y-3">
              {/* Quick Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className={`p-3 rounded-lg border ${
                  isDarkMode ? 'bg-slate-800/50 border-slate-600' : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {knowledgeInsights.total_knowledge_items || 0}
                  </div>
                  <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Total Items
                  </div>
                </div>
                <div className={`p-3 rounded-lg border ${
                  isDarkMode ? 'bg-slate-800/50 border-slate-600' : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {knowledgeInsights.unique_topics || 0}
                  </div>
                  <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Topics
                  </div>
                </div>
                <div className={`p-3 rounded-lg border ${
                  isDarkMode ? 'bg-slate-800/50 border-slate-600' : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {knowledgeInsights.avg_relevance ? Math.round(knowledgeInsights.avg_relevance * 100) : 0}%
                  </div>
                  <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Avg Quality
                  </div>
                </div>
                <div className={`p-3 rounded-lg border ${
                  isDarkMode ? 'bg-slate-800/50 border-slate-600' : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {knowledgeInsights.growth_rate ? `+${Math.round(knowledgeInsights.growth_rate * 100)}%` : '0%'}
                  </div>
                  <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Growth Rate
                  </div>
                </div>
              </div>

              {/* Top Insights */}
              {knowledgeInsights.insights && knowledgeInsights.insights.length > 0 && (
                <div>
                  <h5 className={`font-medium mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    Key Insights
                  </h5>
                  <div className="space-y-2">
                    {knowledgeInsights.insights.slice(0, 3).map((insight: string, index: number) => (
                      <div key={index} className={`flex items-start gap-2 text-sm ${
                        isDarkMode ? 'text-gray-300' : 'text-gray-700'
                      }`}>
                        <Lightbulb className="w-4 h-4 text-yellow-500 mt-0.5" />
                        {insight}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-6">
              <BookOpen className={`w-10 h-10 mx-auto mb-2 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`} />
              <h5 className={`font-medium mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                No Insights Available
              </h5>
              <p className={`text-sm ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                Knowledge insights will appear as content is processed
              </p>
            </div>
          )}
        </div>

        {/* Popular Topics */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h4 className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Popular Knowledge Topics
            </h4>
            {isLoadingTopics && (
              <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
            )}
          </div>

          {knowledgeTopics.length === 0 && !isLoadingTopics ? (
            <div className="text-center py-6">
              <Tag className={`w-10 h-10 mx-auto mb-2 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`} />
              <h5 className={`font-medium mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                No Topics Found
              </h5>
              <p className={`text-sm ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                Topics will appear as knowledge is extracted
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {knowledgeTopics.slice(0, 12).map((topic, index) => (
                <div
                  key={index}
                  className={`p-2 rounded-lg border cursor-pointer transition-colors hover:bg-opacity-80 ${
                    isDarkMode ? 'bg-slate-800 border-slate-600 hover:bg-slate-700' : 'bg-white border-gray-200 hover:bg-gray-50'
                  }`}
                  onClick={() => setSelectedTopic(topic.topic || topic.name)}
                >
                  <div className="flex items-center gap-2">
                    {getTopicIcon(topic.topic || topic.name)}
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        {topic.topic || topic.name}
                      </div>
                      <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        {topic.count || topic.frequency} items
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