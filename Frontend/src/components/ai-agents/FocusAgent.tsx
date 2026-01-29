import React, { useState, useEffect, ErrorInfo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { useTheme } from '../../contexts/ThemeContext';
import { useAIAgents } from '../../contexts/AIAgentContext';
import { useRealtime } from '../../hooks/useRealtime';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Target, Timer, CheckCircle, Activity, TrendingUp, Star, Brain, Hash, AlertCircle, Loader2 } from 'lucide-react';

// Error Boundary Component
class FocusAgentErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('FocusAgent Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-center">
          <AlertCircle className="w-16 h-16 mx-auto mb-4 text-red-500" />
          <h3 className="text-lg font-medium mb-2">Something went wrong</h3>
          <p className="text-sm text-gray-500 mb-4">
            {this.state.error?.message || 'An error occurred while loading Focus Agent'}
          </p>
          <Button onClick={() => this.setState({ hasError: false, error: null })}>
            Try Again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

interface FocusSession {
  id: string;
  goal: string;
  duration: number; // in minutes
  status: 'active' | 'completed' | 'interrupted';
  startTime: string;
  endTime?: string;
  actualDuration?: number;
}

interface FocusMetrics {
  totalSessions: number;
  totalFocusTime: number; // in minutes
  averageSessionLength: number;
  completionRate: number; // percentage
  weeklyStreak: number;
  monthlyHours: number;
}

interface FocusGoal {
  id: string;
  description: string;
  targetDuration: number; // in minutes
  deadline: string;
  category: 'study' | 'work' | 'personal' | 'fitness';
  status: 'active' | 'completed' | 'paused';
}

interface FocusRecommendation {
  type: 'technique' | 'schedule' | 'environment' | 'break';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
}

interface FocusAnalysis {
  focus_score: number;
  main_topics: Array<{ topic: string; count: number }>;
  focus_shifts: number | any[];  // Can be number or array depending on API response
  analysis_period_hours: number;
  total_messages: number;
  recommendations: string[];
}

const FocusAgentContent: React.FC = () => {
  const { isDarkMode } = useTheme();
  const { currentChannel } = useRealtime();
  const { 
    analyzeFocus,
    getFocusMetrics,
    getFocusRecommendations,
    setFocusGoal
  } = useAIAgents();
  
  const [activeSession, setActiveSession] = useState<FocusSession | null>(null);
  const [focusHistory, setFocusHistory] = useState<FocusSession[]>([]);
  const [metrics, setMetrics] = useState<FocusMetrics>({
    totalSessions: 0,
    totalFocusTime: 0,
    averageSessionLength: 0,
    completionRate: 0,
    weeklyStreak: 0,
    monthlyHours: 0
  });
  const [goals, setGoals] = useState<FocusGoal[]>([]);
  const [recommendations, setRecommendations] = useState<FocusRecommendation[]>([]);
  const [focusAnalysis, setFocusAnalysis] = useState<FocusAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [analysisTimePeriod, setAnalysisTimePeriod] = useState(24);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  
  // Session creation
  const [newSessionGoal, setNewSessionGoal] = useState('');
  const [newSessionDuration, setNewSessionDuration] = useState(25);
  const [sessionTimer, setSessionTimer] = useState(0);
  const [timerInterval, setTimerInterval] = useState<NodeJS.Timeout | null>(null);
  
  // Goal creation
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [newGoalDescription, setNewGoalDescription] = useState('');
  const [newGoalDuration, setNewGoalDuration] = useState(60);
  const [newGoalCategory, setNewGoalCategory] = useState<'study' | 'work' | 'personal' | 'fitness'>('study');
  const [newGoalDeadline, setNewGoalDeadline] = useState('');

  useEffect(() => {
    loadFocusData();
  }, []);

  const loadFocusData = async () => {
    setIsLoading(true);
    try {
      // Load metrics (optional, may not be available yet)
      try {
        const metricsData = await getFocusMetrics();
        if (metricsData) {
          setMetrics(prev => ({ ...prev, ...metricsData }));
        }
      } catch (error) {
        console.log('Focus metrics not available yet');
      }

      // Load recommendations (optional)
      try {
        const recsData = await getFocusRecommendations();
        if (recsData && Array.isArray(recsData) && recsData.length > 0) {
          setRecommendations(recsData);
        }
      } catch (error) {
        console.log('Focus recommendations not available yet');
      }

      // Load focus analysis for current channel - only if we have a channel
      if (currentChannel?.id) {
        try {
          const analysisData = await analyzeFocus(analysisTimePeriod, currentChannel.id);
          if (analysisData && analysisData.success && analysisData.analysis) {
            setFocusAnalysis(analysisData.analysis);
          }
        } catch (error) {
          console.log('Focus analysis not available yet');
        }
      }

      // Load focus history and goals from local storage
      try {
        const storedHistory = localStorage.getItem('focusHistory');
        if (storedHistory) {
          setFocusHistory(JSON.parse(storedHistory));
        }

        const storedGoals = localStorage.getItem('focusGoals');
        if (storedGoals) {
          setGoals(JSON.parse(storedGoals));
        }
      } catch (error) {
        console.log('Could not load stored data');
      }
    } catch (error) {
      console.error('Failed to load focus data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const startFocusSession = () => {
    if (!newSessionGoal.trim()) return;

    const newSession: FocusSession = {
      id: Date.now().toString(),
      goal: newSessionGoal,
      duration: newSessionDuration,
      status: 'active',
      startTime: new Date().toISOString(),
    };

    setActiveSession(newSession);
    setSessionTimer(0);
    
    // Start timer
    const interval = setInterval(() => {
      setSessionTimer(prev => prev + 1);
    }, 1000);
    
    setTimerInterval(interval);
    setNewSessionGoal('');
  };

  const completeSession = (interrupted = false) => {
    if (!activeSession || !timerInterval) return;

    clearInterval(timerInterval);
    setTimerInterval(null);

    const completedSession: FocusSession = {
      ...activeSession,
      status: interrupted ? 'interrupted' : 'completed',
      endTime: new Date().toISOString(),
      actualDuration: Math.floor(sessionTimer / 60)
    };

    const updatedHistory = [completedSession, ...focusHistory];
    setFocusHistory(updatedHistory);
    localStorage.setItem('focusHistory', JSON.stringify(updatedHistory));

    setActiveSession(null);
    setSessionTimer(0);

    // Analyze the completed session - using hours from session duration
    const sessionHours = Math.max(1, Math.floor(sessionTimer / 3600));
    analyzeFocus(sessionHours, currentChannel?.id);
  };

  const handleAnalyzeFocus = async () => {
    if (!currentChannel?.id) return;
    
    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      const analysisData = await analyzeFocus(analysisTimePeriod, currentChannel.id);
      if (analysisData && analysisData.success && analysisData.analysis) {
        setFocusAnalysis(analysisData.analysis);
        setAnalysisError(null);
      } else if (analysisData && !analysisData.success) {
        setAnalysisError(analysisData.error || 'Analysis failed');
        setFocusAnalysis(null);
      }
    } catch (error: any) {
      console.error('Failed to analyze focus:', error);
      setAnalysisError(error.message || 'Failed to analyze focus');
      setFocusAnalysis(null);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const createFocusGoal = async () => {
    if (!newGoalDescription.trim() || !newGoalDeadline) return;

    const newGoal: FocusGoal = {
      id: Date.now().toString(),
      description: newGoalDescription,
      targetDuration: newGoalDuration,
      deadline: newGoalDeadline,
      category: newGoalCategory,
      status: 'active'
    };

    try {
      await setFocusGoal(newGoal.description);
      
      const updatedGoals = [newGoal, ...goals];
      setGoals(updatedGoals);
      localStorage.setItem('focusGoals', JSON.stringify(updatedGoals));

      setShowGoalForm(false);
      setNewGoalDescription('');
      setNewGoalDuration(60);
      setNewGoalDeadline('');
    } catch (error) {
      console.error('Failed to create focus goal:', error);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMins = minutes % 60;
    return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`;
  };

  const getProgressPercentage = () => {
    if (!activeSession) return 0;
    return Math.min((sessionTimer / (activeSession.duration * 60)) * 100, 100);
  };

  const isSessionCompleted = () => {
    if (!activeSession) return false;
    return sessionTimer >= activeSession.duration * 60;
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 bg-[hsl(var(--theme-bg-primary))]">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[hsl(var(--theme-bg-secondary))] flex items-center justify-center border border-[hsl(var(--theme-border-default))]">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
          <p className="text-sm text-[hsl(var(--theme-text-muted))]">Loading Focus Agent...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-5 bg-[hsl(var(--theme-bg-primary))] overflow-y-auto h-full" style={{ scrollbarWidth: 'thin', scrollbarColor: 'hsl(var(--theme-bg-tertiary)) transparent' }}>
      {/* Header Section */}
      <div className="relative overflow-hidden rounded-xl bg-[hsl(var(--theme-bg-secondary))] border border-[hsl(var(--theme-border-default))] p-5">
        {/* Gradient accent line at top */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-cyan-500 to-emerald-500" />
        
        <div className="flex items-center gap-4 mb-4">
          <div className="relative">
            <div className="absolute inset-0 bg-blue-500 rounded-xl blur-lg opacity-40"></div>
            <div className="relative p-3 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl shadow-lg border border-blue-400/30">
              <Target className="w-6 h-6 text-white" />
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-[hsl(var(--theme-text-primary))] flex items-center gap-2">
              Focus Agent
              <Brain className="w-4 h-4 text-cyan-400" />
            </h3>
            <p className="text-sm text-[hsl(var(--theme-text-muted))]">
              Track concentration, set goals, and boost productivity
            </p>
          </div>
        </div>
      </div>

      {/* Focus Analysis Section */}
      {currentChannel && (
        <Card className="bg-[hsl(var(--theme-bg-secondary))] border-[hsl(var(--theme-border-default))]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[hsl(var(--theme-text-primary))]">
              <Brain className="h-5 w-5 text-blue-400" />
              Focus Analysis - {currentChannel.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block text-[hsl(var(--theme-text-secondary))]">
                  Analysis Period (hours)
                </label>
                <Select 
                  value={analysisTimePeriod.toString()} 
                  onValueChange={(value) => setAnalysisTimePeriod(parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6">Last 6 hours</SelectItem>
                    <SelectItem value="12">Last 12 hours</SelectItem>
                    <SelectItem value="24">Last 24 hours</SelectItem>
                    <SelectItem value="48">Last 2 days</SelectItem>
                    <SelectItem value="168">Last week</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button 
                onClick={handleAnalyzeFocus}
                disabled={isAnalyzing}
              >
                {isAnalyzing ? 'Analyzing...' : 'Analyze Focus'}
              </Button>
            </div>

            {/* Error Display */}
            {analysisError && (
              <div className="p-4 border border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
                  <Activity className="h-4 w-4" />
                  <span className="text-sm font-medium">Analysis Notice</span>
                </div>
                <p className="text-sm text-yellow-600 dark:text-yellow-300 mt-1">{analysisError}</p>
                <p className="text-xs text-yellow-500 dark:text-yellow-400 mt-2">
                  Tip: Try selecting a longer time period or send more messages to the channel.
                </p>
              </div>
            )}

            {focusAnalysis && (
              <div className="space-y-4 mt-4">
                {/* Focus Score */}
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Focus Score</span>
                    <Badge variant={focusAnalysis.focus_score >= 70 ? 'default' : focusAnalysis.focus_score >= 40 ? 'secondary' : 'destructive'}>
                      {focusAnalysis.focus_score}/100
                    </Badge>
                  </div>
                  <Progress value={focusAnalysis.focus_score} className="mb-2" />
                  <div className="text-xs text-muted-foreground">
                    Based on {focusAnalysis.total_messages} messages over {focusAnalysis.analysis_period_hours} hours
                  </div>
                </div>

                {/* Main Topics */}
                {focusAnalysis.main_topics && focusAnalysis.main_topics.length > 0 && (
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Hash className="h-4 w-4" />
                      <span className="text-sm font-medium">Main Discussion Topics</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {focusAnalysis.main_topics.map((topic, index) => (
                        <Badge key={index} variant="outline">
                          {topic.topic} ({topic.count})
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Focus Shifts */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="border rounded-lg p-4">
                    <div className="text-sm text-muted-foreground mb-1">Topic Shifts</div>
                    <div className="text-2xl font-bold">
                      {typeof focusAnalysis.focus_shifts === 'number' 
                        ? focusAnalysis.focus_shifts 
                        : Array.isArray(focusAnalysis.focus_shifts) 
                          ? (focusAnalysis.focus_shifts as any[]).length 
                          : 0}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {(() => {
                        const shifts = typeof focusAnalysis.focus_shifts === 'number' 
                          ? focusAnalysis.focus_shifts 
                          : Array.isArray(focusAnalysis.focus_shifts) 
                            ? (focusAnalysis.focus_shifts as any[]).length 
                            : 0;
                        return shifts < 5 
                          ? 'Highly focused' 
                          : shifts < 10 
                            ? 'Moderately focused' 
                            : 'Scattered focus';
                      })()}
                    </div>
                  </div>
                  <div className="border rounded-lg p-4">
                    <div className="text-sm text-muted-foreground mb-1">Messages</div>
                    <div className="text-2xl font-bold">{focusAnalysis.total_messages}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {(focusAnalysis.total_messages / focusAnalysis.analysis_period_hours).toFixed(1)} per hour
                    </div>
                  </div>
                </div>

                {/* Recommendations */}
                {focusAnalysis.recommendations && focusAnalysis.recommendations.length > 0 && (
                  <div className="border rounded-lg p-4">
                    <div className="text-sm font-medium mb-3">AI Recommendations</div>
                    <ul className="space-y-2">
                      {focusAnalysis.recommendations.map((rec, index) => (
                        <li key={index} className="text-sm flex items-start gap-2">
                          <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Active Session */}
      {activeSession ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Timer className="h-5 w-5" />
              Focus Session Active
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center">
              <h3 className="text-lg font-medium mb-2">{activeSession.goal}</h3>
              <div className="text-3xl font-mono font-bold mb-2">
                {formatTime(sessionTimer)}
              </div>
              <div className="text-sm text-muted-foreground mb-4">
                Target: {formatDuration(activeSession.duration)}
              </div>
              <Progress value={getProgressPercentage()} className="mb-4" />
              {isSessionCompleted() && (
                <Badge variant="default" className="mb-2">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Goal Reached!
                </Badge>
              )}
            </div>
            <div className="flex gap-2 justify-center">
              <Button 
                onClick={() => completeSession(false)}
                variant="default"
              >
                Complete Session
              </Button>
              <Button 
                onClick={() => completeSession(true)}
                variant="outline"
              >
                Stop Early
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* New Session Form */
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Start Focus Session
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                What are you focusing on?
              </label>
              <Input
                placeholder="e.g., Study for exam, Work on project..."
                value={newSessionGoal}
                onChange={(e) => setNewSessionGoal(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">
                Duration (minutes)
              </label>
              <Select 
                value={newSessionDuration.toString()} 
                onValueChange={(value) => setNewSessionDuration(parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="25">25 minutes (Pomodoro)</SelectItem>
                  <SelectItem value="45">45 minutes</SelectItem>
                  <SelectItem value="60">1 hour</SelectItem>
                  <SelectItem value="90">1.5 hours</SelectItem>
                  <SelectItem value="120">2 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button 
              onClick={startFocusSession}
              disabled={!newSessionGoal.trim()}
              className="w-full"
            >
              Start Focus Session
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Metrics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-500" />
              <div className="text-sm text-muted-foreground">Total Sessions</div>
            </div>
            <div className="text-2xl font-bold">{metrics.totalSessions}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-green-500" />
              <div className="text-sm text-muted-foreground">Focus Time</div>
            </div>
            <div className="text-2xl font-bold">{formatDuration(metrics.totalFocusTime)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-purple-500" />
              <div className="text-sm text-muted-foreground">Completion Rate</div>
            </div>
            <div className="text-2xl font-bold">{metrics.completionRate}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Focus Goals */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Focus Goals
            </CardTitle>
            <Button 
              onClick={() => setShowGoalForm(!showGoalForm)}
              variant="outline"
              size="sm"
            >
              Add Goal
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {showGoalForm && (
            <div className="border rounded-lg p-4 space-y-3">
              <Input
                placeholder="Goal description"
                value={newGoalDescription}
                onChange={(e) => setNewGoalDescription(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  placeholder="Duration (minutes)"
                  value={newGoalDuration}
                  onChange={(e) => setNewGoalDuration(parseInt(e.target.value) || 60)}
                />
                <Select value={newGoalCategory} onValueChange={(value: any) => setNewGoalCategory(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="study">Study</SelectItem>
                    <SelectItem value="work">Work</SelectItem>
                    <SelectItem value="personal">Personal</SelectItem>
                    <SelectItem value="fitness">Fitness</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Input
                type="date"
                value={newGoalDeadline}
                onChange={(e) => setNewGoalDeadline(e.target.value)}
              />
              <div className="flex gap-2">
                <Button onClick={createFocusGoal} size="sm">
                  Create Goal
                </Button>
                <Button 
                  onClick={() => setShowGoalForm(false)} 
                  variant="outline" 
                  size="sm"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
          
          {goals.length === 0 ? (
            <div className="text-center text-muted-foreground py-4">
              No focus goals set. Create one to get started!
            </div>
          ) : (
            <div className="space-y-3">
              {goals.slice(0, 3).map((goal) => (
                <div key={goal.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <div className="font-medium">{goal.description}</div>
                    <div className="text-sm text-muted-foreground">
                      Target: {formatDuration(goal.targetDuration)} • Due: {new Date(goal.deadline).toLocaleDateString()}
                    </div>
                  </div>
                  <Badge variant={goal.status === 'completed' ? 'default' : 'secondary'}>
                    {goal.category}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="h-5 w-5" />
              Focus Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recommendations.slice(0, 3).map((rec, index) => (
              <div key={index} className="border rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant={rec.priority === 'high' ? 'destructive' : rec.priority === 'medium' ? 'default' : 'secondary'}>
                    {rec.priority}
                  </Badge>
                  <span className="font-medium">{rec.title}</span>
                </div>
                <p className="text-sm text-muted-foreground">{rec.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recent Sessions */}
      {focusHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {focusHistory.slice(0, 5).map((session) => (
                <div key={session.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <div className="font-medium">{session.goal}</div>
                    <div className="text-sm text-muted-foreground">
                      {new Date(session.startTime).toLocaleDateString()} • 
                      {session.actualDuration ? formatDuration(session.actualDuration) : formatDuration(session.duration)}
                    </div>
                  </div>
                  <Badge variant={session.status === 'completed' ? 'default' : session.status === 'interrupted' ? 'destructive' : 'secondary'}>
                    {session.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// Wrapped export with error boundary
export const FocusAgent: React.FC = () => {
  return (
    <FocusAgentErrorBoundary>
      <FocusAgentContent />
    </FocusAgentErrorBoundary>
  );
};