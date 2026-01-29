/**
 * Knowledge Builder Agent - Frontend Integration Example
 * =======================================================
 * 
 * This file shows how to integrate the Knowledge Builder Agent
 * with your React frontend.
 */

// ========================================
// 1. API SERVICE METHODS
// ========================================

/**
 * Add these methods to your Frontend/src/services/aiAgentService.ts
 */

export const knowledgeBuilderService = {
  /**
   * Extract knowledge from recent channel messages
   */
  async extractKnowledge(
    channelId: number,
    timePeriodHours: number = 24
  ): Promise<{
    success: boolean;
    total_items: number;
    faqs: number;
    definitions: number;
    decisions: number;
    message: string;
  }> {
    const response = await api.post('/agents/knowledge/extract', {
      channel_id: channelId,
      time_period_hours: timePeriodHours,
    });
    return response.data;
  },

  /**
   * Search knowledge base
   */
  async searchKnowledge(
    query: string,
    channelId?: number,
    limit: number = 10
  ): Promise<{
    success: boolean;
    results: Array<{
      id: number;
      title: string;
      content: any;
      created_at: string;
    }>;
  }> {
    const params = new URLSearchParams({
      query,
      limit: limit.toString(),
    });
    
    if (channelId) {
      params.append('channel_id', channelId.toString());
    }
    
    const response = await api.get(`/agents/knowledge/search?${params}`);
    return response.data;
  },

  /**
   * Get knowledge statistics
   */
  async getKnowledgeStats(channelId?: number): Promise<{
    success: boolean;
    total_items: number;
    by_type: {
      faq: number;
      definition: number;
      decision: number;
    };
  }> {
    const params = channelId
      ? `?channel_id=${channelId}`
      : '';
    
    const response = await api.get(`/agents/knowledge/stats${params}`);
    return response.data;
  },
};


// ========================================
// 2. SOCKET.IO EVENT HANDLERS
// ========================================

/**
 * Add these to your socket event listeners
 */

// Listen for knowledge saved events
socket.on('knowledge_saved', (data) => {
  console.log('[Knowledge Builder]', data.message);
  
  // Show toast notification
  toast.success(data.message, {
    description: `FAQs: ${data.stats.faqs}, Definitions: ${data.stats.definitions}, Decisions: ${data.stats.decisions}`,
  });
});

// Trigger knowledge extraction
function saveKnowledge(channelId: number, timePeriodHours: number = 24) {
  socket.emit('save_knowledge', {
    channel_id: channelId,
    time_period_hours: timePeriodHours,
  });
}


// ========================================
// 3. REACT COMPONENT EXAMPLE
// ========================================

/**
 * KnowledgeBuilderPanel.tsx
 * 
 * A sidebar panel component for the Knowledge Builder Agent
 */

import React, { useState, useEffect } from 'react';
import { Search, BookOpen, TrendingUp, FileQuestion } from 'lucide-react';
import { knowledgeBuilderService } from '@/services/aiAgentService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface KnowledgeBuilderPanelProps {
  channelId: number;
  channelName: string;
}

export const KnowledgeBuilderPanel: React.FC<KnowledgeBuilderPanelProps> = ({
  channelId,
  channelName,
}) => {
  const [stats, setStats] = useState({
    total_items: 0,
    by_type: { faq: 0, definition: 0, decision: 0 },
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  // Load stats on mount
  useEffect(() => {
    loadStats();
  }, [channelId]);

  const loadStats = async () => {
    try {
      const result = await knowledgeBuilderService.getKnowledgeStats(channelId);
      if (result.success) {
        setStats(result);
      }
    } catch (error) {
      console.error('[KB] Failed to load stats:', error);
    }
  };

  const handleExtractKnowledge = async () => {
    setIsExtracting(true);
    try {
      const result = await knowledgeBuilderService.extractKnowledge(channelId, 24);
      
      if (result.success) {
        toast.success(result.message);
        loadStats(); // Refresh stats
      }
    } catch (error) {
      toast.error('Failed to extract knowledge');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      const result = await knowledgeBuilderService.searchKnowledge(
        searchQuery,
        channelId,
        10
      );
      
      if (result.success) {
        setSearchResults(result.results);
      }
    } catch (error) {
      toast.error('Search failed');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="flex flex-col h-full p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-blue-500" />
          <h3 className="text-lg font-semibold">Knowledge Builder</h3>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Extract and organize knowledge from {channelName}
      </p>

      {/* Extract Button */}
      <Button
        onClick={handleExtractKnowledge}
        disabled={isExtracting}
        className="w-full"
      >
        {isExtracting ? 'Extracting...' : '📘 Extract Knowledge'}
      </Button>

      {/* Statistics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Knowledge Base Stats
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total Items:</span>
            <span className="font-medium">{stats.total_items}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">FAQs:</span>
            <span className="font-medium">{stats.by_type.faq}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Definitions:</span>
            <span className="font-medium">{stats.by_type.definition}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Decisions:</span>
            <span className="font-medium">{stats.by_type.decision}</span>
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <FileQuestion className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Search Knowledge</span>
        </div>
        
        <div className="flex gap-2">
          <Input
            placeholder="Search for topics..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          />
          <Button
            onClick={handleSearch}
            disabled={isSearching || !searchQuery.trim()}
            size="icon"
          >
            <Search className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="flex-1 overflow-y-auto space-y-2">
          <span className="text-sm font-medium">
            Results ({searchResults.length})
          </span>
          
          {searchResults.map((result) => {
            const content = JSON.parse(result.content);
            return (
              <Card key={result.id} className="p-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <div className="text-sm font-medium mb-1">
                      {result.title}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {content.answer?.substring(0, 100)}
                      {content.answer?.length > 100 && '...'}
                    </div>
                    <div className="flex gap-1 mt-2">
                      <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                        {content.type}
                      </span>
                      {content.tags?.slice(0, 2).map((tag) => (
                        <span
                          key={tag}
                          className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};


// ========================================
// 4. COMMAND TRIGGER EXAMPLE
// ========================================

/**
 * Add this to your message input handler to support /save-knowledge command
 */

function handleMessageSubmit(text: string, channelId: number) {
  // Check for knowledge builder command
  if (text.trim() === '/save-knowledge') {
    // Trigger extraction via Socket.IO
    socket.emit('save_knowledge', {
      channel_id: channelId,
      time_period_hours: 24,
    });
    
    // Show feedback
    toast.info('Extracting knowledge from recent messages...');
    
    return; // Don't send as regular message
  }
  
  // ... rest of your message handling logic
}


// ========================================
// 5. TYPES
// ========================================

/**
 * Add these to your types file
 */

export interface KnowledgeItem {
  id: number;
  title: string;
  content: {
    type: 'faq' | 'definition' | 'decision';
    question: string;
    answer: string;
    tags: string[];
    relevance_score: number;
    usage_count: number;
  };
  source: string;
  related_channel: number;
  created_at: string;
}

export interface KnowledgeStats {
  success: boolean;
  total_items: number;
  by_type: {
    faq: number;
    definition: number;
    decision: number;
  };
}
