/**
 * Community Health Analytics Page
 * Displays health metrics for the selected community with visual indicators.
 */

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useCommunityDashboard } from '@/contexts/CommunityDashboardContext';
import adminService from '@/services/adminService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Heart,
  RefreshCw,
  Users,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Activity
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface HealthData {
  health_score: number;
  activity_trend: 'up' | 'down' | 'stable';
  metrics: {
    engagement_rate: number;
    retention_rate: number;
    growth_rate: number;
  };
}

function HealthIndicator({ score }: { score: number }) {
  const getLevel = (score: number) => {
    if (score >= 70) return 'healthy';
    if (score >= 40) return 'moderate';
    return 'needs_attention';
  };
  
  const level = getLevel(score);
  const configs = {
    healthy: { color: 'text-green-500', bg: 'bg-green-500', icon: CheckCircle2, label: 'Healthy' },
    moderate: { color: 'text-yellow-500', bg: 'bg-yellow-500', icon: AlertCircle, label: 'Moderate' },
    needs_attention: { color: 'text-red-500', bg: 'bg-red-500', icon: XCircle, label: 'Needs Attention' },
  };
  
  const config = configs[level as keyof typeof configs];
  const Icon = config.icon;
  
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            <Icon className={cn('h-4 w-4', config.color)} />
            <span className={cn('text-sm font-medium', config.color)}>{config.label}</span>
          </div>
          <span className="text-sm font-mono">{score}%</span>
        </div>
        <Progress value={score} className="h-2" />
      </div>
    </div>
  );
}

function TrendIcon({ trend }: { trend: 'up' | 'down' | 'stable' }) {
  if (trend === 'up') return <TrendingUp className="h-4 w-4 text-green-500" />;
  if (trend === 'down') return <TrendingDown className="h-4 w-4 text-red-500" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

export default function CommunityHealthPage() {
  const { toast } = useToast();
  const { selectedCommunity } = useCommunityDashboard();
  
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState('7');

  const fetchHealth = async () => {
    if (!selectedCommunity) return;
    
    setLoading(true);
    try {
      const data = await adminService.getCommunityHealth(selectedCommunity.id, parseInt(days));
      setHealthData(data);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load community health data',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, [selectedCommunity?.id, days]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Heart className="h-6 w-6 text-red-500" />
            Community Health
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Monitor the health and activity of {selectedCommunity?.name || 'your community'}
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
          <Button variant="outline" size="sm" onClick={fetchHealth}>
            <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <div className="grid gap-4 sm:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
      ) : !healthData ? (
        <Card className="p-8 text-center">
          <Heart className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-medium">No Health Data</h3>
          <p className="text-sm text-muted-foreground">Unable to load health metrics for this community.</p>
        </Card>
      ) : (
        <>
          {/* Main Health Score Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Overall Health Score</CardTitle>
              <CardDescription>
                Based on engagement, retention, and growth metrics
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="text-6xl font-bold">{healthData.health_score}%</div>
                <div className="flex items-center gap-2">
                  <TrendIcon trend={healthData.activity_trend} />
                  <span className={cn(
                    'text-sm font-medium',
                    healthData.activity_trend === 'up' && 'text-green-500',
                    healthData.activity_trend === 'down' && 'text-red-500'
                  )}>
                    Activity {healthData.activity_trend === 'up' ? 'Increasing' : 
                             healthData.activity_trend === 'down' ? 'Decreasing' : 'Stable'}
                  </span>
                </div>
              </div>
              <HealthIndicator score={healthData.health_score} />
            </CardContent>
          </Card>

          {/* Metrics Grid */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Activity className="h-4 w-4 text-blue-500" />
                  Engagement Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{healthData.metrics.engagement_rate}%</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Active members / Total members
                </p>
                <Progress value={healthData.metrics.engagement_rate} className="h-1.5 mt-3" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Users className="h-4 w-4 text-green-500" />
                  Retention Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{healthData.metrics.retention_rate}%</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Members who stayed active
                </p>
                <Progress value={healthData.metrics.retention_rate} className="h-1.5 mt-3" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-purple-500" />
                  Growth Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={cn(
                  'text-3xl font-bold',
                  healthData.metrics.growth_rate > 0 && 'text-green-500',
                  healthData.metrics.growth_rate < 0 && 'text-red-500'
                )}>
                  {healthData.metrics.growth_rate > 0 ? '+' : ''}{healthData.metrics.growth_rate}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Activity change from last period
                </p>
                <Progress 
                  value={Math.min(100, Math.max(0, healthData.metrics.growth_rate + 50))} 
                  className="h-1.5 mt-3" 
                />
              </CardContent>
            </Card>
          </div>

          {/* Tips Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Health Tips</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {healthData.health_score < 70 && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium text-yellow-500">Increase Engagement</div>
                    <p className="text-sm text-muted-foreground">
                      Try hosting events, starting discussions, or creating channels for specific interests.
                    </p>
                  </div>
                </div>
              )}
              {healthData.metrics.engagement_rate < 50 && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <Users className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium text-blue-500">Activate Inactive Members</div>
                    <p className="text-sm text-muted-foreground">
                      Reach out to members who haven't been active. Consider sending welcome messages or highlights.
                    </p>
                  </div>
                </div>
              )}
              {healthData.health_score >= 70 && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                  <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium text-green-500">Community is Thriving!</div>
                    <p className="text-sm text-muted-foreground">
                      Great job! Your community health score is strong. Keep up the good work!
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
