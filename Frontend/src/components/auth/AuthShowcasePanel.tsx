import React, { useState, useEffect, useCallback } from 'react';
import { 
  MessageCircle, 
  Users, 
  Hash, 
  Sparkles, 
  Shield, 
  Heart,
  CheckCheck,
  Brain,
  Zap,
  ChevronRight
} from 'lucide-react';

// Animation timeline states
type AnimationStep = 
  | 'entering' 
  | 'user-typing' 
  | 'user-message' 
  | 'analyzing' 
  | 'insights-ready' 
  | 'agent-responding' 
  | 'tips-appearing' 
  | 'loop-reset';

interface ChatMessage {
  id: string;
  sender: 'user' | 'agent';
  content: string;
  timestamp: string;
  status?: 'sending' | 'sent' | 'delivered';
}

// ============================================================================
// SUBCOMPONENTS
// ============================================================================

const TypingIndicator: React.FC<{ visible: boolean }> = ({ visible }) => (
  <div className={`flex items-center gap-1 transition-all duration-300 ${visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
    <div className="flex gap-1 px-4 py-3 bg-slate-700/60 rounded-2xl rounded-bl-sm">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"
          style={{ animationDelay: `${i * 150}ms`, animationDuration: '600ms' }}
        />
      ))}
    </div>
  </div>
);

const ChatBubble: React.FC<{
  message: ChatMessage;
  visible: boolean;
  animationDelay?: number;
}> = ({ message, visible, animationDelay = 0 }) => {
  const isUser = message.sender === 'user';
  
  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} transition-all duration-500 ease-out`}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible 
          ? 'translateY(0) scale(1)' 
          : `translateY(12px) scale(0.95) translateX(${isUser ? '20px' : '-20px'})`,
        transitionDelay: `${animationDelay}ms`
      }}
    >
      <div className={`max-w-[85%] ${isUser ? 'order-2' : 'order-1'}`}>
        {/* Agent avatar for non-user messages */}
        {!isUser && (
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Heart className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-xs font-medium text-emerald-400">Wellness Agent</span>
            <Sparkles className="w-3 h-3 text-emerald-400/60" />
          </div>
        )}
        
        <div
          className={`px-4 py-3 rounded-2xl ${
            isUser
              ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-br-sm shadow-lg shadow-purple-500/20'
              : 'bg-slate-700/80 text-gray-100 rounded-bl-sm backdrop-blur-sm border border-slate-600/30'
          }`}
        >
          <p className="text-sm leading-relaxed">{message.content}</p>
        </div>
        
        {/* Message status for user */}
        {isUser && message.status && (
          <div className="flex items-center justify-end gap-1 mt-1 pr-1">
            <span className="text-[10px] text-gray-500">{message.timestamp}</span>
            <CheckCheck className={`w-3.5 h-3.5 transition-colors duration-300 ${
              message.status === 'delivered' ? 'text-blue-400' : 'text-gray-500'
            }`} />
          </div>
        )}
      </div>
    </div>
  );
};

const AnalysisStatus: React.FC<{
  step: AnimationStep;
}> = ({ step }) => {
  const isAnalyzing = step === 'analyzing';
  const isReady = step === 'insights-ready' || step === 'agent-responding' || step === 'tips-appearing';
  const visible = isAnalyzing || isReady;
  
  return (
    <div
      className={`transition-all duration-400 ease-out ${
        visible ? 'opacity-100 max-h-20' : 'opacity-0 max-h-0 overflow-hidden'
      }`}
    >
      <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-800/60 backdrop-blur-sm rounded-xl border border-slate-700/50 mx-2">
        {/* Analysis indicator */}
        <div className={`relative ${isAnalyzing ? 'animate-pulse' : ''}`}>
          <Brain className={`w-5 h-5 transition-colors duration-300 ${
            isReady ? 'text-emerald-400' : 'text-purple-400'
          }`} />
          {isAnalyzing && (
            <div className="absolute inset-0 animate-ping">
              <Brain className="w-5 h-5 text-purple-400 opacity-40" />
            </div>
          )}
        </div>
        
        {/* Status text */}
        <div className="flex-1 min-w-0">
          {isAnalyzing ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-300">Analyzing tone</span>
              <ChevronRight className="w-3 h-3 text-gray-500" />
              <span className="text-xs text-purple-300">detecting stress</span>
              <ChevronRight className="w-3 h-3 text-gray-500" />
              <span className="text-xs text-gray-400">summarizing</span>
            </div>
          ) : (
            <span className="text-xs text-emerald-400 font-medium">✓ Insights ready</span>
          )}
          
          {/* Progress bar */}
          {isAnalyzing && (
            <div className="mt-1.5 h-1 bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-purple-500 via-indigo-500 to-purple-500 rounded-full animate-shimmer" 
                   style={{ width: '100%', backgroundSize: '200% 100%' }} />
            </div>
          )}
        </div>
        
        {/* Status badge */}
        <div className={`px-2 py-1 rounded-full text-[10px] font-medium transition-all duration-300 ${
          isReady 
            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
            : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
        }`}>
          {isReady ? 'Ready' : 'Processing'}
        </div>
      </div>
    </div>
  );
};

const QuickTips: React.FC<{ visible: boolean }> = ({ visible }) => {
  const tips = [
    { icon: Zap, text: "Try a 2-minute reset" },
    { icon: Sparkles, text: "Break into 5-min starts" }
  ];
  
  return (
    <div className={`flex gap-2 flex-wrap mt-2 ml-8 transition-all duration-500 ${
      visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
    }`}>
      {tips.map((tip, i) => (
        <div
          key={i}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/50 hover:bg-slate-700/70 rounded-full border border-slate-600/30 cursor-pointer transition-all duration-300 hover:scale-105"
          style={{ 
            transitionDelay: visible ? `${i * 150}ms` : '0ms',
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(8px)'
          }}
        >
          <tip.icon className="w-3 h-3 text-emerald-400" />
          <span className="text-[11px] text-gray-300">{tip.text}</span>
        </div>
      ))}
    </div>
  );
};

const DesktopMockup: React.FC<{
  step: AnimationStep;
  children: React.ReactNode;
}> = ({ step, children }) => {
  const isEntering = step === 'entering';
  
  return (
    <div
      className="relative w-full max-w-[520px] transition-all duration-1000 ease-out"
      style={{
        opacity: isEntering ? 0 : 1,
        transform: isEntering 
          ? 'translateX(100px) scale(0.96)' 
          : 'translateX(0) scale(1)',
      }}
    >
      {/* Glow effect behind the mockup */}
      <div className="absolute -inset-4 bg-gradient-to-r from-purple-500/20 via-indigo-500/20 to-teal-500/20 rounded-3xl blur-2xl opacity-60" />
      
      {/* Desktop window frame */}
      <div className="relative bg-slate-900/95 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-2xl shadow-purple-900/30 overflow-hidden">
        {/* Window title bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-800/80 border-b border-slate-700/50">
          <div className="flex items-center gap-2">
            {/* Traffic lights */}
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/80 hover:bg-red-500 transition-colors" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80 hover:bg-yellow-500 transition-colors" />
              <div className="w-3 h-3 rounded-full bg-green-500/80 hover:bg-green-500 transition-colors" />
            </div>
          </div>
          
          {/* App title */}
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
              <Sparkles className="w-3 h-3 text-white" />
            </div>
            <span className="text-xs font-medium text-gray-300">AuraFlow</span>
          </div>
          
          {/* Status badges */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] text-gray-400">Online</span>
            </div>
            <div className="flex items-center gap-1">
              <Shield className="w-3 h-3 text-slate-500" />
              <span className="text-[10px] text-slate-500">Secure</span>
            </div>
          </div>
        </div>
        
        {/* Main content area with sidebar */}
        <div className="flex h-[400px]">
          {/* Sidebar */}
          <div className="w-16 bg-slate-800/50 border-r border-slate-700/30 flex flex-col items-center py-3 gap-3">
            {/* Community icons */}
            {[
              { gradient: 'from-purple-500 to-indigo-600', icon: Users },
              { gradient: 'from-emerald-500 to-teal-600', icon: Heart },
              { gradient: 'from-orange-500 to-red-600', icon: MessageCircle },
            ].map((item, i) => (
              <div
                key={i}
                className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${item.gradient} flex items-center justify-center cursor-pointer hover:rounded-xl transition-all duration-300 shadow-lg ${
                  i === 1 ? 'ring-2 ring-white/20 ring-offset-2 ring-offset-slate-800' : 'opacity-60 hover:opacity-100'
                }`}
              >
                <item.icon className="w-5 h-5 text-white" />
              </div>
            ))}
            
            <div className="w-8 h-px bg-slate-700 my-1" />
            
            {/* Add community button */}
            <div className="w-10 h-10 rounded-2xl bg-slate-700/50 hover:bg-slate-700 flex items-center justify-center cursor-pointer transition-colors border-2 border-dashed border-slate-600">
              <span className="text-xl text-slate-400">+</span>
            </div>
          </div>
          
          {/* Channel list */}
          <div className="w-48 bg-slate-800/30 border-r border-slate-700/30 flex flex-col">
            <div className="px-3 py-3 border-b border-slate-700/30">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Heart className="w-4 h-4 text-emerald-400" />
                Wellness Hub
              </h3>
            </div>
            
            <div className="flex-1 p-2 space-y-0.5">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 px-2 py-1.5">
                Text Channels
              </div>
              {['general', 'daily-check-in', 'support-circle'].map((channel, i) => (
                <div
                  key={channel}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
                    i === 1 
                      ? 'bg-slate-700/70 text-white' 
                      : 'text-gray-400 hover:bg-slate-700/40 hover:text-gray-200'
                  }`}
                >
                  <Hash className="w-4 h-4 opacity-60" />
                  <span className="text-xs truncate">{channel}</span>
                  {i === 1 && (
                    <div className="ml-auto w-2 h-2 rounded-full bg-indigo-500" />
                  )}
                </div>
              ))}
              
              <div className="text-[10px] uppercase tracking-wider text-gray-500 px-2 py-1.5 mt-3">
                AI Agents
              </div>
              {[
                { name: 'Wellness', color: 'text-emerald-400', active: true },
                { name: 'Mood Tracker', color: 'text-purple-400', active: false },
                { name: 'Summarizer', color: 'text-blue-400', active: false },
              ].map((agent) => (
                <div
                  key={agent.name}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
                    agent.active 
                      ? 'bg-emerald-500/10 border border-emerald-500/20' 
                      : 'hover:bg-slate-700/40'
                  }`}
                >
                  <Sparkles className={`w-4 h-4 ${agent.color}`} />
                  <span className={`text-xs ${agent.active ? agent.color : 'text-gray-400'}`}>
                    {agent.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
          
          {/* Chat area */}
          <div className="flex-1 flex flex-col bg-slate-900/50">
            {/* Chat header */}
            <div className="px-4 py-3 border-b border-slate-700/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Hash className="w-5 h-5 text-gray-500" />
                <span className="text-sm font-medium text-white">daily-check-in</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="px-2 py-1 bg-emerald-500/10 rounded-full border border-emerald-500/20">
                  <span className="text-[10px] text-emerald-400 font-medium">AI Enhanced</span>
                </div>
              </div>
            </div>
            
            {/* Chat messages */}
            <div className="flex-1 overflow-hidden">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const AuthShowcasePanel: React.FC = () => {
  const [step, setStep] = useState<AnimationStep>('entering');
  const [showTyping, setShowTyping] = useState(false);
  const [userMessage, setUserMessage] = useState<ChatMessage | null>(null);
  const [agentMessage, setAgentMessage] = useState<ChatMessage | null>(null);
  const [showTips, setShowTips] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  
  // Check for reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);
  
  // Animation timeline controller
  const runTimeline = useCallback(() => {
    if (prefersReducedMotion) {
      // Static version for reduced motion
      setStep('tips-appearing');
      setUserMessage({
        id: '1',
        sender: 'user',
        content: "I've been feeling stressed and can't focus lately.",
        timestamp: '2:34 PM',
        status: 'delivered'
      });
      setAgentMessage({
        id: '2',
        sender: 'agent',
        content: "You're not alone—stress can overload your mind fast. Let's take one small step: breathe in for 4, hold 2, out for 6. Then pick the next tiny task (5 minutes only). You've got this. 💪",
        timestamp: '2:34 PM'
      });
      setShowTips(true);
      return () => {};
    }
    
    const timeouts: NodeJS.Timeout[] = [];
    
    // Reset state
    setStep('entering');
    setShowTyping(false);
    setUserMessage(null);
    setAgentMessage(null);
    setShowTips(false);
    
    // Timeline
    // 0-1s: Panel enters
    timeouts.push(setTimeout(() => setStep('user-typing'), 1000));
    
    // 1-1.6s: User typing indicator
    timeouts.push(setTimeout(() => setShowTyping(true), 1000));
    
    // 1.6-2.2s: User message appears
    timeouts.push(setTimeout(() => {
      setShowTyping(false);
      setStep('user-message');
      setUserMessage({
        id: '1',
        sender: 'user',
        content: "I've been feeling stressed and can't focus lately.",
        timestamp: '2:34 PM',
        status: 'sending'
      });
    }, 1600));
    
    // 2.2s: Message sent
    timeouts.push(setTimeout(() => {
      setUserMessage(prev => prev ? { ...prev, status: 'sent' } : null);
    }, 2000));
    
    // 2.4s: Message delivered
    timeouts.push(setTimeout(() => {
      setUserMessage(prev => prev ? { ...prev, status: 'delivered' } : null);
    }, 2400));
    
    // 2.2-4.3s: Analysis phase
    timeouts.push(setTimeout(() => setStep('analyzing'), 2200));
    
    // 4.3s: Insights ready
    timeouts.push(setTimeout(() => setStep('insights-ready'), 4300));
    
    // 4.5-7.2s: Agent response
    timeouts.push(setTimeout(() => {
      setStep('agent-responding');
      setAgentMessage({
        id: '2',
        sender: 'agent',
        content: "You're not alone—stress can overload your mind fast. Let's take one small step: breathe in for 4, hold 2, out for 6. Then pick the next tiny task (5 minutes only). You've got this. 💪",
        timestamp: '2:34 PM'
      });
    }, 4800));
    
    // 6.5s: Tips appear
    timeouts.push(setTimeout(() => {
      setStep('tips-appearing');
      setShowTips(true);
    }, 6500));
    
    // 9s: Loop reset
    timeouts.push(setTimeout(() => {
      setStep('loop-reset');
    }, 9000));
    
    // 10s: Restart
    timeouts.push(setTimeout(() => {
      runTimeline();
    }, 10000));
    
    return () => timeouts.forEach(clearTimeout);
  }, [prefersReducedMotion]);
  
  // Start timeline on mount
  useEffect(() => {
    const cleanup = runTimeline();
    return cleanup;
  }, [runTimeline]);
  
  return (
    <div 
      className="hidden lg:flex flex-1 items-center justify-center p-8 relative overflow-hidden"
      aria-hidden="true"
    >
      {/* Background effects */}
      <div className="absolute inset-0">
        {/* Animated gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900" />
        
        {/* Floating orbs */}
        <div className="absolute top-1/4 right-1/4 w-64 h-64 bg-purple-500/10 rounded-full filter blur-3xl animate-float-slow" />
        <div className="absolute bottom-1/4 left-1/4 w-48 h-48 bg-indigo-500/10 rounded-full filter blur-3xl animate-float-slow animation-delay-2000" />
        <div className="absolute top-1/2 right-1/3 w-32 h-32 bg-teal-500/10 rounded-full filter blur-2xl animate-float-slow animation-delay-4000" />
        
        {/* Grid pattern */}
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(139, 92, 246, 0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(139, 92, 246, 0.3) 1px, transparent 1px)`,
            backgroundSize: '50px 50px'
          }}
        />
        
        {/* Radial gradient overlay */}
        <div className="absolute inset-0 bg-gradient-radial from-transparent via-transparent to-slate-900/80" />
      </div>
      
      {/* Main content */}
      <div className="relative z-10 w-full max-w-xl">
        <DesktopMockup step={step}>
          <div className="flex flex-col gap-4 p-4 h-full">
            {/* Spacer to push content down */}
            <div className="flex-1" />
            
            {/* Typing indicator */}
            <div className="flex justify-end">
              <TypingIndicator visible={showTyping} />
            </div>
            
            {/* User message */}
            {userMessage && (
              <ChatBubble message={userMessage} visible={true} />
            )}
            
            {/* Analysis status */}
            <AnalysisStatus step={step} />
            
            {/* Agent message */}
            {agentMessage && (
              <ChatBubble message={agentMessage} visible={true} animationDelay={0} />
            )}
            
            {/* Quick tips */}
            <QuickTips visible={showTips} />
            
            {/* Bottom padding */}
            <div className="h-2" />
          </div>
        </DesktopMockup>
        
        {/* Feature highlights below mockup */}
        <div className={`flex justify-center gap-6 mt-8 transition-all duration-700 ${
          step === 'entering' ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'
        }`}>
          {[
            { icon: Brain, label: 'AI Analysis', color: 'text-purple-400' },
            { icon: Heart, label: 'Wellness Support', color: 'text-emerald-400' },
            { icon: Shield, label: 'Private & Secure', color: 'text-blue-400' },
          ].map((feature, i) => (
            <div 
              key={feature.label}
              className="flex items-center gap-2 px-3 py-2 bg-slate-800/40 backdrop-blur-sm rounded-full border border-slate-700/30"
              style={{ transitionDelay: `${i * 100 + 200}ms` }}
            >
              <feature.icon className={`w-4 h-4 ${feature.color}`} />
              <span className="text-xs text-gray-400">{feature.label}</span>
            </div>
          ))}
        </div>
      </div>
      
      {/* CSS Animations */}
      <style>{`
        @keyframes float-slow {
          0%, 100% { transform: translateY(0) translateX(0); }
          50% { transform: translateY(-20px) translateX(10px); }
        }
        .animate-float-slow {
          animation: float-slow 8s ease-in-out infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .animate-shimmer {
          animation: shimmer 2s linear infinite;
        }
        .bg-gradient-radial {
          background: radial-gradient(ellipse at center, var(--tw-gradient-stops));
        }
      `}</style>
    </div>
  );
};

export default AuthShowcasePanel;
