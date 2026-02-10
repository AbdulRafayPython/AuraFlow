/**
 * Engagement Analytics Page
 * Displays engagement metrics with interactive charts using Recharts.
 * All data is scoped to the selected community.
 */

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useCommunityDashboard } from '@/contexts/CommunityDashboardContext';
import adminService, { DailyEngagement, HourlyActivity, ChannelStats } from '@/services/adminService';
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
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Legend
} from 'recharts';
import {
  TrendingUp,
  RefreshCw,
  MessageSquare,
  Users,
  Hash,
  Activity
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const chartConfig = {
  messages: {
    label: 'Messages',
    color: 'hsl(var(--chart-1))',
  },
  users: {
    label: 'Active Users',
    color: 'hsl(var(--chart-2))',
  },
};

// Day names for heatmap
const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function EngagementAnalytics() {
  const { toast } = useToast();
  const { selectedCommunity } = useCommunityDashboard();
  
  const [dailyData, setDailyData] = useState<DailyEngagement[]>([]);
  const [hourlyData, setHourlyData] = useState<HourlyActivity[]>([]);
  const [topChannels, setTopChannels] = useState<ChannelStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState('7');

  const fetchAnalytics = async () => {
    if (!selectedCommunity) return;
    
    setLoading(true);
    try {
      const data = await adminService.getEngagementAnalytics(selectedCommunity.id, parseInt(days));
      setDailyData(data.daily_engagement);
      setHourlyData(data.hourly_distribution);
      setTopChannels(data.top_channels);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load engagement analytics',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [selectedCommunity?.id, days]);

  // Format daily data for chart
  const formattedDailyData = dailyData.map(d => ({
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    messages: d.messages,
    users: d.active_users,
  }));

  // Create heatmap data (24 hours x 7 days)
  const getHeatmapIntensity = (hour: number, day: number) => {
    const activity = hourlyData.find(h => h.hour === hour && (h.day_of_week === day || h.day_of_week === undefined));
    return activity?.count || activity?.messages || 0;
  };

  const maxActivity = Math.max(...hourlyData.map(h => h.count || h.messages || 0), 1);

  // Summary stats
  const totalMessages = dailyData.reduce((sum, d) => sum + (d.message_count || d.messages || 0), 0);
  const avgDailyMessages = dailyData.length > 0 ? Math.round(totalMessages / dailyData.length) : 0;
  const avgActiveUsers = dailyData.length > 0 
    ? Math.round(dailyData.reduce((sum, d) => sum + d.active_users, 0) / dailyData.length) 
    : 0;
  const peakHour = hourlyData.length > 0 
    ? hourlyData.reduce((max, h) => {
        const hCount = h.count || h.messages || 0;
        const maxCount = max.count || max.messages || 0;
        return hCount > maxCount ? h : max;
      }, hourlyData[0])
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-green-500" />
            Engagement Analytics
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track user activity and message patterns
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
          <Button variant="outline" size="sm" onClick={fetchAnalytics}>
            <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Total Messages
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{totalMessages.toLocaleString()}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Avg Daily Messages
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{avgDailyMessages.toLocaleString()}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              Avg Active Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{avgActiveUsers.toLocaleString()}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Peak Hour
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">
                {peakHour ? `${peakHour.hour}:00` : 'N/A'}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Daily Engagement Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Engagement</CardTitle>
          <CardDescription>Messages and active users over time</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[300px] w-full" />
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
                    dataKey="messages"
                    name="Messages"
                    stroke="hsl(var(--chart-1))"
                    fill="hsl(var(--chart-1))"
                    fillOpacity={0.2}
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="users"
                    name="Active Users"
                    stroke="hsl(var(--chart-2))"
                    fill="hsl(var(--chart-2))"
                    fillOpacity={0.2}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Activity Heatmap */}
        <Card>
          <CardHeader>
            <CardTitle>Activity Heatmap</CardTitle>
            <CardDescription>Message activity by hour and day of week</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : (
              <div className="space-y-2">
                <div className="grid gap-1" style={{ gridTemplateColumns: 'auto repeat(24, 1fr)' }}>
                  {/* Hour labels */}
                  <div className="text-xs text-muted-foreground h-4" />
                  {[...Array(24)].map((_, hour) => (
                    <div key={hour} className="text-[10px] text-muted-foreground text-center">
                      {hour % 4 === 0 ? `${hour}` : ''}
                    </div>
                  ))}
                  
                  {/* Day rows */}
                  {dayNames.map((day, dayIndex) => (
                    <React.Fragment key={day}>
                      <div className="text-xs text-muted-foreground pr-2 flex items-center">
                        {day}
                      </div>
                      {[...Array(24)].map((_, hour) => {
                        const intensity = getHeatmapIntensity(hour, dayIndex);
                        const opacity = maxActivity > 0 ? intensity / maxActivity : 0;
                        return (
                          <div
                            key={hour}
                            className="aspect-square rounded-sm transition-colors"
                            style={{
                              backgroundColor: `hsl(var(--chart-1) / ${Math.max(0.1, opacity)})`
                            }}
                            title={`${day} ${hour}:00 - ${intensity} messages`}
                          />
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>
                <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
                  <span>Less</span>
                  <div className="flex gap-0.5">
                    {[0.1, 0.3, 0.5, 0.7, 1].map((opacity, i) => (
                      <div
                        key={i}
                        className="w-3 h-3 rounded-sm"
                        style={{ backgroundColor: `hsl(var(--chart-1) / ${opacity})` }}
                      />
                    ))}
                  </div>
                  <span>More</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Channels */}
        <Card>
          <CardHeader>
            <CardTitle>Top Channels</CardTitle>
            <CardDescription>Most active channels by message count</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : topChannels.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Hash className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No channel activity data</p>
              </div>
            ) : (
              <div className="space-y-3">
                {topChannels.slice(0, 10).map((channel, index) => (
                  <div
                    key={channel.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className={cn(
                      'w-6 h-6 rounded flex items-center justify-center text-xs font-bold',
                      index < 3 ? 'bg-accent/20 text-accent' : 'bg-muted text-muted-foreground'
                    )}>
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium text-sm truncate">{channel.name}</span>
                      </div>
                      {channel.community_name && (
                        <div className="text-xs text-muted-foreground truncate">
                          {channel.community_name}
                        </div>
                      )}
                    </div>
                    <Badge variant="secondary" className="font-mono">
                      {channel.message_count.toLocaleString()}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
