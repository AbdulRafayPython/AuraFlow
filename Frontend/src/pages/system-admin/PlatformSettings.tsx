/**
 * System Admin — Platform Settings
 * Configure platform-wide settings: registration, moderation, rate limits, etc.
 */

import { useState, useEffect } from 'react';
import adminService from '@/services/adminService';
import {
  Settings, Shield, Users, MessageSquare, Bot, Bell, Globe,
  Save, RefreshCw, Check, AlertCircle, ToggleLeft, ToggleRight,
  Loader2
} from 'lucide-react';

interface PlatformConfig {
  registration_enabled: boolean;
  max_communities_per_user: number;
  max_channels_per_community: number;
  max_file_size_mb: number;
  message_rate_limit: number;
  auto_moderation_enabled: boolean;
  moderation_sensitivity: 'low' | 'medium' | 'high';
  auto_ban_threshold: number;
  email_notifications_enabled: boolean;
  maintenance_mode: boolean;
}

type PlatformSettingsResponse = {
  success?: boolean;
  settings?: Partial<PlatformConfig> & Record<string, unknown>;
} & (Partial<PlatformConfig> & Record<string, unknown>);

const DEFAULT_CONFIG: PlatformConfig = {
  registration_enabled: true,
  max_communities_per_user: 10,
  max_channels_per_community: 50,
  max_file_size_mb: 10,
  message_rate_limit: 30,
  auto_moderation_enabled: true,
  moderation_sensitivity: 'medium',
  auto_ban_threshold: 5,
  email_notifications_enabled: true,
  maintenance_mode: false,
};

export default function PlatformSettings() {
  const [config, setConfig] = useState<PlatformConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadSettings();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const normalizeSettings = (payload: PlatformSettingsResponse): PlatformConfig => {
    const raw = (payload?.settings && typeof payload.settings === 'object') ? payload.settings : payload;
    return {
      registration_enabled: Boolean(raw.registration_enabled ?? raw.allow_registration ?? DEFAULT_CONFIG.registration_enabled),
      max_communities_per_user: Number(raw.max_communities_per_user ?? DEFAULT_CONFIG.max_communities_per_user),
      max_channels_per_community: Number(raw.max_channels_per_community ?? DEFAULT_CONFIG.max_channels_per_community),
      max_file_size_mb: Number(raw.max_file_size_mb ?? DEFAULT_CONFIG.max_file_size_mb),
      message_rate_limit: Number(raw.message_rate_limit ?? raw.rate_limit_per_minute ?? DEFAULT_CONFIG.message_rate_limit),
      auto_moderation_enabled: Boolean(raw.auto_moderation_enabled ?? DEFAULT_CONFIG.auto_moderation_enabled),
      moderation_sensitivity: (raw.moderation_sensitivity as PlatformConfig['moderation_sensitivity']) || DEFAULT_CONFIG.moderation_sensitivity,
      auto_ban_threshold: Number(raw.auto_ban_threshold ?? DEFAULT_CONFIG.auto_ban_threshold),
      email_notifications_enabled: Boolean(raw.email_notifications_enabled ?? DEFAULT_CONFIG.email_notifications_enabled),
      maintenance_mode: Boolean(raw.maintenance_mode ?? DEFAULT_CONFIG.maintenance_mode),
    };
  };

  const loadSettings = async () => {
    setLoading(true);
    try {
      const response = await adminService.getPlatformSettings() as PlatformSettingsResponse;
      setConfig(normalizeSettings(response));
    } catch {
      // Use defaults if endpoint not available
      setConfig(DEFAULT_CONFIG);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaveSuccess(false);
    try {
      await adminService.updatePlatformSettings(config);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const updateConfig = <K extends keyof PlatformConfig>(key: K, value: PlatformConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const ToggleSwitch = ({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) => (
    <button
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-300 ${
        enabled
          ? 'bg-[hsl(var(--theme-accent-primary))]'
          : 'bg-[hsl(var(--theme-bg-tertiary))]'
      }`}
    >
      <span className={`inline-flex items-center justify-center h-5 w-5 transform rounded-full bg-white shadow-lg transition-all duration-300 ${
        enabled ? 'translate-x-5' : 'translate-x-1'
      }`}>
        {enabled && <Check className="w-3 h-3 text-[hsl(var(--theme-accent-primary))]" />}
      </span>
    </button>
  );

  const SectionCard = ({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) => (
    <div className="rounded-2xl border border-[hsl(var(--theme-border-default))] bg-[hsl(var(--theme-bg-secondary)/0.5)] overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[hsl(var(--theme-border-default))]">
        <Icon className="w-5 h-5 text-[hsl(var(--theme-accent-primary))]" />
        <h3 className="font-semibold text-[hsl(var(--theme-text-primary))]">{title}</h3>
      </div>
      <div className="p-6 space-y-5">{children}</div>
    </div>
  );

  const SettingRow = ({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) => (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[hsl(var(--theme-text-primary))]">{label}</p>
        {description && <p className="text-xs text-[hsl(var(--theme-text-muted))] mt-0.5">{description}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-[hsl(var(--theme-accent-primary))] animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[hsl(var(--theme-text-primary))]">Platform Settings</h1>
          <p className="text-sm text-[hsl(var(--theme-text-muted))] mt-1">Configure platform-wide settings and policies</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[hsl(var(--theme-accent-primary))] text-white font-medium hover:opacity-90 transition-all disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saveSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save Changes'}
        </button>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* General Settings */}
      <SectionCard title="General" icon={Globe}>
        <SettingRow label="User Registration" description="Allow new users to create accounts">
          <ToggleSwitch enabled={config.registration_enabled} onChange={(v) => updateConfig('registration_enabled', v)} />
        </SettingRow>
        <SettingRow label="Maintenance Mode" description="Put the platform in maintenance mode (read-only)">
          <ToggleSwitch enabled={config.maintenance_mode} onChange={(v) => updateConfig('maintenance_mode', v)} />
        </SettingRow>
      </SectionCard>

      {/* Limits */}
      <SectionCard title="Limits & Rate Control" icon={Settings}>
        <SettingRow label="Max Communities per User" description="Maximum communities a user can create">
          <input
            type="number"
            value={config.max_communities_per_user}
            onChange={(e) => updateConfig('max_communities_per_user', Math.max(1, parseInt(e.target.value) || 1))}
            className="w-24 px-3 py-2 rounded-lg border bg-[hsl(var(--theme-bg-tertiary))] border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))] text-sm text-center focus:outline-none focus:ring-2 focus:ring-[hsl(var(--theme-accent-primary))]"
            min={1}
            max={100}
          />
        </SettingRow>
        <SettingRow label="Max Channels per Community" description="Maximum channels allowed in a single community">
          <input
            type="number"
            value={config.max_channels_per_community}
            onChange={(e) => updateConfig('max_channels_per_community', Math.max(1, parseInt(e.target.value) || 1))}
            className="w-24 px-3 py-2 rounded-lg border bg-[hsl(var(--theme-bg-tertiary))] border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))] text-sm text-center focus:outline-none focus:ring-2 focus:ring-[hsl(var(--theme-accent-primary))]"
            min={1}
            max={500}
          />
        </SettingRow>
        <SettingRow label="Max File Upload Size (MB)" description="Maximum file size for uploads">
          <input
            type="number"
            value={config.max_file_size_mb}
            onChange={(e) => updateConfig('max_file_size_mb', Math.max(1, parseInt(e.target.value) || 1))}
            className="w-24 px-3 py-2 rounded-lg border bg-[hsl(var(--theme-bg-tertiary))] border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))] text-sm text-center focus:outline-none focus:ring-2 focus:ring-[hsl(var(--theme-accent-primary))]"
            min={1}
            max={100}
          />
        </SettingRow>
        <SettingRow label="Message Rate Limit" description="Maximum messages per minute per user">
          <input
            type="number"
            value={config.message_rate_limit}
            onChange={(e) => updateConfig('message_rate_limit', Math.max(1, parseInt(e.target.value) || 1))}
            className="w-24 px-3 py-2 rounded-lg border bg-[hsl(var(--theme-bg-tertiary))] border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))] text-sm text-center focus:outline-none focus:ring-2 focus:ring-[hsl(var(--theme-accent-primary))]"
            min={1}
            max={200}
          />
        </SettingRow>
      </SectionCard>

      {/* Moderation */}
      <SectionCard title="Auto-Moderation" icon={Shield}>
        <SettingRow label="Auto-Moderation" description="Enable AI-powered automatic content moderation">
          <ToggleSwitch enabled={config.auto_moderation_enabled} onChange={(v) => updateConfig('auto_moderation_enabled', v)} />
        </SettingRow>
        <SettingRow label="Moderation Sensitivity" description="How strictly content is flagged">
          <select
            value={config.moderation_sensitivity}
            onChange={(e) => updateConfig('moderation_sensitivity', e.target.value as PlatformConfig['moderation_sensitivity'])}
            className="px-3 py-2 rounded-lg border bg-[hsl(var(--theme-bg-tertiary))] border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--theme-accent-primary))]"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </SettingRow>
        <SettingRow label="Auto-Ban Threshold" description="Number of violations before automatic ban">
          <input
            type="number"
            value={config.auto_ban_threshold}
            onChange={(e) => updateConfig('auto_ban_threshold', Math.max(1, parseInt(e.target.value) || 1))}
            className="w-24 px-3 py-2 rounded-lg border bg-[hsl(var(--theme-bg-tertiary))] border-[hsl(var(--theme-border-default))] text-[hsl(var(--theme-text-primary))] text-sm text-center focus:outline-none focus:ring-2 focus:ring-[hsl(var(--theme-accent-primary))]"
            min={1}
            max={50}
          />
        </SettingRow>
      </SectionCard>

      {/* Notifications */}
      <SectionCard title="Notifications" icon={Bell}>
        <SettingRow label="Email Notifications" description="Enable platform-wide email notification system">
          <ToggleSwitch enabled={config.email_notifications_enabled} onChange={(v) => updateConfig('email_notifications_enabled', v)} />
        </SettingRow>
      </SectionCard>

      {/* Where settings take effect */}
      <SectionCard title="Where each setting is enforced" icon={Settings}>
        <p className="text-xs text-[hsl(var(--theme-text-muted))] -mt-2 mb-2">
          Reference for engineers: which backend module reads each setting.
          Changes are picked up within 60 seconds (read-through cache TTL).
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-[hsl(var(--theme-border-default))] rounded-lg">
            <thead className="bg-[hsl(var(--theme-bg-tertiary))]">
              <tr>
                <th className="text-left px-3 py-2 font-semibold text-[hsl(var(--theme-text-secondary))]">Setting</th>
                <th className="text-left px-3 py-2 font-semibold text-[hsl(var(--theme-text-secondary))]">Consumed by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[hsl(var(--theme-border-default))]">
              <tr><td className="px-3 py-2 font-mono">registration_enabled</td><td className="px-3 py-2">routes/auth.py — signup()</td></tr>
              <tr><td className="px-3 py-2 font-mono">maintenance_mode</td><td className="px-3 py-2">routes/auth.py — signup(); UI banner</td></tr>
              <tr><td className="px-3 py-2 font-mono">max_file_size_mb</td><td className="px-3 py-2">routes/uploads.py — both upload paths</td></tr>
              <tr><td className="px-3 py-2 font-mono">message_rate_limit</td><td className="px-3 py-2">routes/messages.py — send_message() (per-user per-minute)</td></tr>
              <tr><td className="px-3 py-2 font-mono">auto_moderation_enabled</td><td className="px-3 py-2">routes/messages.py — skip moderation when off</td></tr>
              <tr><td className="px-3 py-2 font-mono">moderation_sensitivity</td><td className="px-3 py-2">agents/moderation.py — Gemini confidence cutoff</td></tr>
              <tr><td className="px-3 py-2 font-mono">auto_ban_threshold</td><td className="px-3 py-2">agents/moderation.py — N-strike escalation</td></tr>
              <tr><td className="px-3 py-2 font-mono">email_notifications_enabled</td><td className="px-3 py-2">services/email_service.py (gates transactional mail)</td></tr>
              <tr><td className="px-3 py-2 font-mono">max_communities_per_user</td><td className="px-3 py-2">routes/communities.py — create cap</td></tr>
              <tr><td className="px-3 py-2 font-mono">max_channels_per_community</td><td className="px-3 py-2">routes/channels.py — create cap</td></tr>
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
