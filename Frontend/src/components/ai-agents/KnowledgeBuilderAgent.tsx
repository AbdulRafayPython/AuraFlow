import React, { useState, useEffect } from 'react';
import { BookOpen, Lightbulb, Tag, Search, Loader2, AlertCircle, Archive, Zap, Filter } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAIAgents } from '@/contexts/AIAgentContext';
import { useRealtime } from '@/hooks/useRealtime';
import { useAuth } from '@/contexts/AuthContext';
import aiAgentService from '@/services/aiAgentService';

export default function KnowledgeBuilderAgent() {
  const { isDarkMode } = useTheme();
  const { extractKnowledge, searchKnowledge, getKnowledgeInsights, getKnowledgeTopics, getKnowledgeStats } = useAIAgents();
  const { user } = useAuth();
  const { currentCommunity } = useRealtime();
  
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const [isLoadingTopics, setIsLoadingTopics] = useState(false);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [timePeriod, setTimePeriod] = useState(24);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [extractionResult, setExtractionResult] = useState<any>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [knowledgeInsights, setKnowledgeInsights] = useState<any>(null);
  const [knowledgeTopics, setKnowledgeTopics] = useState<any[]>([]);
  const [knowledgeStats, setKnowledgeStats] = useState<any>(null);
  const [recentItems, setRecentItems] = useState<any[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [recentItemsPage, setRecentItemsPage] = useState(1);
  const [itemsPerPage] = useState(5);
  const [searchResultsPage, setSearchResultsPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Reload when community changes to prevent cross-community leakage
    if (currentCommunity?.id) {
      loadKnowledgeInsights();
      loadKnowledgeTopics();
      loadKnowledgeStats();
      loadRecentItems();
      setSearchResults([]);
      setSearchPerformed(false);
      setRecentItemsPage(1);
      setExtractionResult(null);
      setError(null);
    } else {
      // Clear data when no community is selected
      setKnowledgeInsights(null);
      setKnowledgeTopics([]);
      setKnowledgeStats(null);
      setRecentItems([]);
      setSearchPerformed(false);
      setSearchResults([]);
      setExtractionResult(null);
      setError(null);
    }
  }, [currentCommunity?.id]);

  const loadKnowledgeInsights = async () => {
    if (!currentCommunity?.id) {
      setKnowledgeInsights(null);
      return;
    }
    setIsLoadingInsights(true);
    try {
      const insights = await getKnowledgeInsights(timePeriod);
      setKnowledgeInsights(insights);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load insights:', err);
      setError(err.message);
    } finally {
      setIsLoadingInsights(false);
    }
  };

  const loadKnowledgeTopics = async () => {
    if (!currentCommunity?.id) {
      setKnowledgeTopics([]);
      return;
    }
    setIsLoadingTopics(true);
    try {
      const topics = await getKnowledgeTopics(20); // Top 20 topics
      setKnowledgeTopics(topics);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load topics:', err);
      setError(err.message);
    } finally {
      setIsLoadingTopics(false);
    }
  };

  const loadKnowledgeStats = async () => {
    if (!currentCommunity?.id) {
      setKnowledgeStats(null);
      return;
    }
    setIsLoadingStats(true);
    try {
      const stats = await getKnowledgeStats();
      setKnowledgeStats(stats);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load stats:', err);
      // Don't set error for stats, it's not critical
    } finally {
      setIsLoadingStats(false);
    }
  };

  const loadRecentItems = async () => {
    if (!currentCommunity?.id) {
      setRecentItems([]);
      return;
    }
    setIsLoadingItems(true);
    try {
      // Load 20 items (4 pages worth) for pagination without too many API calls
      const items = await aiAgentService.getRecentKnowledge(currentCommunity.id, 20);
      setRecentItems(items);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load recent items:', err);
    } finally {
      setIsLoadingItems(false);
    }
  };

  const handleExtractKnowledge = async () => {
    if (!currentCommunity?.id) {
      setError('Please select a community to extract knowledge');
      return;
    }
    setIsExtracting(true);
    setError(null);
    
    try {
      const result = await extractKnowledge(timePeriod, selectedTopic || undefined);
      setExtractionResult(result);
      await loadKnowledgeInsights(); // Refresh insights
      await loadKnowledgeTopics(); // Refresh topics
      await loadKnowledgeStats(); // Refresh stats
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSearchKnowledge = async () => {
    if (!searchQuery.trim()) return;
    if (!currentCommunity?.id) {
      setError('Please select a community to search knowledge');
      return;
    }
    
    setIsSearching(true);
    setSearchPerformed(true);
    setSearchResultsPage(1);
    try {
      const results = await searchKnowledge(searchQuery);
      setSearchResults(results);
      setError(null);
    } catch (err: any) {
      setError(err.message);
      setSearchResults([]);
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

  // Show community selection prompt if no community is active
  if (!currentCommunity) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-[hsl(var(--theme-bg-primary))]">
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center border border-purple-500/30">
          <BookOpen className="w-10 h-10 text-purple-400" />
        </div>
        <h3 className="font-semibold text-xl mb-3 text-[hsl(var(--theme-text-primary))]">
          Select a Community
        </h3>
        <p className="text-sm max-w-md text-[hsl(var(--theme-text-muted))]">
          Knowledge Builder organizes insights from your community conversations.
          Please select a community from the sidebar to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[hsl(var(--theme-bg-primary))]">
      {/* Header */}
      <div className="p-5 border-b border-[hsl(var(--theme-border-default))] relative overflow-hidden">
        {/* Gradient accent line at top */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 via-pink-500 to-rose-500" />
        
        <div className="flex items-center gap-4 mb-5">
          <div className="relative">
            <div className="absolute inset-0 bg-purple-500 rounded-xl blur-lg opacity-40"></div>
            <div className="relative p-3 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl shadow-lg border border-purple-400/30">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-[hsl(var(--theme-text-primary))] flex items-center gap-2">
              Knowledge Builder
              <Lightbulb className="w-4 h-4 text-amber-400" />
            </h3>
            <p className="text-sm text-[hsl(var(--theme-text-muted))]">
              Extract and organize knowledge from {currentCommunity.name}
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="space-y-3">
          {/* Extraction Controls */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-[hsl(var(--theme-text-secondary))]">
                Extract from:
              </label>
              <select
                value={timePeriod}
                onChange={(e) => setTimePeriod(Number(e.target.value))}
                disabled={isExtracting}
                className="px-4 py-2 rounded-xl text-sm border focus:outline-none focus:ring-2 focus:ring-purple-500/50 bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))] disabled:opacity-50 transition-all"
              >
                <option value={6}>Last 6 hours</option>
                <option value={12}>Last 12 hours</option>
                <option value={24}>Last 24 hours</option>
                <option value={48}>Last 48 hours</option>
                <option value={168}>Last week</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-[hsl(var(--theme-text-secondary))]">
                Topic Filter:
              </label>
              <select
                value={selectedTopic}
                onChange={(e) => {
                  const topic = e.target.value;
                  setSelectedTopic(topic);
                  // Auto-search when topic is selected
                  if (topic && currentCommunity?.id) {
                    setSearchQuery(topic);
                    setSearchPerformed(true);
                    setSearchResultsPage(1);
                    searchKnowledge(topic).then(results => {
                      setSearchResults(results);
                      setError(null);
                    }).catch(err => {
                      setError(err.message);
                      setSearchResults([]);
                    });
                  } else if (!topic) {
                    // Clear search when "All Topics" is selected
                    setSearchQuery('');
                    setSearchResults([]);
                    setSearchPerformed(false);
                  }
                }}
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
                placeholder={selectedTopic ? `Searching for: ${selectedTopic}` : "Search knowledge base..."}
                disabled={isSearching}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchKnowledge()}
                className={`w-full px-3 py-1.5 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                  isDarkMode 
                    ? 'bg-slate-800 border-slate-600 text-white placeholder-gray-500' 
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                } disabled:opacity-50`}
              />
            </div>
            
            {selectedTopic && (
              <button
                onClick={() => {
                  setSelectedTopic('');
                  setSearchQuery('');
                  setSearchResults([]);
                  setSearchPerformed(false);
                }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  'bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-primary))] hover:bg-[hsl(var(--theme-bg-hover))]'
                }`}
                title="Clear filter"
              >
                ✕ Clear
              </button>
            )}
            
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
          <div className={`p-4 border-b ${'border-[hsl(var(--theme-border-default))]'}`}>
            <div className="flex items-center justify-between mb-4">
              <h4 className={`font-medium ${'text-[hsl(var(--theme-text-primary))]'}`}>
                ✨ Extraction Complete
              </h4>
              <button
                onClick={() => setExtractionResult(null)}
                className={`text-xs ${'text-[hsl(var(--theme-text-secondary))] hover:text-[hsl(var(--theme-text-primary))]'}`}
              >
                Dismiss
              </button>
            </div>

            {/* Success Message */}
            <div className={`p-3 rounded-lg border mb-3 ${
              isDarkMode ? 'bg-green-900/20 border-green-800 text-green-300' : 'bg-green-50 border-green-200 text-green-700'
            }`}>
              <p className="text-sm font-medium">
                {extractionResult.message || 'Knowledge extracted successfully!'}
              </p>
            </div>

            {/* Breakdown Stats */}
            <div className="grid grid-cols-4 gap-2 mb-3">
              <div className={`p-3 rounded-lg border text-center ${
                'bg-[hsl(var(--theme-bg-secondary)/0.5)] border-[hsl(var(--theme-border-default))]'
              }`}>
                <div className={`text-2xl font-bold ${'text-[hsl(var(--theme-text-primary))]'}`}>
                  {extractionResult.total_items || 0}
                </div>
                <div className={`text-xs ${'text-[hsl(var(--theme-text-secondary))]'}`}>
                  Total
                </div>
              </div>

              <div className={`p-3 rounded-lg border text-center ${
                isDarkMode ? 'bg-blue-900/20 border-blue-800' : 'bg-blue-50 border-blue-200'
              }`}>
                <div className={`text-2xl font-bold ${isDarkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                  {extractionResult.faqs || 0}
                </div>
                <div className={`text-xs ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                  FAQs
                </div>
              </div>

              <div className={`p-3 rounded-lg border text-center ${
                isDarkMode ? 'bg-green-900/20 border-green-800' : 'bg-green-50 border-green-200'
              }`}>
                <div className={`text-2xl font-bold ${isDarkMode ? 'text-green-300' : 'text-green-700'}`}>
                  {extractionResult.definitions || 0}
                </div>
                <div className={`text-xs ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>
                  Definitions
                </div>
              </div>

              <div className={`p-3 rounded-lg border text-center ${
                isDarkMode ? 'bg-purple-900/20 border-purple-800' : 'bg-purple-50 border-purple-200'
              }`}>
                <div className={`text-2xl font-bold ${isDarkMode ? 'text-purple-300' : 'text-purple-700'}`}>
                  {extractionResult.decisions || 0}
                </div>
                <div className={`text-xs ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`}>
                  Decisions
                </div>
              </div>
            </div>

            {/* Channels Processed */}
            {extractionResult.channels_processed && extractionResult.channels_processed.length > 0 && (
              <div>
                <h5 className={`text-xs font-medium mb-2 ${'text-[hsl(var(--theme-text-secondary))]'}`}>
                  Processed {extractionResult.channels_processed.length} channel(s)
                </h5>
              </div>
            )}
          </div>
        )}

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="p-4 border-b border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <h4 className={`font-medium ${'text-[hsl(var(--theme-text-primary))]'}`}>
                Search Results ({searchResults.length})
              </h4>
              {isSearching && (
                <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
              )}
            </div>

            <div className="space-y-3">
              {searchResults.slice((searchResultsPage - 1) * itemsPerPage, searchResultsPage * itemsPerPage).map((result, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg border ${
                    'bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Question/Title */}
                      <div className={`font-medium mb-1 ${'text-[hsl(var(--theme-text-primary))]'}`}>
                        {result.question || result.title || 'Search Result'}
                      </div>
                      {/* Answer/Content */}
                      {result.answer && (
                        <div className={`text-sm mb-2 ${'text-[hsl(var(--theme-text-secondary))]'}`}>
                          {truncateText(result.answer)}
                        </div>
                      )}
                      {/* Tags and Metadata */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {result.tags && result.tags.length > 0 && result.tags.map((tag, idx) => (
                          <span key={idx} className={`px-2 py-0.5 rounded-full text-xs border ${
                            isDarkMode ? 'bg-purple-900/30 text-purple-300 border-purple-800' : 'bg-purple-100 text-purple-700 border-purple-200'
                          }`}>
                            {tag}
                          </span>
                        ))}
                        {(!result.tags || result.tags.length === 0) && (
                          <span className={`px-2 py-0.5 rounded-full text-xs border ${
                            isDarkMode ? 'bg-gray-900/30 text-gray-400 border-gray-800' : 'bg-gray-100 text-gray-600 border-gray-200'
                          }`}>
                            General
                          </span>
                        )}
                        <span className={`text-xs ${getRelevanceColor(result.relevance_score || 0)}`}>
                          {result.relevance_score > 0 ? `${Math.round(result.relevance_score * 100)}% match` : 'Match'}
                        </span>
                        {result.created_at && (
                          <span className={`text-xs ${'text-[hsl(var(--theme-text-muted))]'}`}>
                            {formatDate(result.created_at)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Search Pagination Controls */}
            {searchResults.length > itemsPerPage && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-700">
                <button
                  onClick={() => setSearchResultsPage(prev => Math.max(1, prev - 1))}
                  disabled={searchResultsPage === 1}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    searchResultsPage === 1
                      ? 'bg-[hsl(var(--theme-bg-secondary))] text-[hsl(var(--theme-text-muted))] cursor-not-allowed'
                      : 'bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-primary))] hover:bg-[hsl(var(--theme-bg-hover))]'
                  }`}
                >
                  ← Previous
                </button>
                
                <span className={`text-sm ${'text-[hsl(var(--theme-text-secondary))]'}`}>
                  Page {searchResultsPage} of {Math.ceil(searchResults.length / itemsPerPage)}
                </span>
                
                <button
                  onClick={() => setSearchResultsPage(prev => Math.min(Math.ceil(searchResults.length / itemsPerPage), prev + 1))}
                  disabled={searchResultsPage >= Math.ceil(searchResults.length / itemsPerPage)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    searchResultsPage >= Math.ceil(searchResults.length / itemsPerPage)
                      ? 'bg-[hsl(var(--theme-bg-secondary))] text-[hsl(var(--theme-text-muted))] cursor-not-allowed'
                      : 'bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-primary))] hover:bg-[hsl(var(--theme-bg-hover))]'
                  }`}
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        )}

        {/* No Search Results */}
        {searchPerformed && searchResults.length === 0 && !isSearching && (
          <div className={`p-4 border-b ${'border-[hsl(var(--theme-border-default))]'}`}>
            <div className="text-center py-6">
              <Search className={`w-10 h-10 mx-auto mb-2 ${'text-[hsl(var(--theme-text-muted))]'}`} />
              <h5 className={`font-medium mb-1 ${'text-[hsl(var(--theme-text-secondary))]'}`}>
                No Results Found
              </h5>
              <p className={`text-sm ${'text-[hsl(var(--theme-text-muted))]'}`}>
                No knowledge items match "{searchQuery}". Try a different search term.
              </p>
            </div>
          </div>
        )}

        {/* Recent Knowledge Items */}
        {currentCommunity && recentItems.length > 0 && (
          <div className="p-4 border-b border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <h4 className={`font-medium ${'text-[hsl(var(--theme-text-primary))]'}`}>
                Recent Knowledge Items ({recentItems.length})
              </h4>
              {isLoadingItems && (
                <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
              )}
            </div>

            <div className="space-y-3">
              {recentItems.slice((recentItemsPage - 1) * itemsPerPage, recentItemsPage * itemsPerPage).map((item) => (
                <div
                  key={item.id}
                  className={`p-3 rounded-lg border ${
                    'bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Type Badge */}
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                          item.type === 'faq' 
                            ? (isDarkMode ? 'bg-blue-900/30 text-blue-300 border-blue-800' : 'bg-blue-100 text-blue-700 border-blue-200')
                            : item.type === 'definition'
                            ? (isDarkMode ? 'bg-green-900/30 text-green-300 border-green-800' : 'bg-green-100 text-green-700 border-green-200')
                            : (isDarkMode ? 'bg-purple-900/30 text-purple-300 border-purple-800' : 'bg-purple-100 text-purple-700 border-purple-200')
                        }`}>
                          {item.type.toUpperCase()}
                        </span>
                        {item.channel_name && (
                          <span className={`text-xs ${'text-[hsl(var(--theme-text-muted))]'}`}>
                            #{item.channel_name}
                          </span>
                        )}
                        <span className={`text-xs ${'text-[hsl(var(--theme-text-muted))]'}`}>
                          {formatDate(item.created_at)}
                        </span>
                      </div>

                      {/* Question */}
                      {item.question && (
                        <div className={`font-medium mb-1 ${'text-[hsl(var(--theme-text-primary))]'}`}>
                          {item.question}
                        </div>
                      )}

                      {/* Answer */}
                      {item.answer && (
                        <div className={`text-sm ${'text-[hsl(var(--theme-text-secondary))]'}`}>
                          {item.answer}
                        </div>
                      )}

                      {/* Tags */}
                      {item.tags && item.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {item.tags.slice(0, 3).map((tag, idx) => (
                            <span 
                              key={idx}
                              className={`px-2 py-0.5 rounded text-xs ${
                                'bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-secondary))]'
                              }`}
                            >
                              {tag}
                            </span>
                          ))}
                          {item.tags.length > 3 && (
                            <span className={`text-xs ${'text-[hsl(var(--theme-text-muted))]'}`}>
                              +{item.tags.length - 3} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination Controls */}
            {recentItems.length > itemsPerPage && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-700">
                <button
                  onClick={() => setRecentItemsPage(prev => Math.max(1, prev - 1))}
                  disabled={recentItemsPage === 1}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    recentItemsPage === 1
                      ? 'bg-[hsl(var(--theme-bg-secondary))] text-[hsl(var(--theme-text-muted))] cursor-not-allowed'
                      : 'bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-primary))] hover:bg-[hsl(var(--theme-bg-hover))]'
                  }`}
                >
                  ← Previous
                </button>
                
                <span className={`text-sm ${'text-[hsl(var(--theme-text-secondary))]'}`}>
                  Page {recentItemsPage} of {Math.ceil(recentItems.length / itemsPerPage)}
                </span>
                
                <button
                  onClick={() => setRecentItemsPage(prev => Math.min(Math.ceil(recentItems.length / itemsPerPage), prev + 1))}
                  disabled={recentItemsPage >= Math.ceil(recentItems.length / itemsPerPage)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    recentItemsPage >= Math.ceil(recentItems.length / itemsPerPage)
                      ? 'bg-[hsl(var(--theme-bg-secondary))] text-[hsl(var(--theme-text-muted))] cursor-not-allowed'
                      : 'bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-primary))] hover:bg-[hsl(var(--theme-bg-hover))]'
                  }`}
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        )}

        {/* Knowledge Base Stats */}
        {knowledgeStats && knowledgeStats.success && (
          <div className={`p-4 border-b ${'border-[hsl(var(--theme-border-default))]'}`}>
            <div className="flex items-center justify-between mb-3">
              <h4 className={`font-medium flex items-center gap-2 ${'text-[hsl(var(--theme-text-primary))]'}`}>
                <Archive className="w-4 h-4" />
                Knowledge Base Summary
              </h4>
              {isLoadingStats && (
                <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
              )}
            </div>

            {/* Info Helper */}
            <div className={`p-2 rounded-lg mb-3 text-xs ${
              isDarkMode ? 'bg-blue-900/20 border border-blue-800 text-blue-300' : 'bg-blue-50 border border-blue-200 text-blue-700'
            }`}>
              <p>
                <strong>FAQs:</strong> Question-answer pairs •{' '}
                <strong>Definitions:</strong> Term explanations •{' '}
                <strong>Decisions:</strong> Team choices
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className={`p-3 rounded-lg border text-center ${
                'bg-[hsl(var(--theme-bg-secondary)/0.5)] border-[hsl(var(--theme-border-default))]'
              }`}>
                <div className={`text-xl font-bold ${'text-[hsl(var(--theme-text-primary))]'}`}>
                  {knowledgeStats.total_items || 0}
                </div>
                <div className={`text-xs ${'text-[hsl(var(--theme-text-secondary))]'}`}>
                  Total Items
                </div>
              </div>

              <div className={`p-3 rounded-lg border text-center ${
                isDarkMode ? 'bg-blue-900/20 border-blue-800' : 'bg-blue-50 border-blue-200'
              }`}>
                <div className={`text-xl font-bold ${isDarkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                  {knowledgeStats.by_type?.faq || 0}
                </div>
                <div className={`text-xs ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                  FAQs
                </div>
              </div>

              <div className={`p-3 rounded-lg border text-center ${
                isDarkMode ? 'bg-green-900/20 border-green-800' : 'bg-green-50 border-green-200'
              }`}>
                <div className={`text-xl font-bold ${isDarkMode ? 'text-green-300' : 'text-green-700'}`}>
                  {knowledgeStats.by_type?.definition || 0}
                </div>
                <div className={`text-xs ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>
                  Definitions
                </div>
              </div>

              <div className={`p-3 rounded-lg border text-center ${
                isDarkMode ? 'bg-purple-900/20 border-purple-800' : 'bg-purple-50 border-purple-200'
              }`}>
                <div className={`text-xl font-bold ${isDarkMode ? 'text-purple-300' : 'text-purple-700'}`}>
                  {knowledgeStats.by_type?.decision || 0}
                </div>
                <div className={`text-xs ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`}>
                  Decisions
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Knowledge Insights */}
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h4 className={`font-medium ${'text-[hsl(var(--theme-text-primary))]'}`}>
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
                  'bg-[hsl(var(--theme-bg-secondary)/0.5)] border-[hsl(var(--theme-border-default))]'
                }`}>
                  <div className={`text-lg font-semibold ${'text-[hsl(var(--theme-text-primary))]'}`}>
                    {knowledgeInsights.total_knowledge_items || 0}
                  </div>
                  <div className={`text-xs ${'text-[hsl(var(--theme-text-secondary))]'}`}>
                    Total Items
                  </div>
                </div>
                <div className={`p-3 rounded-lg border ${
                  'bg-[hsl(var(--theme-bg-secondary)/0.5)] border-[hsl(var(--theme-border-default))]'
                }`}>
                  <div className={`text-lg font-semibold ${'text-[hsl(var(--theme-text-primary))]'}`}>
                    {knowledgeInsights.unique_topics || 0}
                  </div>
                  <div className={`text-xs ${'text-[hsl(var(--theme-text-secondary))]'}`}>
                    Topics
                  </div>
                </div>
                <div className={`p-3 rounded-lg border ${
                  'bg-[hsl(var(--theme-bg-secondary)/0.5)] border-[hsl(var(--theme-border-default))]'
                }`}>
                  <div className={`text-lg font-semibold ${'text-[hsl(var(--theme-text-primary))]'}`}>
                    {knowledgeInsights.avg_relevance ? Math.round(knowledgeInsights.avg_relevance * 100) : 0}%
                  </div>
                  <div className={`text-xs ${'text-[hsl(var(--theme-text-secondary))]'}`}>
                    Avg Quality
                  </div>
                </div>
                <div className={`p-3 rounded-lg border ${
                  'bg-[hsl(var(--theme-bg-secondary)/0.5)] border-[hsl(var(--theme-border-default))]'
                }`}>
                  <div className={`text-lg font-semibold ${'text-[hsl(var(--theme-text-primary))]'}`}>
                    {knowledgeInsights.growth_rate !== undefined && knowledgeInsights.growth_rate > 0 
                      ? `+${Math.round(knowledgeInsights.growth_rate * 100)}%` 
                      : '0%'}
                  </div>
                  <div className={`text-xs ${'text-[hsl(var(--theme-text-secondary))]'}`}>
                    Growth Rate
                  </div>
                </div>
              </div>

              {/* No Data Message */}
              {knowledgeInsights.total_knowledge_items === 0 && (
                <div className={`p-3 rounded-lg border text-center ${
                  isDarkMode ? 'bg-blue-900/20 border-blue-800 text-blue-300' : 'bg-blue-50 border-blue-200 text-blue-700'
                }`}>
                  <p className="text-sm">
                    No knowledge items found in the last {timePeriod} hours. Click "Extract Knowledge" to analyze conversations.
                  </p>
                </div>
              )}

              {/* Top Insights */}
              {knowledgeInsights.insights && knowledgeInsights.insights.length > 0 && (
                <div>
                  <h5 className={`font-medium mb-2 ${'text-[hsl(var(--theme-text-primary))]'}`}>
                    Key Insights
                  </h5>
                  <div className="space-y-2">
                    {knowledgeInsights.insights.slice(0, 3).map((insight: string, index: number) => (
                      <div key={index} className={`flex items-start gap-2 text-sm ${
                        'text-[hsl(var(--theme-text-primary))]'
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
              <BookOpen className={`w-10 h-10 mx-auto mb-2 ${'text-[hsl(var(--theme-text-muted))]'}`} />
              <h5 className={`font-medium mb-1 ${'text-[hsl(var(--theme-text-secondary))]'}`}>
                No Insights Available
              </h5>
              <p className={`text-sm ${'text-[hsl(var(--theme-text-muted))]'}`}>
                Knowledge insights will appear as content is processed
              </p>
            </div>
          )}
        </div>

        {/* Popular Topics */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h4 className={`font-medium ${'text-[hsl(var(--theme-text-primary))]'}`}>
              Popular Knowledge Topics
            </h4>
            {isLoadingTopics && (
              <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
            )}
          </div>

          {knowledgeTopics.length === 0 && !isLoadingTopics ? (
            <div className="text-center py-6">
              <Tag className={`w-10 h-10 mx-auto mb-2 ${'text-[hsl(var(--theme-text-muted))]'}`} />
              <h5 className={`font-medium mb-1 ${'text-[hsl(var(--theme-text-secondary))]'}`}>
                No Topics Found
              </h5>
              <p className={`text-sm ${'text-[hsl(var(--theme-text-muted))]'}`}>
                Topics will appear as knowledge is extracted
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {knowledgeTopics.slice(0, 12).map((topic, index) => (
                <div
                  key={index}
                  className={`p-2 rounded-lg border cursor-pointer transition-colors hover:bg-opacity-80 ${
                    'bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))] hover:bg-[hsl(var(--theme-bg-hover))]'
                  } ${selectedTopic === (topic.topic || topic.name) ? (isDarkMode ? 'ring-2 ring-purple-500' : 'ring-2 ring-purple-400') : ''}`}
                  onClick={() => {
                    const topicName = topic.topic || topic.name;
                    setSelectedTopic(topicName);
                    // Trigger search when clicking a topic
                    if (topicName && currentCommunity?.id) {
                      setSearchQuery(topicName);
                      setSearchPerformed(true);
                      setSearchResultsPage(1);
                      searchKnowledge(topicName).then(results => {
                        setSearchResults(results);
                        setError(null);
                      }).catch(err => {
                        setError(err.message);
                        setSearchResults([]);
                      });
                    }
                  }}
                >
                  <div className="flex items-center gap-2">
                    {getTopicIcon(topic.topic || topic.name)}
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium truncate ${'text-[hsl(var(--theme-text-primary))]'}`}>
                        {topic.topic || topic.name}
                      </div>
                      <div className={`text-xs ${'text-[hsl(var(--theme-text-secondary))]'}`}>
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