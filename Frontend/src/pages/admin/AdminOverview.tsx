/**
 * Community Dashboard Overview Page
 * Main dashboard showing key metrics, recent alerts, AI agent status, and quick actions.
 * All data is scoped to the selected community.
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '@/contexts/ThemeContext';
import { useCommunityDashboard } from '@/contexts/CommunityDashboardContext';
import { cn } from '@/lib/utils';
import adminService, {
  CommunityOverviewStats,
  ModerationAlert
} from '@/services/adminService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Users,
  MessageSquare,
  Building2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Activity,
  Brain,
  Shield,
  Heart,
  Sparkles,
  Zap,
  Eye,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ArrowRight,
  BarChart3,
  UserCheck,
  Hash
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

// Stat card component
interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: number;
  icon: React.ElementType;
  iconColor?: string;
  loading?: boolean;
}

function StatCard({ title, value, subtitle, trend, icon: Icon, iconColor = 'text-accent', loading }: StatCardProps) {
  if (loading) {
    return (
      <Card className="relative overflow-hidden">
        <CardHeader className="pb-2">
          <Skeleton className="h-4 w-24" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-16 mb-2" />
          <Skeleton className="h-3 w-32" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="relative overflow-hidden group hover:shadow-lg transition-all duration-300 hover:border-accent/30">
      <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className={cn('p-2 rounded-lg bg-accent/10', iconColor)}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value.toLocaleString()}</div>
        <div className="flex items-center gap-2 mt-1">
          {trend !== undefined && (
            <span className={cn(
              'flex items-center text-xs font-medium',
              trend >= 0 ? 'text-green-500' : 'text-red-500'
            )}>
              {trend >= 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
              {Math.abs(trend)}%
            </span>
          )}
          {subtitle && (
            <span className="text-xs text-muted-foreground">{subtitle}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// AI Agent status card
interface AgentStatusProps {
  name: string;
  status: string;
  activityCount: number;
  lastActivity: string | null;
  icon: React.ElementType;
}

function AgentStatusCard({ name, status, activityCount, lastActivity, icon: Icon }: AgentStatusProps) {
  const isActive = status === 'active';
  
  return (
    <div className={cn(
      'flex items-center gap-3 p-3 rounded-lg border transition-all',
      'hover:bg-accent/5 hover:border-accent/30',
      isActive ? 'border-green-500/20' : 'border-muted'
    )}>
      <div className={cn(
        'p-2 rounded-lg',
        isActive ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground'
      )}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{name}</span>
          <Badge variant={isActive ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
            {isActive ? 'Active' : 'Inactive'}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground">
          {activityCount} actions • {lastActivity ? `Last: ${new Date(lastActivity).toLocaleDateString()}` : 'No activity'}
        </div>
      </div>
    </div>
  );
}

// Recent alert item
interface AlertItemProps {
  alert: ModerationAlert;
}

function AlertItem({ alert }: AlertItemProps) {
  const severityColors = {
    low: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    medium: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    high: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
    critical: 'bg-red-500/10 text-red-500 border-red-500/20',
  };

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-border/50 hover:bg-accent/5 transition-all">
      <Avatar className="h-8 w-8">
        <AvatarImage src={alert.user.avatar_url || undefined} />
        <AvatarFallback className="text-xs">
          {alert.user.username[0].toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{alert.user.username}</span>
          <Badge variant="outline" className={cn('text-[10px]', severityColors[alert.severity])}>
            {alert.severity}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {alert.flag_type}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
          {alert.message_preview}
        </p>
        <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
          <span>#{alert.channel.name}</span>
          <span>•</span>
          <span>{new Date(alert.created_at).toLocaleTimeString()}</span>
        </div>
      </div>
      <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
        <Link to={`/admin/moderation/flagged?id=${alert.id}`}>
          <Eye className="h-3 w-3 mr-1" />
          Review
        </Link>
      </Button>
    </div>
  );
}

// Agent icon mapping
const agentIcons: Record<string, React.ElementType> = {
  summarizer: Sparkles,
  mood_tracker: Heart,
  moderation: Shield,
  engagement: Zap,
  wellness: Activity,
  knowledge_builder: Brain,
  focus: Eye,
};

// Agent display names
const agentNames: Record<string, string> = {
  summarizer: 'Summarizer',
  mood_tracker: 'Mood Tracker',
  moderation: 'Moderation',
  engagement: 'Engagement',
  wellness: 'Wellness',
  knowledge_builder: 'Knowledge Builder',
  focus: 'Focus',
};

export default function AdminOverview() {
  const { currentTheme, themes } = useTheme();
  const { selectedCommunity } = useCommunityDashboard();
  const { toast } = useToast();
  const [stats, setStats] = useState<CommunityOverviewStats | null>(null);
  const [alerts, setAlerts] = useState<ModerationAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const theme = themes[currentTheme];

  const fetchData = async (showToast = false) => {
    if (!selectedCommunity) {
      setLoading(false);
      return;
    }
    
    try {
      if (showToast) setRefreshing(true);
      
      const [statsData, alertsData] = await Promise.all([
        adminService.getOverviewStats(selectedCommunity.id),
        adminService.getRecentAlerts(selectedCommunity.id, 5)
      ]);
      
      setStats(statsData);
      setAlerts(alertsData);
      
      if (showToast) {
        toast({
          title: 'Dashboard Refreshed',
          description: 'All metrics have been updated.',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load dashboard data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Re-fetch when selected community changes
  useEffect(() => {
    setLoading(true);
    fetchData();
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => fetchData(), 30000);
    return () => clearInterval(interval);
  }, [selectedCommunity?.id]);

  const quickActions = [
    { label: 'Review Flagged Content', href: '/admin/moderation/flagged', icon: AlertTriangle },
    { label: 'View User Reports', href: '/admin/reports', icon: BarChart3 },
    { label: 'Manage Users', href: '/admin/users', icon: Users },
    { label: 'Community Health', href: '/admin/analytics/health', icon: Heart },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {selectedCommunity?.name || 'Community'} Dashboard
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Monitor your community's health and activity at a glance
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchData(true)}
          disabled={refreshing}
        >
          <RefreshCw className={cn('h-4 w-4 mr-2', refreshing && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Members"
          value={stats?.users.total || 0}
          subtitle={`${stats?.users.online || 0} online now`}
          icon={Users}
          iconColor="text-blue-500"
          loading={loading}
        />
        <StatCard
          title="Messages Today"
          value={stats?.messages.today || 0}
          trend={stats?.messages.trend_percent}
          subtitle="from yesterday"
          icon={MessageSquare}
          iconColor="text-green-500"
          loading={loading}
        />
        <StatCard
          title="Channels"
          value={stats?.channels.total || 0}
          subtitle="in this community"
          icon={Hash}
          iconColor="text-purple-500"
          loading={loading}
        />
        <StatCard
          title="Flagged Today"
          value={stats?.moderation.flagged_today || 0}
          subtitle={`${stats?.moderation.high_severity || 0} high severity`}
          icon={AlertTriangle}
          iconColor="text-orange-500"
          loading={loading}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Alerts */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">Recent Alerts</CardTitle>
              <CardDescription>Latest moderation flags requiring attention</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/admin/moderation/flagged">
                View All
                <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-start gap-3 p-3">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle2 className="h-12 w-12 text-green-500 mb-3" />
                <p className="font-medium">All Clear!</p>
                <p className="text-sm text-muted-foreground">No recent alerts requiring attention</p>
              </div>
            ) : (
              <ScrollArea className="h-[300px]">
                <div className="space-y-2">
                  {alerts.map(alert => (
                    <AlertItem key={alert.id} alert={alert} />
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quick Actions</CardTitle>
            <CardDescription>Common administrative tasks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {quickActions.map(action => (
              <Button
                key={action.href}
                variant="outline"
                className="w-full justify-start"
                asChild
              >
                <Link to={action.href}>
                  <action.icon className="h-4 w-4 mr-2" />
                  {action.label}
                </Link>
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* AI Agents Status */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Brain className="h-5 w-5 text-accent" />
              AI Agents Status
            </CardTitle>
            <CardDescription>
              Monitor the health and activity of all AI agents
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/admin/agents">
              Manage Agents
              <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {[...Array(7)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3 border rounded-lg">
                  <Skeleton className="h-9 w-9 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {stats?.agents && Object.entries(stats.agents).map(([key, agent]) => (
                <AgentStatusCard
                  key={key}
                  name={agentNames[key] || key}
                  status={agent.status}
                  activityCount={agent.activity_count}
                  lastActivity={agent.last_activity}
                  icon={agentIcons[key] || Brain}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activity Summary */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-green-500" />
              Active Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-500">
              {stats?.users.active_today.toLocaleString() || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Users active in the last 24 hours
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-500" />
              This Week
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-500">
              {stats?.messages.this_week.toLocaleString() || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Messages sent this week
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-500" />
              Blocked Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-500">
              {stats?.moderation.blocked_users || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Currently blocked across all communities
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
