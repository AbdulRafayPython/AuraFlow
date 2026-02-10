/**
 * Mood Trends Analytics Page
 * Visualizes sentiment analysis data for the selected community.
 */

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useCommunityDashboard } from '@/contexts/CommunityDashboardContext';
import adminService, { MoodTrend } from '@/services/adminService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Legend
} from 'recharts';
import {
  Activity,
  RefreshCw,
  Smile,
  Frown,
  Meh,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const chartConfig = {
  positive: {
    label: 'Positive',
    color: '#22c55e',
  },
  negative: {
    label: 'Negative',
    color: '#ef4444',
  },
  neutral: {
    label: 'Neutral',
    color: '#6b7280',
  },
};

const COLORS = ['#22c55e', '#ef4444', '#6b7280'];

// Color mapping by sentiment name
const SENTIMENT_COLORS: Record<string, string> = {
  Positive: '#22c55e',  // green
  Negative: '#ef4444',  // red
  Neutral: '#6b7280',   // gray
};

// Mood category colors for display
const MOOD_CATEGORY_COLORS: Record<string, string> = {
  joy: '#fbbf24',
  love: '#ec4899',
  hope: '#10b981',
  gratitude: '#8b5cf6',
  excitement: '#f97316',
  sadness: '#3b82f6',
  anger: '#ef4444',
  fear: '#6366f1',
  anxiety: '#f59e0b',
  surprise: '#06b6d4',
};

export default function MoodTrends() {
  const { toast } = useToast();
  const { selectedCommunity } = useCommunityDashboard();
  
  const [dailyTrends, setDailyTrends] = useState<MoodTrend[]>([]);
  const [distribution, setDistribution] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState('7');
  
  // New state for enhanced mood data
  const [trendDirection, setTrendDirection] = useState<string>('stable');
  const [dominantMood, setDominantMood] = useState<string>('neutral');
  const [moodCategories, setMoodCategories] = useState<Record<string, number>>({});
  const [hourlySummary, setHourlySummary] = useState<Array<{ hour: string; dominant_mood: string; message_count: number }>>([]);
  const [totalEntries, setTotalEntries] = useState<number>(0);
  const [hasData, setHasData] = useState<boolean>(false);

  const fetchMoodTrends = async () => {
    if (!selectedCommunity) return;
    
    setLoading(true);
    try {
      const data = await adminService.getMoodTrends(selectedCommunity.id, parseInt(days));
      setDailyTrends(data.daily_trends);
      setDistribution(data.sentiment_distribution);
      setTrendDirection(data.trend_direction || 'stable');
      setDominantMood(data.dominant_mood || 'neutral');
      setMoodCategories(data.mood_categories || {});
      setHourlySummary(data.hourly_summary || []);
      setTotalEntries(data.total_entries || 0);
      setHasData(data.has_data ?? false);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load mood trends',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMoodTrends();
  }, [selectedCommunity?.id, days]);

  // Format daily data for chart
  const formattedDailyData = dailyTrends.map(d => ({
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    positive: d.positive,
    negative: d.negative,
    neutral: d.neutral,
  }));

  // Pie chart data
  const pieData = [
    { name: 'Positive', value: distribution.positive || 0 },
    { name: 'Negative', value: distribution.negative || 0 },
    { name: 'Neutral', value: distribution.neutral || 0 },
  ].filter(d => d.value > 0);

  const total = pieData.reduce((sum, d) => sum + d.value, 0);

  // Calculate percentages
  const positivePercent = total > 0 ? Math.round((distribution.positive || 0) / total * 100) : 0;
  const negativePercent = total > 0 ? Math.round((distribution.negative || 0) / total * 100) : 0;
  const neutralPercent = total > 0 ? Math.round((distribution.neutral || 0) / total * 100) : 0;

  // Trend calculation (compare first half to second half)
  const halfPoint = Math.floor(dailyTrends.length / 2);
  const firstHalf = dailyTrends.slice(0, halfPoint);
  const secondHalf = dailyTrends.slice(halfPoint);
  
  const avgFirstPositive = firstHalf.length > 0 
    ? firstHalf.reduce((sum, d) => sum + d.positive, 0) / firstHalf.length 
    : 0;
  const avgSecondPositive = secondHalf.length > 0 
    ? secondHalf.reduce((sum, d) => sum + d.positive, 0) / secondHalf.length 
    : 0;
  const positiveTrend = avgFirstPositive > 0 
    ? Math.round((avgSecondPositive - avgFirstPositive) / avgFirstPositive * 100) 
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-purple-500" />
            Mood Trends
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Sentiment analysis across all conversations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Time range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={fetchMoodTrends}>
            <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-green-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Smile className="h-4 w-4 text-green-500" />
              Positive Sentiment
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-3xl font-bold text-green-500">{positivePercent}%</div>
                <div className="flex items-center gap-1 mt-1 text-xs">
                  {positiveTrend >= 0 ? (
                    <TrendingUp className="h-3 w-3 text-green-500" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-red-500" />
                  )}
                  <span className={positiveTrend >= 0 ? 'text-green-500' : 'text-red-500'}>
                    {positiveTrend >= 0 ? '+' : ''}{positiveTrend}%
                  </span>
                  <span className="text-muted-foreground">vs previous period</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
        <Card className="border-red-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Frown className="h-4 w-4 text-red-500" />
              Negative Sentiment
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-3xl font-bold text-red-500">{negativePercent}%</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {distribution.negative || 0} messages analyzed
                </p>
              </>
            )}
          </CardContent>
        </Card>
        <Card className="border-gray-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Meh className="h-4 w-4 text-gray-500" />
              Neutral Sentiment
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-3xl font-bold text-gray-500">{neutralPercent}%</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {distribution.neutral || 0} messages analyzed
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Daily Trends Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Sentiment Over Time</CardTitle>
            <CardDescription>Daily breakdown of sentiment analysis</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : formattedDailyData.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No sentiment data available</p>
                </div>
              </div>
            ) : (
              <ChartContainer config={chartConfig} className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={formattedDailyData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis 
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area
                      type="monotone"
                      dataKey="positive"
                      name="Positive"
                      stackId="1"
                      stroke="#22c55e"
                      fill="#22c55e"
                      fillOpacity={0.6}
                    />
                    <Area
                      type="monotone"
                      dataKey="neutral"
                      name="Neutral"
                      stackId="1"
                      stroke="#6b7280"
                      fill="#6b7280"
                      fillOpacity={0.4}
                    />
                    <Area
                      type="monotone"
                      dataKey="negative"
                      name="Negative"
                      stackId="1"
                      stroke="#ef4444"
                      fill="#ef4444"
                      fillOpacity={0.6}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Distribution Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Overall Distribution</CardTitle>
            <CardDescription>Sentiment breakdown for period</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : pieData.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No data available</p>
                </div>
              </div>
            ) : (
              <div className="h-[300px] flex flex-col items-center justify-center">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={SENTIMENT_COLORS[entry.name] || COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <ChartTooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap justify-center gap-4 mt-4">
                  {pieData.map((entry, index) => (
                    <div key={entry.name} className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: SENTIMENT_COLORS[entry.name] || COLORS[index] }}
                      />
                      <span className="text-sm">{entry.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {entry.value}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Mood Categories & Hourly Summary */}
      {hasData && (Object.keys(moodCategories).length > 0 || hourlySummary.length > 0) && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Mood Categories */}
          {Object.keys(moodCategories).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Detected Emotions</CardTitle>
                <CardDescription>Top emotion categories from messages</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(moodCategories).map(([category, count]) => {
                      const maxCount = Math.max(...Object.values(moodCategories));
                      const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;
                      const color = MOOD_CATEGORY_COLORS[category] || '#6b7280';
                      return (
                        <div key={category} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="capitalize">{category}</span>
                            <span className="text-muted-foreground">{count}</span>
                          </div>
                          <div className="h-2 rounded-full bg-secondary overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${percentage}%`, backgroundColor: color }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Hourly Mood Pattern */}
          {hourlySummary.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Hourly Mood Pattern</CardTitle>
                <CardDescription>Dominant mood throughout the day</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-[200px] w-full" />
                ) : (
                  <div className="grid grid-cols-6 gap-1 sm:grid-cols-8 lg:grid-cols-12">
                    {hourlySummary.map((item) => {
                      const moodColor = item.dominant_mood === 'positive' ? 'bg-green-500' :
                                       item.dominant_mood === 'negative' ? 'bg-red-500' : 'bg-gray-400';
                      return (
                        <div
                          key={item.hour}
                          className="flex flex-col items-center gap-1"
                          title={`${item.hour}: ${item.dominant_mood} (${item.message_count} msgs)`}
                        >
                          <div className={cn('w-6 h-6 rounded-full', moodColor)} />
                          <span className="text-[10px] text-muted-foreground">{item.hour.slice(0, 2)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Insights */}
      <Card>
        <CardHeader>
          <CardTitle>Mood Insights</CardTitle>
          <CardDescription>AI-powered analysis of sentiment patterns</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Trend Direction Card */}
              <div className={cn(
                "p-4 rounded-lg border",
                trendDirection === 'improving' ? 'bg-green-500/10 border-green-500/20' :
                trendDirection === 'declining' ? 'bg-red-500/10 border-red-500/20' :
                'bg-blue-500/10 border-blue-500/20'
              )}>
                <div className="flex items-center gap-2 mb-2">
                  {trendDirection === 'improving' ? (
                    <TrendingUp className="h-5 w-5 text-green-500" />
                  ) : trendDirection === 'declining' ? (
                    <TrendingDown className="h-5 w-5 text-red-500" />
                  ) : (
                    <Activity className="h-5 w-5 text-blue-500" />
                  )}
                  <span className="font-medium">Trend Direction</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {trendDirection === 'improving' 
                    ? 'Sentiment is improving! Community mood is getting better.'
                    : trendDirection === 'declining'
                    ? 'Sentiment is declining. Consider reviewing recent activity.'
                    : 'Sentiment is stable with no major changes.'}
                </p>
              </div>

              {/* Dominant Mood Card */}
              <div className={cn(
                "p-4 rounded-lg border",
                dominantMood === 'positive' ? 'bg-green-500/10 border-green-500/20' :
                dominantMood === 'negative' ? 'bg-red-500/10 border-red-500/20' :
                'bg-gray-500/10 border-gray-500/20'
              )}>
                <div className="flex items-center gap-2 mb-2">
                  {dominantMood === 'positive' ? (
                    <Smile className="h-5 w-5 text-green-500" />
                  ) : dominantMood === 'negative' ? (
                    <Frown className="h-5 w-5 text-red-500" />
                  ) : (
                    <Meh className="h-5 w-5 text-gray-500" />
                  )}
                  <span className="font-medium">Dominant Mood</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Overall community mood is <span className="capitalize font-medium">{dominantMood}</span>
                </p>
              </div>

              {/* Attention Areas */}
              <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Frown className="h-5 w-5 text-amber-500" />
                  <span className="font-medium">Attention Areas</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {negativePercent > 20
                    ? 'Higher than average negative sentiment detected. Review moderation logs.'
                    : 'Negative sentiment is within normal range.'}
                </p>
              </div>

              {/* Data Quality */}
              <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="h-5 w-5 text-purple-500" />
                  <span className="font-medium">Data Quality</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {totalEntries > 100
                    ? `${totalEntries} entries analyzed. Good sample size for accurate trends.`
                    : totalEntries > 0
                    ? `${totalEntries} entries analyzed. More data needed for reliable trends.`
                    : 'No mood data available yet. Start chatting to build trends.'}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
