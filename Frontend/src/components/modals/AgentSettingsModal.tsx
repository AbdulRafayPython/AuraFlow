import React, { useState, useEffect, useCallback } from 'react';
import {
  X, RotateCcw, Check, Loader2, Shield, TrendingUp, BookOpen,
  Brain, Heart, Focus, Sliders, Bell, Eye, Save, Zap, CalendarClock, Trash2, Plus
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useNotifications } from '@/hooks/useNotifications';
import { aiAgentService } from '@/services/aiAgentService';
import { channelService } from '@/services/channelService';

interface AgentSettingsModalProps {
  open: boolean;
  onClose: () => void;
  agentType: string;
  communityId?: number;
  onSuccess?: () => void;
}

// ─── Settings Schema ─────────────────────────────────────────────────
type SettingDef = {
  key: string;
  label: string;
  description?: string;
  type: 'toggle' | 'slider' | 'select' | 'time';
  options?: string[];
  min?: number;
  max?: number;
  default: any;
  section: string;
};

const SETTINGS_SCHEMA: Record<string, SettingDef[]> = {
  moderation: [
    { key: 'auto_filter', label: 'Auto-filter harmful content', description: 'Automatically detect and handle toxic messages', type: 'toggle', default: true, section: '⚡ Action Settings' },
    { key: 'sensitivity', label: 'Detection sensitivity', description: 'Higher = more strict filtering', type: 'slider', min: 1, max: 10, default: 7, section: '📊 Sensitivity' },
    { key: 'severity_threshold', label: 'Action threshold', description: 'Minimum severity to trigger automatic action', type: 'select', options: ['low', 'medium', 'high', 'critical'], default: 'medium', section: '⚡ Action Settings' },
    { key: 'notify_admins', label: 'Notify admins on violations', type: 'toggle', default: true, section: '🔔 Notifications' },
    { key: 'roman_urdu_support', label: 'Roman Urdu support', description: 'Detect profanity in Roman Urdu', type: 'toggle', default: true, section: '🌍 Language' },
    { key: 'max_warnings', label: 'Max warnings before block', type: 'slider', min: 1, max: 10, default: 3, section: '⚡ Action Settings' },
  ],
  engagement: [
    { key: 'auto_analyze', label: 'Auto-analyze periodically', type: 'toggle', default: true, section: '📊 Analysis' },
    { key: 'analysis_interval', label: 'Analysis interval (min)', type: 'slider', min: 10, max: 120, default: 30, section: '📊 Analysis' },
    { key: 'track_threads', label: 'Track conversation threads', type: 'toggle', default: true, section: '📊 Analysis' },
    { key: 'leaderboard', label: 'Enable contributor leaderboard', type: 'toggle', default: true, section: '🎯 Features' },
    { key: 'inactivity_alerts', label: 'Inactivity alerts', type: 'toggle', default: false, section: '🔔 Notifications' },
  ],
  knowledge_builder: [
    { key: 'auto_extract', label: 'Auto-extract knowledge', type: 'toggle', default: true, section: '📊 Extraction' },
    { key: 'extraction_interval_hours', label: 'Extraction interval (hours)', type: 'slider', min: 1, max: 12, default: 2, section: '📊 Extraction' },
    { key: 'min_quality_score', label: 'Minimum quality score', type: 'slider', min: 1, max: 10, default: 5, section: '📊 Extraction' },
    { key: 'auto_categorize', label: 'Auto-categorize entries', type: 'toggle', default: true, section: '🎯 Features' },
  ],
  knowledge: [
    { key: 'auto_extract', label: 'Auto-extract knowledge', type: 'toggle', default: true, section: '📊 Extraction' },
    { key: 'extraction_interval_hours', label: 'Extraction interval (hours)', type: 'slider', min: 1, max: 12, default: 2, section: '📊 Extraction' },
    { key: 'min_quality_score', label: 'Minimum quality score', type: 'slider', min: 1, max: 10, default: 5, section: '📊 Extraction' },
    { key: 'auto_categorize', label: 'Auto-categorize entries', type: 'toggle', default: true, section: '🎯 Features' },
  ],
  summarizer: [
    { key: 'auto_summarize_enabled', label: 'Enable auto-summarize', description: 'Automatically summarize all channels daily and post as bot message', type: 'toggle', default: false, section: '⏰ Auto-Summarize Scheduler' },
    { key: 'schedule_time', label: 'Schedule time (local)', description: 'Daily time to auto-summarize all channels', type: 'time', default: '21:00', section: '⏰ Auto-Summarize Scheduler' },
    { key: 'auto_summarize_message_count', label: 'Messages to analyze', description: 'Number of recent messages to include per channel', type: 'slider', min: 50, max: 200, default: 200, section: '⏰ Auto-Summarize Scheduler' },
    { key: 'summary_length', label: 'Summary length', type: 'select', options: ['brief', 'standard', 'detailed'], default: 'standard', section: '🎯 Style' },
    { key: 'include_topics', label: 'Include key topics', type: 'toggle', default: true, section: '🎯 Style' },
    { key: 'include_action_items', label: 'Include action items', type: 'toggle', default: true, section: '🎯 Style' },
  ],
  mood_tracker: [
    { key: 'track_per_message', label: 'Track mood per message', type: 'toggle', default: true, section: '📊 Tracking' },
    { key: 'alert_negative_trend', label: 'Alert on negative trends', type: 'toggle', default: true, section: '🔔 Notifications' },
    { key: 'sensitivity', label: 'Detection sensitivity', type: 'slider', min: 1, max: 10, default: 7, section: '📊 Tracking' },
    { key: 'language', label: 'Primary language', type: 'select', options: ['english', 'roman_urdu', 'auto'], default: 'auto', section: '🌍 Language' },
  ],
  mood: [
    { key: 'track_per_message', label: 'Track mood per message', type: 'toggle', default: true, section: '📊 Tracking' },
    { key: 'alert_negative_trend', label: 'Alert on negative trends', type: 'toggle', default: true, section: '🔔 Notifications' },
    { key: 'sensitivity', label: 'Detection sensitivity', type: 'slider', min: 1, max: 10, default: 7, section: '📊 Tracking' },
    { key: 'language', label: 'Primary language', type: 'select', options: ['english', 'roman_urdu', 'auto'], default: 'auto', section: '🌍 Language' },
  ],
  wellness: [
    { key: 'auto_check', label: 'Periodic wellness checks', type: 'toggle', default: true, section: '📊 Monitoring' },
    { key: 'break_reminders', label: 'Break reminders', type: 'toggle', default: true, section: '🔔 Notifications' },
    { key: 'check_interval_hours', label: 'Check interval (hours)', type: 'slider', min: 1, max: 8, default: 1, section: '📊 Monitoring' },
    { key: 'burnout_detection', label: 'Burnout risk detection', type: 'toggle', default: true, section: '🎯 Features' },
  ],
  focus: [
    { key: 'auto_analyze', label: 'Auto-analyze activity', type: 'toggle', default: true, section: '📊 Tracking' },
    { key: 'session_reminders', label: 'Session reminders', type: 'toggle', default: true, section: '🔔 Notifications' },
    { key: 'analyze_threshold', label: 'Messages before analysis', type: 'slider', min: 20, max: 100, default: 50, section: '📊 Tracking' },
    { key: 'daily_reports', label: 'Daily focus reports', type: 'toggle', default: true, section: '🎯 Features' },
  ],
};

const AGENT_DISPLAY: Record<string, { name: string; emoji: string; gradient: string }> = {
  moderation: { name: 'Moderation Agent', emoji: '🛡️', gradient: 'from-red-500 to-rose-500' },
  engagement: { name: 'Engagement Agent', emoji: '🎯', gradient: 'from-emerald-500 to-green-500' },
  knowledge_builder: { name: 'Knowledge Builder', emoji: '📚', gradient: 'from-indigo-500 to-purple-500' },
  knowledge: { name: 'Knowledge Builder', emoji: '📚', gradient: 'from-indigo-500 to-purple-500' },
  summarizer: { name: 'Summarizer Agent', emoji: '📝', gradient: 'from-blue-500 to-cyan-500' },
  mood_tracker: { name: 'Mood Tracker', emoji: '😊', gradient: 'from-pink-500 to-rose-500' },
  mood: { name: 'Mood Tracker', emoji: '😊', gradient: 'from-pink-500 to-rose-500' },
  wellness: { name: 'Wellness Agent', emoji: '🧘', gradient: 'from-purple-500 to-pink-500' },
  focus: { name: 'Focus Agent', emoji: '🎯', gradient: 'from-orange-500 to-red-500' },
};

export const AgentSettingsModal: React.FC<AgentSettingsModalProps> = ({
  open,
  onClose,
  agentType,
  communityId,
  onSuccess,
}) => {
  const { currentTheme } = useTheme();
  const { showSuccess, showError } = useNotifications();
  const isBasicTheme = currentTheme === 'basic';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [defaultSettings, setDefaultSettings] = useState<Record<string, any>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [isTriggering, setIsTriggering] = useState(false);

  const schema = SETTINGS_SCHEMA[agentType] || [];
  const display = AGENT_DISPLAY[agentType] || AGENT_DISPLAY.summarizer;

  // ─── Personal Schedule State ─────────────────────────
  const [schedules, setSchedules] = useState<any[]>([]);
  const [channelOptions, setChannelOptions] = useState<any[]>([]);
  const [communityOptions, setCommunityOptions] = useState<any[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [showAddSchedule, setShowAddSchedule] = useState(false);
  const [selectedCommunity, setSelectedCommunity] = useState<number | null>(communityId || null);
  const [newScheduleChannel, setNewScheduleChannel] = useState<number | null>(null);
  const [newScheduleTime, setNewScheduleTime] = useState('21:00');
  const [savingSchedule, setSavingSchedule] = useState(false);

  // Group settings by section
  const sections = schema.reduce<Record<string, SettingDef[]>>((acc, s) => {
    if (!acc[s.section]) acc[s.section] = [];
    acc[s.section].push(s);
    return acc;
  }, {});

  useEffect(() => {
    if (!open || !agentType) return;

    setLoading(true);
    setHasChanges(false);

    // Load defaults from schema
    const defaults: Record<string, any> = {};
    schema.forEach((s) => { defaults[s.key] = s.default; });

    // Then try to load current saved settings from API
    const loadSettings = async () => {
      try {
        if (communityId) {
          const agents = await aiAgentService.getCommunityAgentStatus(communityId);
          const found = agents.find((a) => a.agent_type === agentType);
          if (found?.settings) {
            setSettings({ ...defaults, ...found.settings });
          } else {
            setSettings(defaults);
          }
        } else {
          const agents = await aiAgentService.getPersonalAgentStatus();
          const found = agents.find((a) => a.agent_type === agentType);
          if (found?.settings) {
            setSettings({ ...defaults, ...found.settings });
          } else {
            setSettings(defaults);
          }
        }
      } catch {
        setSettings(defaults);
      } finally {
        setDefaultSettings(defaults);
        setLoading(false);
      }
    };

    loadSettings();
  }, [open, agentType, communityId]);

  // Load personal schedules + communities + channels for summarizer
  useEffect(() => {
    if (!open || agentType !== 'summarizer') return;
    const loadSchedules = async () => {
      setSchedulesLoading(true);
      try {
        const [scheds, communities] = await Promise.all([
          aiAgentService.getSummarySchedules(),
          channelService.getCommunities(),
        ]);
        setSchedules(scheds);
        setCommunityOptions(communities);
        // If communityId provided, pre-load its channels
        const cid = communityId || null;
        if (cid) {
          setSelectedCommunity(cid);
          const channels = await channelService.getCommunityChannels(cid);
          setChannelOptions(channels);
        }
      } catch {
        // Silently fail — schedules section will show empty state
      } finally {
        setSchedulesLoading(false);
      }
    };
    loadSchedules();
  }, [open, agentType, communityId]);

  // Load channels when community changes
  useEffect(() => {
    if (!selectedCommunity) { setChannelOptions([]); return; }
    let cancelled = false;
    channelService.getCommunityChannels(selectedCommunity).then(ch => {
      if (!cancelled) setChannelOptions(ch);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [selectedCommunity]);

  const handleChange = useCallback((key: string, value: any) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  }, []);

  const handleReset = useCallback(() => {
    setSettings({ ...defaultSettings });
    setHasChanges(true);
  }, [defaultSettings]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      if (communityId) {
        await aiAgentService.configureCommunityAgent(communityId, agentType, settings);
      } else {
        await aiAgentService.configurePersonalAgent(agentType, settings);
      }
      showSuccess({ title: 'Settings saved successfully!' });
      setHasChanges(false);
      onSuccess?.();
      setTimeout(() => onClose(), 400);
    } catch (error: any) {
      showError({ title: error.message || 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  }, [communityId, agentType, settings, onSuccess, onClose, showSuccess, showError]);

  const handleTriggerNow = useCallback(async () => {
    const cid = communityId || selectedCommunity;
    if (!cid) {
      showError({ title: 'Please select a community first' });
      return;
    }
    setIsTriggering(true);
    try {
      const result = await aiAgentService.triggerAutoSummarize(cid);
      showSuccess({ title: `Auto-summarize complete! ${result.channels_processed} channels processed.` });
    } catch (error: any) {
      showError({ title: error.message || 'Failed to trigger auto-summarize' });
    } finally {
      setIsTriggering(false);
    }
  }, [communityId, selectedCommunity, showSuccess, showError]);

  const handleAddSchedule = useCallback(async () => {
    const cid = selectedCommunity || communityId;
    if (!newScheduleChannel || !cid) return;
    setSavingSchedule(true);
    try {
      await aiAgentService.createSummarySchedule({
        channel_id: newScheduleChannel,
        community_id: cid,
        schedule_time: newScheduleTime,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      const scheds = await aiAgentService.getSummarySchedules();
      setSchedules(scheds);
      setShowAddSchedule(false);
      setNewScheduleChannel(null);
      setNewScheduleTime('21:00');
      showSuccess({ title: 'Schedule created!' });
    } catch (error: any) {
      showError({ title: error.message || 'Failed to create schedule' });
    } finally {
      setSavingSchedule(false);
    }
  }, [newScheduleChannel, newScheduleTime, selectedCommunity, communityId, showSuccess, showError]);

  const handleToggleSchedule = useCallback(async (scheduleId: number, isActive: boolean) => {
    try {
      await aiAgentService.updateSummarySchedule(scheduleId, { is_active: !isActive });
      setSchedules(prev => prev.map(s => s.id === scheduleId ? { ...s, is_active: !isActive } : s));
    } catch (error: any) {
      showError({ title: error.message || 'Failed to update schedule' });
    }
  }, [showError]);

  const handleDeleteSchedule = useCallback(async (scheduleId: number) => {
    try {
      await aiAgentService.deleteSummarySchedule(scheduleId);
      setSchedules(prev => prev.filter(s => s.id !== scheduleId));
      showSuccess({ title: 'Schedule removed' });
    } catch (error: any) {
      showError({ title: error.message || 'Failed to delete schedule' });
    }
  }, [showSuccess, showError]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" />

      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-w-[560px] max-h-[80vh] overflow-hidden flex flex-col
          ${isBasicTheme ? 'rounded-lg' : 'rounded-2xl'}
          bg-[hsl(var(--theme-bg-elevated))] border border-[hsl(var(--theme-border-default)/0.5)]
          shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-4 duration-300`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[hsl(var(--theme-border-default)/0.3)] flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xl">{display.emoji}</span>
            <div>
              <h2 className="text-base font-bold text-[hsl(var(--theme-text-primary))]">
                Configure {display.name}
              </h2>
              <p className="text-xs text-[hsl(var(--theme-text-muted))]">
                {communityId ? 'Community settings' : 'Personal settings'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-muted))] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-[hsl(var(--theme-accent-primary))]" />
            </div>
          ) : (
            <div className="space-y-5">
              {Object.entries(sections).map(([sectionName, sectionSettings]) => (
                <div key={sectionName}>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--theme-text-muted))] mb-3">
                    {sectionName}
                  </h3>
                  <div className={`space-y-1 ${isBasicTheme ? 'rounded-lg' : 'rounded-xl'} border border-[hsl(var(--theme-border-default)/0.3)] overflow-hidden`}>
                    {sectionSettings.map((setting, idx) => (
                      <div
                        key={setting.key}
                        className={`flex items-center justify-between p-3.5
                          bg-[hsl(var(--theme-bg-secondary)/0.3)]
                          ${idx < sectionSettings.length - 1 ? 'border-b border-[hsl(var(--theme-border-default)/0.15)]' : ''}`}
                      >
                        <div className="flex-1 min-w-0 mr-4">
                          <label className="text-sm font-medium text-[hsl(var(--theme-text-primary))]">
                            {setting.label}
                          </label>
                          {setting.description && (
                            <p className="text-[11px] text-[hsl(var(--theme-text-muted))] mt-0.5">{setting.description}</p>
                          )}
                        </div>

                        {/* Toggle */}
                        {setting.type === 'toggle' && (
                          <button
                            onClick={() => handleChange(setting.key, !settings[setting.key])}
                            className={`relative w-10 h-[22px] rounded-full transition-colors flex-shrink-0
                              ${settings[setting.key] ? 'bg-emerald-500' : 'bg-[hsl(var(--theme-bg-tertiary))]'}`}
                          >
                            <div
                              className={`absolute top-[2px] left-[2px] w-[18px] h-[18px] rounded-full bg-white transition-transform shadow-sm
                                ${settings[setting.key] ? 'translate-x-[18px]' : 'translate-x-0'}`}
                            />
                          </button>
                        )}

                        {/* Slider */}
                        {setting.type === 'slider' && (
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <input
                              type="range"
                              min={setting.min}
                              max={setting.max}
                              value={settings[setting.key] ?? setting.default}
                              onChange={(e) => handleChange(setting.key, parseInt(e.target.value))}
                              className="w-24 h-1.5 rounded-full appearance-none cursor-pointer
                                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[hsl(var(--theme-accent-primary))]
                                [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer
                                bg-gradient-to-r from-[hsl(var(--theme-bg-tertiary))] to-[hsl(var(--theme-accent-primary)/0.5)]"
                            />
                            <span className="text-xs font-mono font-medium text-[hsl(var(--theme-text-primary))] min-w-[28px] text-right">
                              {settings[setting.key] ?? setting.default}
                            </span>
                          </div>
                        )}

                        {/* Time */}
                        {setting.type === 'time' && (
                          <input
                            type="time"
                            value={settings[setting.key] ?? setting.default}
                            onChange={(e) => handleChange(setting.key, e.target.value)}
                            className={`px-3 py-1.5 text-xs ${isBasicTheme ? 'rounded-md' : 'rounded-lg'}
                              bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-primary))]
                              border border-[hsl(var(--theme-border-default))]
                              focus:outline-none focus:ring-2 focus:ring-[hsl(var(--theme-accent-primary)/0.5)]
                              cursor-pointer flex-shrink-0`}
                          />
                        )}

                        {/* Select */}
                        {setting.type === 'select' && (
                          <select
                            value={settings[setting.key] ?? setting.default}
                            onChange={(e) => handleChange(setting.key, e.target.value)}
                            className={`px-3 py-1.5 text-xs ${isBasicTheme ? 'rounded-md' : 'rounded-lg'}
                              bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-primary))]
                              border border-[hsl(var(--theme-border-default))]
                              focus:outline-none focus:ring-2 focus:ring-[hsl(var(--theme-accent-primary)/0.5)]
                              cursor-pointer flex-shrink-0`}
                          >
                            {setting.options?.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt.charAt(0).toUpperCase() + opt.slice(1).replace(/_/g, ' ')}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* ─── Personal Summary Schedules (summarizer only) ─── */}
              {agentType === 'summarizer' && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--theme-text-muted))] mb-1.5">
                    📅 Personal Summary Schedules
                  </h3>
                  <p className="text-[11px] text-[hsl(var(--theme-text-muted))] mb-3">
                    Get automatic summaries delivered privately at your preferred time.
                  </p>

                  <div className={`${isBasicTheme ? 'rounded-lg' : 'rounded-xl'} border border-[hsl(var(--theme-border-default)/0.3)] overflow-hidden`}>
                    {schedulesLoading ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="w-4 h-4 animate-spin text-[hsl(var(--theme-accent-primary))]" />
                      </div>
                    ) : (
                      <>
                        {schedules.length === 0 && !showAddSchedule && (
                          <div className="p-4 text-center text-[12px] text-[hsl(var(--theme-text-muted))]">
                            No personal schedules yet. Add one to receive daily summaries at your preferred time.
                          </div>
                        )}

                        {schedules.map((sched) => (
                          <div
                            key={sched.id}
                            className="flex items-center justify-between p-3.5 bg-[hsl(var(--theme-bg-secondary)/0.3)] border-b border-[hsl(var(--theme-border-default)/0.15)]"
                          >
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium text-[hsl(var(--theme-text-primary))]">
                                #{sched.channel_name || 'Unknown'}
                              </span>
                              {sched.community_name && (
                                <span className="ml-1.5 text-[11px] text-[hsl(var(--theme-text-muted))]">
                                  in {sched.community_name}
                                </span>
                              )}
                              <span className="ml-2 text-[11px] text-[hsl(var(--theme-text-muted))]">
                                at {sched.schedule_time?.slice(0, 5)} ({sched.timezone || 'UTC'})
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleToggleSchedule(sched.id, sched.is_active)}
                                className={`relative w-10 h-[22px] rounded-full transition-colors flex-shrink-0
                                  ${sched.is_active ? 'bg-emerald-500' : 'bg-[hsl(var(--theme-bg-tertiary))]'}`}
                              >
                                <div
                                  className={`absolute top-[2px] left-[2px] w-[18px] h-[18px] rounded-full bg-white transition-transform shadow-sm
                                    ${sched.is_active ? 'translate-x-[18px]' : 'translate-x-0'}`}
                                />
                              </button>
                              <button
                                onClick={() => handleDeleteSchedule(sched.id)}
                                className="p-1.5 rounded-md hover:bg-red-500/10 text-[hsl(var(--theme-text-muted))] hover:text-red-400 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}

                        {showAddSchedule ? (
                          <div className="p-4 bg-[hsl(var(--theme-bg-secondary)/0.3)] space-y-3">
                            {/* Community selector */}
                            <div>
                              <label className="text-[11px] font-medium text-[hsl(var(--theme-text-muted))] mb-1 block">Community</label>
                              <select
                                value={selectedCommunity || ''}
                                onChange={(e) => { setSelectedCommunity(parseInt(e.target.value) || null); setNewScheduleChannel(null); }}
                                disabled={!!communityId}
                                className={`w-full px-3 py-2 text-xs ${isBasicTheme ? 'rounded-md' : 'rounded-lg'}
                                  bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-primary))]
                                  border border-[hsl(var(--theme-border-default))]
                                  focus:outline-none focus:ring-2 focus:ring-[hsl(var(--theme-accent-primary)/0.5)]
                                  disabled:opacity-60`}
                              >
                                <option value="">Select a community…</option>
                                {communityOptions.map((c: any) => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                              </select>
                            </div>
                            {/* Channel selector */}
                            <div>
                              <label className="text-[11px] font-medium text-[hsl(var(--theme-text-muted))] mb-1 block">Channel</label>
                              <select
                                value={newScheduleChannel || ''}
                                onChange={(e) => setNewScheduleChannel(parseInt(e.target.value) || null)}
                                disabled={!selectedCommunity}
                                className={`w-full px-3 py-2 text-xs ${isBasicTheme ? 'rounded-md' : 'rounded-lg'}
                                  bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-primary))]
                                  border border-[hsl(var(--theme-border-default))]
                                  focus:outline-none focus:ring-2 focus:ring-[hsl(var(--theme-accent-primary)/0.5)]
                                  disabled:opacity-60`}
                              >
                                <option value="">{selectedCommunity ? 'Select a channel…' : 'Select a community first'}</option>
                                {channelOptions
                                  .filter(ch => !schedules.some(s => s.channel_id === ch.id))
                                  .map((ch: any) => (
                                    <option key={ch.id} value={ch.id}>#{ch.name}</option>
                                  ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-[11px] font-medium text-[hsl(var(--theme-text-muted))] mb-1 block">Time</label>
                              <input
                                type="time"
                                value={newScheduleTime}
                                onChange={(e) => setNewScheduleTime(e.target.value)}
                                className={`px-3 py-2 text-xs ${isBasicTheme ? 'rounded-md' : 'rounded-lg'}
                                  bg-[hsl(var(--theme-bg-tertiary))] text-[hsl(var(--theme-text-primary))]
                                  border border-[hsl(var(--theme-border-default))]
                                  focus:outline-none focus:ring-2 focus:ring-[hsl(var(--theme-accent-primary)/0.5)]`}
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={handleAddSchedule}
                                disabled={!newScheduleChannel || savingSchedule}
                                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white
                                  bg-gradient-to-r from-blue-500 to-cyan-500 ${isBasicTheme ? 'rounded-md' : 'rounded-lg'}
                                  hover:opacity-90 transition-all disabled:opacity-40`}
                              >
                                {savingSchedule ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                Save
                              </button>
                              <button
                                onClick={() => { setShowAddSchedule(false); setNewScheduleChannel(null); }}
                                className="px-3 py-1.5 text-xs text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))] transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setShowAddSchedule(true)}
                            className="w-full p-3 text-xs font-medium text-[hsl(var(--theme-accent-primary))] hover:bg-[hsl(var(--theme-bg-hover)/0.5)] transition-colors flex items-center justify-center gap-1.5"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Add Schedule
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-[hsl(var(--theme-border-default)/0.3)] flex flex-col gap-3">
          {/* Summarizer Run Now button */}
          {agentType === 'summarizer' && (communityId || selectedCommunity) && (
            <button
              onClick={handleTriggerNow}
              disabled={isTriggering}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold
                ${isBasicTheme ? 'rounded-md' : 'rounded-xl'}
                bg-purple-500/15 text-purple-400 border border-purple-500/30
                hover:bg-purple-500/25 transition-all disabled:opacity-50`}
            >
              {isTriggering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              {isTriggering ? 'Running Auto-Summarize...' : 'Run Auto-Summarize Now'}
            </button>
          )}

          <div className="flex items-center justify-between">
          <button
            onClick={handleReset}
            disabled={saving}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-medium
              ${isBasicTheme ? 'rounded-md' : 'rounded-lg'}
              text-[hsl(var(--theme-text-muted))] hover:text-[hsl(var(--theme-text-primary))]
              hover:bg-[hsl(var(--theme-bg-hover))] transition-all`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset to Default
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className={`px-4 py-2 ${isBasicTheme ? 'rounded-md' : 'rounded-lg'} text-xs font-medium
                bg-[hsl(var(--theme-bg-secondary))] text-[hsl(var(--theme-text-secondary))]
                border border-[hsl(var(--theme-border-default))]
                hover:bg-[hsl(var(--theme-bg-hover))] transition-all`}
            >
              Close
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className={`flex items-center gap-2 px-5 py-2 ${isBasicTheme ? 'rounded-md' : 'rounded-lg'} text-xs font-semibold text-white
                bg-gradient-to-r ${display.gradient}
                hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save Changes
            </button>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
};
