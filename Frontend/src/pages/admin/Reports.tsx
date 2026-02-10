/**
 * Reports Page
 * View and export daily/weekly platform reports.
 */

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useCommunityDashboard } from '@/contexts/CommunityDashboardContext';
import adminService, { DailyReport, WeeklyReport } from '@/services/adminService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import {
  FileText,
  RefreshCw,
  Download,
  Calendar,
  MessageSquare,
  Users,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Brain,
  Shield,
  Building2
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const COLORS = ['#3b82f6', '#22c55e', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899'];

export default function Reports() {
  const { toast } = useToast();
  const { selectedCommunity } = useCommunityDashboard();
  
  const [dailyReport, setDailyReport] = useState<DailyReport | null>(null);
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  const fetchReports = async () => {
    if (!selectedCommunity) return;
    
    setLoading(true);
    try {
      const [daily, weekly] = await Promise.all([
        adminService.getDailyReport(selectedCommunity.id, selectedDate),
        adminService.getWeeklyReport(selectedCommunity.id)
      ]);
      setDailyReport(daily);
      setWeeklyReport(weekly);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load reports',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [selectedDate, selectedCommunity?.id]);

  const exportReport = (type: 'daily' | 'weekly') => {
    const report = type === 'daily' ? dailyReport : weeklyReport;
    if (!report) return;
    
    const data = JSON.stringify(report, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auraflow-${type}-report-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: 'Report Exported',
      description: `${type.charAt(0).toUpperCase() + type.slice(1)} report has been downloaded.`
    });
  };

  // Moderation breakdown for pie chart
  const moderationPieData = dailyReport?.moderation.breakdown
    ? Object.entries(dailyReport.moderation.breakdown).map(([name, value]) => ({
        name: name.replace('_', ' '),
        value
      }))
    : [];

  // AI agents bar chart data
  const agentBarData = dailyReport?.ai_agents
    ? Object.entries(dailyReport.ai_agents).map(([name, value]) => ({
        name: name.replace('_', ' '),
        actions: value
      }))
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6 text-blue-500" />
            Reports
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            View and export platform activity reports
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchReports}>
          <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="daily">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="daily">Daily Report</TabsTrigger>
          <TabsTrigger value="weekly">Weekly Report</TabsTrigger>
        </TabsList>

        {/* Daily Report */}
        <TabsContent value="daily" className="space-y-6 mt-6">
          {/* Date Selector */}
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-4">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="w-auto"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportReport('daily')}
                  disabled={!dailyReport}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>
            </CardContent>
          </Card>

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <Card key={i}>
                  <CardHeader className="pb-2">
                    <Skeleton className="h-4 w-24" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-8 w-16" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : dailyReport ? (
            <>
              {/* Summary Stats */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-blue-500" />
                      Total Messages
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {dailyReport.summary.total_messages.toLocaleString()}
                    </div>
                    <div className="flex items-center gap-1 mt-1 text-xs">
                      {dailyReport.summary.message_trend_percent >= 0 ? (
                        <TrendingUp className="h-3 w-3 text-green-500" />
                      ) : (
                        <TrendingDown className="h-3 w-3 text-red-500" />
                      )}
                      <span className={dailyReport.summary.message_trend_percent >= 0 ? 'text-green-500' : 'text-red-500'}>
                        {dailyReport.summary.message_trend_percent >= 0 ? '+' : ''}
                        {dailyReport.summary.message_trend_percent}%
                      </span>
                      <span className="text-muted-foreground">vs yesterday</span>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Users className="h-4 w-4 text-green-500" />
                      Active Users
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {dailyReport.summary.active_users.toLocaleString()}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Users className="h-4 w-4 text-purple-500" />
                      New Users
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {dailyReport.summary.new_users}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Shield className="h-4 w-4 text-orange-500" />
                      Moderation Flags
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {dailyReport.moderation.total_flags}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Charts */}
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Moderation Breakdown */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Moderation Breakdown</CardTitle>
                    <CardDescription>Flag types distribution</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {moderationPieData.length > 0 ? (
                      <div className="h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={moderationPieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={2}
                              dataKey="value"
                              label={({ name, value }) => `${name}: ${value}`}
                            >
                              {moderationPieData.map((_, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <ChartTooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                        <div className="text-center">
                          <Shield className="h-12 w-12 mx-auto mb-3 opacity-50" />
                          <p>No moderation flags today</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* AI Agent Activity */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">AI Agent Activity</CardTitle>
                    <CardDescription>Actions taken by each agent</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {agentBarData.length > 0 ? (
                      <div className="h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={agentBarData} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                            <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                            <YAxis 
                              type="category" 
                              dataKey="name" 
                              tick={{ fill: 'hsl(var(--muted-foreground))' }}
                              width={100}
                            />
                            <ChartTooltip />
                            <Bar dataKey="actions" fill="hsl(var(--chart-1))" radius={4} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                        <div className="text-center">
                          <Brain className="h-12 w-12 mx-auto mb-3 opacity-50" />
                          <p>No AI agent activity today</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Sentiment Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Sentiment Analysis</CardTitle>
                  <CardDescription>Overall mood distribution for the day</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-3">
                    {Object.entries(dailyReport.sentiment).map(([mood, count]) => (
                      <div 
                        key={mood}
                        className={cn(
                          'p-4 rounded-lg border',
                          mood === 'positive' && 'border-green-500/20 bg-green-500/5',
                          mood === 'negative' && 'border-red-500/20 bg-red-500/5',
                          mood === 'neutral' && 'border-gray-500/20 bg-gray-500/5'
                        )}
                      >
                        <div className={cn(
                          'text-2xl font-bold',
                          mood === 'positive' && 'text-green-500',
                          mood === 'negative' && 'text-red-500',
                          mood === 'neutral' && 'text-gray-500'
                        )}>
                          {count as number}
                        </div>
                        <div className="text-sm text-muted-foreground capitalize">{mood}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="p-8 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="font-medium">No report available</p>
              <p className="text-sm text-muted-foreground">Select a different date to view the report</p>
            </Card>
          )}
        </TabsContent>

        {/* Weekly Report */}
        <TabsContent value="weekly" className="space-y-6 mt-6">
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  {weeklyReport && (
                    <>
                      Report Period: {new Date(weeklyReport.period.start).toLocaleDateString()} - {new Date(weeklyReport.period.end).toLocaleDateString()}
                    </>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportReport('weekly')}
                  disabled={!weeklyReport}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>
            </CardContent>
          </Card>

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <Card key={i}>
                  <CardHeader className="pb-2">
                    <Skeleton className="h-4 w-24" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-8 w-16" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : weeklyReport ? (
            <>
              {/* Summary Stats */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-blue-500" />
                      Total Messages
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {weeklyReport.summary.total_messages.toLocaleString()}
                    </div>
                    <div className="flex items-center gap-1 mt-1 text-xs">
                      {weeklyReport.summary.message_trend_percent >= 0 ? (
                        <TrendingUp className="h-3 w-3 text-green-500" />
                      ) : (
                        <TrendingDown className="h-3 w-3 text-red-500" />
                      )}
                      <span className={weeklyReport.summary.message_trend_percent >= 0 ? 'text-green-500' : 'text-red-500'}>
                        {weeklyReport.summary.message_trend_percent >= 0 ? '+' : ''}
                        {weeklyReport.summary.message_trend_percent}%
                      </span>
                      <span className="text-muted-foreground">vs last week</span>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Users className="h-4 w-4 text-green-500" />
                      Active Users
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {weeklyReport.summary.active_users.toLocaleString()}
                    </div>
                    <div className="flex items-center gap-1 mt-1 text-xs">
                      {weeklyReport.summary.user_trend_percent >= 0 ? (
                        <TrendingUp className="h-3 w-3 text-green-500" />
                      ) : (
                        <TrendingDown className="h-3 w-3 text-red-500" />
                      )}
                      <span className={weeklyReport.summary.user_trend_percent >= 0 ? 'text-green-500' : 'text-red-500'}>
                        {weeklyReport.summary.user_trend_percent >= 0 ? '+' : ''}
                        {weeklyReport.summary.user_trend_percent}%
                      </span>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Users className="h-4 w-4 text-purple-500" />
                      New Users
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {weeklyReport.summary.new_users}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-cyan-500" />
                      Avg Daily Messages
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {Math.round(weeklyReport.summary.total_messages / 7).toLocaleString()}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Top Communities */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Top Communities</CardTitle>
                  <CardDescription>Most active communities this week</CardDescription>
                </CardHeader>
                <CardContent>
                  {weeklyReport.top_communities.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[50px]">Rank</TableHead>
                          <TableHead>Community</TableHead>
                          <TableHead className="text-right">Messages</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {weeklyReport.top_communities.map((community, index) => (
                          <TableRow key={community.id}>
                            <TableCell>
                              <Badge variant={index < 3 ? 'default' : 'secondary'}>
                                #{index + 1}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-medium">{community.name}</TableCell>
                            <TableCell className="text-right font-mono">
                              {community.message_count.toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No community activity this week</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="p-8 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="font-medium">No weekly report available</p>
              <p className="text-sm text-muted-foreground">Report data is being generated</p>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
