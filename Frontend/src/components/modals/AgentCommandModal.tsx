import React from 'react';
import { X, Terminal, BookOpen, Settings, Copy, Check } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useState } from 'react';

interface AgentCommandModalProps {
  open: boolean;
  onClose: () => void;
  agentType: string;
  onOpenSettings?: () => void;
}

interface CommandInfo {
  command: string;
  description: string;
  example?: string;
}

const AGENT_COMMANDS: Record<string, {
  name: string;
  emoji: string;
  commands: CommandInfo[];
  exampleResponse?: string;
  tips: string[];
}> = {
  summarizer: {
    name: 'Summarizer Agent',
    emoji: '📝',
    commands: [
      { command: '/summarize', description: 'Summarizes the last 100 messages in the current channel', example: '/summarize' },
      { command: '/summarize [count]', description: 'Summarizes the last N messages', example: '/summarize 50' },
    ],
    exampleResponse: `📋 **Summary (Last 100 messages)**
• Team discussed migration to new API v3
• Decision: Move deployment to Friday
• Action: @alice to update docs by Thursday
• Key topic: Performance improvements (60% of discussion)`,
    tips: [
      'Works best with 50-200 messages',
      'Supports Roman Urdu conversations',
      'Summaries are saved for future reference',
    ],
  },
  mood_tracker: {
    name: 'Mood Tracker',
    emoji: '😊',
    commands: [
      { command: '/mood', description: 'Analyzes your recent mood and sentiment', example: '/mood' },
      { command: '/mood [hours]', description: 'Analyzes mood over the last N hours', example: '/mood 24' },
    ],
    exampleResponse: `😊 **Your Mood Analysis (Last 24h)**
• Overall: Positive (82% confidence)
• Trend: ↗️ Improving
• Top emotions: Happy, Engaged, Curious
• Messages analyzed: 45`,
    tips: [
      'Mood is tracked automatically per message',
      'Detects sentiment in English and Roman Urdu',
      'Check trends over time in /agent/mood',
    ],
  },
  mood: {
    name: 'Mood Tracker',
    emoji: '😊',
    commands: [
      { command: '/mood', description: 'Analyzes your recent mood and sentiment', example: '/mood' },
      { command: '/mood [hours]', description: 'Analyzes mood over the last N hours', example: '/mood 24' },
    ],
    tips: ['Mood is tracked automatically per message', 'Supports Roman Urdu'],
  },
  moderation: {
    name: 'Moderation Agent',
    emoji: '🛡️',
    commands: [
      { command: 'Automatic', description: 'Messages are scanned automatically when sent', example: 'No command needed' },
    ],
    tips: [
      'Runs automatically on every message',
      'Severity levels: Low, Medium, High, Critical',
      'Admins can customize sensitivity in settings',
      'Violations are logged in the admin dashboard',
    ],
  },
  engagement: {
    name: 'Engagement Agent',
    emoji: '🎯',
    commands: [
      { command: 'Automatic', description: 'Engagement metrics are collected periodically', example: 'No command needed' },
    ],
    tips: [
      'Runs on a 30-minute analysis cycle',
      'View metrics in the admin dashboard',
      'Tracks peak hours and top contributors',
    ],
  },
  knowledge_builder: {
    name: 'Knowledge Builder',
    emoji: '📚',
    commands: [
      { command: '/kb', description: 'Extract knowledge from the last 24 hours of chat', example: '/kb' },
      { command: '/kb [hours]', description: 'Extract knowledge from the last N hours (max 168)', example: '/kb 48' },
      { command: '/kb search <query>', description: 'Search the knowledge base for a term', example: '/kb search docker' },
    ],
    exampleResponse: `📚 Knowledge Builder — Last 24h\n━━━━━━━━━━━━━━━━━━━━━━━━\n✅ Saved 4 new items · ✨ Gemini AI\n(2 FAQs, 1 Definition, 1 Decision)\n\n💡 FAQs\n• Q: What is Docker?\n  A: A containerization platform...\n\n📖 Definitions\n• React: A JavaScript UI library...\n\n✅ Decisions\n• We decided to use PostgreSQL for production.`,
    tips: [
      'Uses Gemini AI with rule-based fallback for accurate extraction',
      'Run /kb after important discussions to save key decisions',
      'Use /kb search to quickly find past answers without scrolling',
      'Results are private — only visible to you',
      'View all saved items in the Knowledge Builder agent panel',
    ],
  },
  knowledge: {
    name: 'Knowledge Builder',
    emoji: '📚',
    commands: [
      { command: '/kb', description: 'Extract knowledge from recent chat', example: '/kb' },
      { command: '/kb [hours]', description: 'Extract from the last N hours', example: '/kb 48' },
      { command: '/kb search <query>', description: 'Search the knowledge base', example: '/kb search docker' },
    ],
    tips: ['Uses Gemini AI for precise extraction', 'Searchable knowledge grows over time'],
  },
  wellness: {
    name: 'Wellness Agent',
    emoji: '🧘',
    commands: [
      { command: '/wellness', description: 'Check your current wellness score', example: '/wellness' },
    ],
    tips: [
      'Monitors communication frequency',
      'Sends break reminders proactively',
      'Detects burnout risk patterns',
    ],
  },
  focus: {
    name: 'Focus Agent',
    emoji: '🎯',
    commands: [
      { command: '/focus', description: 'Show current focus score and dominant topics for this channel', example: '/focus' },
    ],
    tips: [
      'Detects when discussion drifts off-topic',
      'Higher score = more on-topic',
      'Admins can set drift sensitivity in settings',
    ],
  },
  assistant: {
    name: 'AI Assistant',
    emoji: '🤖',
    commands: [
      { command: '/ask <question>', description: 'Ask a quick question — Gemini-powered with offline lexicon fallback', example: '/ask what is FastAPI?' },
      { command: '/joke', description: 'Get a random joke', example: '/joke' },
      { command: '/motivation', description: 'Get a motivational line', example: '/motivation' },
    ],
    exampleResponse: `🤖 **AI Assistant**
FastAPI is a modern Python web framework for building
APIs quickly. It's built on Starlette + Pydantic, supports
async/await natively, and auto-generates OpenAPI docs.`,
    tips: [
      'Replies are private — only visible to you',
      'Roman Urdu friendly',
      'Falls back to a local lexicon if Gemini is unavailable',
    ],
  },
  translator: {
    name: 'Translator',
    emoji: '🌐',
    commands: [
      { command: '/translate <lang> <text>', description: 'Translate text into the target language', example: '/translate ur Hello, how are you?' },
      { command: 'Hover → 🌐', description: 'Click the globe icon on any message to translate it into your default language', example: '' },
    ],
    exampleResponse: `🌐 **Translator** (en → ur)
"Hello, how are you?"
↓
"السلام علیکم، آپ کیسے ہیں؟"`,
    tips: [
      'Supports 14+ languages including Roman Urdu detection',
      'Cached for 24h — repeat translations are instant',
      'Falls back to googletrans if deep-translator is offline',
    ],
  },
  support: {
    name: 'Context-Aware Support',
    emoji: '🎓',
    commands: [
      { command: '/support <question>', description: 'Search the community knowledge base for an answer', example: '/support how do I reset my password?' },
    ],
    exampleResponse: `🎓 **Support** (best match · score 0.74)
Q: How do I reset my password?
A: Open Settings → Account → "Forgot Password",
then enter your email. A reset link will be sent.

📚 Source: #help — 3 days ago`,
    tips: [
      'Pulls answers from the community Knowledge Base',
      'Install Knowledge Builder alongside it for best results',
      'Cites the source message so you can read full context',
    ],
  },
  auto_message: {
    name: 'Auto Message Generator',
    emoji: '✉️',
    commands: [
      { command: 'Automatic — Welcome', description: 'Posts a welcome message in the default channel when a new member joins', example: 'No command needed' },
      { command: 'Automatic — Quick Replies', description: 'Suggests 3 tap-to-send chips above the chat input based on the latest message', example: 'No command needed' },
    ],
    tips: [
      'Welcome posts can be toggled in agent settings',
      'Quick-reply chips never auto-send — they drop into your input',
      'Optional Gemini polish makes welcome copy feel less templated',
    ],
  },
};

export const AgentCommandModal: React.FC<AgentCommandModalProps> = ({
  open,
  onClose,
  agentType,
  onOpenSettings,
}) => {
  const { currentTheme } = useTheme();
  const isBasicTheme = currentTheme === 'basic';
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  if (!open) return null;

  const agent = AGENT_COMMANDS[agentType] || {
    name: 'AI Agent',
    emoji: '🤖',
    commands: [
      { command: 'Automatic', description: 'This agent runs in the background — no chat command needed.', example: 'No command needed' },
    ],
    tips: ['Open agent settings to configure behaviour.'],
  };

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" />

      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-w-[500px] max-h-[75vh] overflow-hidden flex flex-col
          ${isBasicTheme ? 'rounded-lg' : 'rounded-2xl'}
          bg-[hsl(var(--theme-bg-elevated))] border border-[hsl(var(--theme-border-default)/0.5)]
          shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-4 duration-300`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[hsl(var(--theme-border-default)/0.3)] flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xl">{agent.emoji}</span>
            <div>
              <h2 className="text-base font-bold text-[hsl(var(--theme-text-primary))]">
                {agent.name} — Quick Reference
              </h2>
              <p className="text-xs text-[hsl(var(--theme-text-muted))]">Commands and usage</p>
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
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Commands */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--theme-text-muted))] mb-3 flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5" />
              Commands
            </h3>
            <div className="space-y-2">
              {agent.commands.map((cmd, i) => (
                <div
                  key={i}
                  className={`p-3 ${isBasicTheme ? 'rounded-md' : 'rounded-xl'}
                    bg-[hsl(var(--theme-bg-secondary)/0.5)] border border-[hsl(var(--theme-border-default)/0.3)]`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <code className="text-sm font-mono font-semibold text-[hsl(var(--theme-accent-primary))]">
                      {cmd.command}
                    </code>
                    {cmd.example && cmd.example !== 'No command needed' && (
                      <button
                        onClick={() => handleCopy(cmd.example!, i)}
                        className="p-1 rounded hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-muted))] transition-colors"
                        title="Copy command"
                      >
                        {copiedIdx === i ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-[hsl(var(--theme-text-secondary))]">{cmd.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Example Response */}
          {agent.exampleResponse && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--theme-text-muted))] mb-3 flex items-center gap-2">
                <BookOpen className="w-3.5 h-3.5" />
                Example Response
              </h3>
              <pre className={`p-4 ${isBasicTheme ? 'rounded-md' : 'rounded-xl'} text-xs
                bg-[hsl(var(--theme-bg-secondary)/0.5)] border border-[hsl(var(--theme-border-default)/0.3)]
                text-[hsl(var(--theme-text-secondary))] whitespace-pre-wrap font-sans leading-relaxed`}>
                {agent.exampleResponse}
              </pre>
            </div>
          )}

          {/* Tips */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--theme-text-muted))] mb-3">
              💡 Tips
            </h3>
            <ul className="space-y-1.5">
              {agent.tips.map((tip, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-[hsl(var(--theme-text-secondary))]">
                  <span className="w-1 h-1 rounded-full bg-[hsl(var(--theme-accent-primary))] mt-1.5 flex-shrink-0" />
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Footer */}
        {onOpenSettings && (
          <div className="flex-shrink-0 px-6 py-3 border-t border-[hsl(var(--theme-border-default)/0.3)] flex justify-end">
            <button
              onClick={() => {
                onClose();
                onOpenSettings();
              }}
              className={`flex items-center gap-2 px-4 py-2 ${isBasicTheme ? 'rounded-md' : 'rounded-lg'} text-xs font-medium
                bg-[hsl(var(--theme-accent-primary)/0.15)] text-[hsl(var(--theme-accent-primary))]
                border border-[hsl(var(--theme-accent-primary)/0.3)]
                hover:bg-[hsl(var(--theme-accent-primary)/0.25)] transition-all`}
            >
              <Settings className="w-3.5 h-3.5" />
              Configure Settings
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
