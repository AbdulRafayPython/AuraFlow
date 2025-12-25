import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { useTheme } from '../../contexts/ThemeContext';
import { useAIAgents } from '../../contexts/AIAgentContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Target, Timer, CheckCircle, Activity, TrendingUp, Star } from 'lucide-react';

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

export const FocusAgent: React.FC = () => {
  const { isDarkMode } = useTheme();
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
  const [isLoading, setIsLoading] = useState(false);
  
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
      // Load metrics
      const metricsData = await getFocusMetrics();
      setMetrics(metricsData);

      // Load recommendations
      const recsData = await getFocusRecommendations();
      setRecommendations(recsData);

      // Simulate loading focus history and goals from local storage or API
      const storedHistory = localStorage.getItem('focusHistory');
      if (storedHistory) {
        setFocusHistory(JSON.parse(storedHistory));
      }

      const storedGoals = localStorage.getItem('focusGoals');
      if (storedGoals) {
        setGoals(JSON.parse(storedGoals));
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
    analyzeFocus(sessionHours);
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

  return (
    <div className="space-y-6">
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