# 🎨 AI Agent Configuration Modal - UI Structure & Flow

**Version:** 1.0  
**Date:** February 22, 2026  
**Current Status:** Ready for Implementation

---

## 📋 Overview

This document defines the complete UI/UX structure for replacing the old **AIAgentPanel** (side panel) with a modern **Agent Configuration Modal** system that follows the Explore → Install → Configure flow defined in the Agent Integration Architecture.

---

## 🗑️ DEPRECATION

### Old Component (To Be Deleted)
- **File:** `Frontend/src/components/ai-agents/AIAgentPanel.tsx`
- **Status:** ❌ **DEPRECATED** - Remove after new modal system is fully implemented
- **Replacement:** New Modal-based system
- **References to Remove:**
  - Remove from right sidebar/dashboard
  - Remove state management from relevant contexts
  - Remove toggle/navigation calls pointing to this panel

---

## 📱 New Modal Architecture

### Component Structure

```
Frontend/src/components/modals/
├── AgentDetailModal.tsx          [NEW] - Agent discovery & install details
├── AgentSettingsModal.tsx        [NEW] - Agent configuration panel
├── AgentCommandModal.tsx         [NEW] - Command reference for personal agents
└── AgentConfirmDialog.tsx        [NEW] - Confirmation for uninstall/disable

Frontend/src/components/ai-agents/
├── AgentCard.tsx                 [KEEP] - Reuse in Explore section
├── AgentCatalogSection.tsx       [NEW] - Group agents by category (Explore page)
├── CommunityAgentsList.tsx       [NEW] - Show installed agents in community
├── PersonalAgentsList.tsx        [NEW] - Show user's activated agents
└── AgentStatusBadge.tsx          [NEW] - Status indicator component
```

---

## 🎯 Modal 1: Agent Detail Modal

**Purpose:** Discover and install agents  
**Trigger Points:**
- Click agent card in Explore → AI Agents tab
- "Browse Agents" button in Community Settings → Agents
- "Add More Agents" button in user settings

### Layout Structure

```
┌─────────────────────────────────────────────────┐
│  ✕                                              │
├─────────────────────────────────────────────────┤
│                                                 │
│  HEADER SECTION                                 │
│  ┌─────────────┐                               │
│  │ 🛡️ (large)  │  Moderation Agent            │
│  │             │  🏷️ Community Agent           │
│  └─────────────┘                               │
│                                                 │
│  DESCRIPTION                                    │
│  Auto-moderate toxic content, spam, and hate   │
│  speech with Roman Urdu language support.      │
│                                                 │
│  FEATURES LIST                                  │
│  ✓ Auto-detect toxic content                   │
│  ✓ Roman Urdu profanity detection              │
│  ✓ Hate speech & harassment filtering          │
│  ✓ Configurable sensitivity levels             │
│  ✓ Automated moderation actions                │
│                                                 │
│ ─────────────────────────────────────────────  │
│                                                 │
│  INSTALLATION SECTION                          │
│                                                 │
│  For Community Agent:                           │
│  ┌──────────────────────────────────────────┐ │
│  │ Select Community to Install               │ │
│  │ ┌────────────────────────────────────┐  │ │
│  │ │ Choose a community...         ▼  │  │ │
│  │ │ - CS Study Group                  │  │ │
│  │ │ - Tech Innovators                 │  │ │
│  │ │ - Bookworms Club                  │  │ │
│  │ └────────────────────────────────────┘  │ │
│  │                                          │ │
│  │ ⓘ Only communities where you're an    │ │
│  │   admin are shown here                  │ │
│  └──────────────────────────────────────────┘ │
│                                                 │
│  For Personal Agent:                           │
│  ✓ Already Activated                          │
│    [Configure] [Deactivate]                   │
│                                                 │
│  ACTION BUTTONS                                 │
│  [Cancel]                    [Install Agent]   │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Component Props & States

```typescript
interface AgentDetailModalProps {
  agentType: 'moderation' | 'engagement' | 'knowledge_builder' | 'focus' | 
             'summarizer' | 'mood_tracker' | 'wellness';
  open: boolean;
  onClose: () => void;
  onSuccess?: (agentType: string, communityId?: number) => void;
  mode: 'discover' | 'manage';  // discover = from Explore, manage = from Community Settings
}

interface AgentDetailState {
  selectedCommunityId: number | null;
  loading: boolean;
  ownedCommunities: Community[];
  agentMetadata: AgentMetadata;
  activationStatus: 'not_activated' | 'activated' | 'installed';
  installationStats: {
    totalInstalls: number;
    activeInCommunities: number[];
    isUserActivated: boolean;
  };
}
```

### Key Interactions

```
1. OPEN MODAL
   ├─ Fetch agent metadata from agent_registry
   ├─ Check if user has agent activated (personal agents)
   ├─ Load user's admin communities
   └─ Render appropriate section based on agent category

2. COMMUNITY SELECTOR CHANGE
   ├─ Check if agent already installed
   ├─ Validate user is still admin of selected community
   └─ Enable/Disable install button

3. INSTALL BUTTON CLICK
   ├─ Validate permissions
   ├─ POST /api/agents/install/community/{id}
   ├─ Show loading state
   ├─ Display success toast
   └─ Close modal (optionally auto-redirect)

4. CONFIGURE BUTTON CLICK (Already Installed)
   ├─ Close detail modal
   └─ Open AgentSettingsModal

5. DEACTIVATE BUTTON CLICK (Personal Agent)
   ├─ Show confirmation dialog
   ├─ DELETE /api/agents/deactivate/personal/{agent_type}
   └─ Show success toast
```

### Styling Details

```tsx
// Header Section
- Icon: 80px × 80px, centered
- Color: gradient matching agent (blue for summarizer, red for moderation, etc.)
- Glow effect: Box shadow with agent color at 30% opacity
- Title: text-2xl font-bold, primary text color
- Badge: "Community Agent" or "Personal Agent" label

// Features List
- Layout: 2-column grid (for screen width > 600px)
- Icon: CheckCircle icon + agent color
- Text: text-sm, secondary color
- Animation: Slide in from left with 50ms stagger

// Buttons
- Primary (Install): Gradient with agent color, hover scale transform
- Secondary (Cancel): Ghost style with primary border
- Disabled: 50% opacity, cursor-not-allowed
- Loading: Spinner inside button, text hidden
```

---

## ⚙️ Modal 2: Agent Settings Modal

**Purpose:** Configure agent behavior and settings per community/user  
**Trigger Points:**
- "Configure" button in AgentDetailModal
- "Settings" button next to installed agent in Community Settings
- "Configure" button in user's personal agents list

### Layout Structure

```
┌─────────────────────────────────────────────────┐
│  ⚙️ Configure Moderation Agent                  │ ✕
├─────────────────────────────────────────────────┤
│                                                 │
│  AGENT INFO (Compact)                           │
│  🛡️ Moderation Agent · Community              │
│  Installed in "CS Study Group"                  │
│                                                 │
│ ─────────────────────────────────────────────  │
│                                                 │
│  SETTINGS SECTIONS (Agent-Specific)             │
│                                                 │
│  📊 SENSITIVITY SETTINGS                        │
│  ┌─────────────────────────────────────────┐  │
│  │ Detection Sensitivity          [●  ○ ○] │  │
│  │ Low      Medium      High               │  │
│  │ 🔍 What gets detected more...            │  │
│  │ ▪ Mild language → Not flagged            │  │
│  │ ▪ Moderate profanity → Flagged           │  │
│  │ ▪ Severe abuse → Blocked                 │  │
│  └─────────────────────────────────────────┘  │
│                                                 │
│  ⚡ ACTION SETTINGS                             │
│  ┌─────────────────────────────────────────┐  │
│  │ ☐ Auto-delete flagged messages          │  │
│  │ ☑ Notify user of violation              │  │
│  │ ☑ Log violations in moderation panel    │  │
│  │ ☐ Assign user warnings (auto-ban 5x)    │  │
│  └─────────────────────────────────────────┘  │
│                                                 │
│  🌍 LANGUAGE SETTINGS                          │
│  ┌─────────────────────────────────────────┐  │
│  │ ☑ Roman Urdu Support                    │  │
│  │ ☑ Detect Slang & Transliterated Text    │  │
│  │ ☑ Emoji Sentiment Analysis              │  │
│  │ ☐ Urdu Script Support                   │  │
│  └─────────────────────────────────────────┘  │
│                                                 │
│ ─────────────────────────────────────────────  │
│                                                 │
│  PREVIEW / EXAMPLES                             │
│  Test Message: "Stupid idiot"                  │
│  🚨 Severity: High | Action: Block             │
│                                                 │
│ ─────────────────────────────────────────────  │
│                                                 │
│  ACTION BUTTONS                                 │
│  [Reset to Default]  [Save Changes]  [Close]   │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Settings by Agent Type

#### **MODERATION AGENT**
```typescript
interface ModerationSettings {
  // Sensitivity
  sensitivity: 'low' | 'medium' | 'high';
  
  // Auto-actions
  auto_delete_high_severity: boolean;
  auto_warn_user: boolean;
  auto_ban_threshold: number;  // e.g., 5 violations
  
  // Notifications
  notify_user_of_violation: boolean;
  notify_admins: boolean;
  
  // Language Support
  roman_urdu_enabled: boolean;
  slang_detection: boolean;
  emoji_analysis: boolean;
  
  // Custom Rules
  blocked_words: string[];
  whitelisted_users: number[];
}
```

#### **ENGAGEMENT AGENT**
```typescript
interface EngagementSettings {
  // Suggestions
  auto_suggestions_enabled: boolean;
  suggestion_frequency: 'low' | 'medium' | 'high';  // hours between suggestions
  
  // Activity Types
  enable_polls: boolean;
  enable_icebreakers: boolean;
  enable_challenges: boolean;
  enable_prompts: boolean;
  
  // Inactivity Detection
  inactivity_threshold_hours: number;
  min_members_for_suggestions: number;
}
```

#### **KNOWLEDGE BUILDER AGENT**
```typescript
interface KnowledgeBuilderSettings {
  // Auto-extraction
  auto_extract_enabled: boolean;
  
  // Quality Control
  min_quality_threshold: number;  // 0.0 - 1.0
  require_manual_approval: boolean;
  
  // Categories
  extract_faqs: boolean;
  extract_decisions: boolean;
  extract_definitions: boolean;
  
  // Tagging
  auto_tag_enabled: boolean;
  custom_tags: string[];
}
```

#### **FOCUS AGENT**
```typescript
interface FocusSettings {
  // Detection
  drift_detection_enabled: boolean;
  drift_threshold: number;  // 0.0 - 1.0
  
  // Reporting
  show_focus_score: boolean;
  weekly_report: boolean;
  
  // Rules
  allowed_topic_shifts: number;
  report_frequency: 'daily' | 'weekly' | 'monthly';
}
```

#### **SUMMARIZER AGENT (Personal)**
```typescript
interface SummarizerSettings {
  // Style
  summary_style: 'bullet_points' | 'paragraph' | 'mixed';
  length: 'short' | 'medium' | 'long';
  
  // Content
  include_participants: boolean;
  include_sentiment: boolean;
  include_decisions: boolean;
  
  // Triggers
  auto_summarize_after_messages: number;  // 0 = disabled
}
```

#### **MOOD TRACKER AGENT (Personal)**
```typescript
interface MoodTrackerSettings {
  // Language
  roman_urdu_enabled: boolean;
  emoji_detection: boolean;
  
  // Notifications
  daily_mood_summary: boolean;
  alert_on_negative_trend: boolean;
  
  // Privacy
  store_history: boolean;
  history_retention_days: number;
}
```

#### **WELLNESS AGENT (Personal)**
```typescript
interface WellnessSettings {
  // Reminders
  break_reminders_enabled: boolean;
  break_interval_hours: number;
  
  // Notifications
  send_notifications: boolean;
  notification_time: string;  // HH:MM format
  
  // Analysis
  monitor_stress: boolean;
  suggest_activities: boolean;
  weekly_wellness_report: boolean;
}
```

### Component Props & States

```typescript
interface AgentSettingsModalProps {
  agentType: string;
  communityId?: number;  // For community agents
  userId?: number;       // For personal agents
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface SettingsModalState {
  currentSettings: Record<string, any>;
  defaultSettings: Record<string, any>;
  hasChanges: boolean;
  loading: boolean;
  saving: boolean;
  validationErrors: Record<string, string>;
  previewData?: {
    testInput: string;
    expectedOutput: string;
  };
}
```

### Key Interactions

```
1. LOAD MODAL
   ├─ Fetch current settings from API
   ├─ Load default settings from agent_registry
   ├─ Render agent-specific form
   └─ Generate preview/examples

2. SETTING CHANGE
   ├─ Update local state
   ├─ Mark form as "hasChanges"
   ├─ Validate setting constraints
   ├─ Update preview (if applicable)
   └─ Enable "Save Changes" button

3. SLIDER/TOGGLE CHANGE
   ├─ Update state
   ├─ Show real-time preview of effect
   └─ Display tooltip explaining the change

4. SAVE BUTTON CLICK
   ├─ Validate all settings
   ├─ PUT /api/agents/configure/{type}
   ├─ Show loading spinner
   ├─ Display success toast
   └─ Update local cache

5. RESET BUTTON CLICK
   ├─ Show confirmation dialog
   ├─ Restore settings to defaults
   ├─ Clear validation errors
   └─ Disable "Save Changes" button

6. CLOSE BUTTON CLICK
   ├─ If hasChanges:
   │  └─ Show "Unsaved changes" dialog
   └─ Close modal
```

### Styling & Components

```tsx
// Form Sections
- Layout: Vertical stack with dividers
- Each section: Card-like container with light background
- Icon: Agent color + section name
- Transition: Smooth height animation for expandable sections

// Slider Component
- Track: Gradient from low (blue) to high (red)
- Thumb: Interactive, shows value tooltip on hover
- Labels: Low, Medium, High with colors

// Toggle/Checkbox
- Style: Modern toggle switch (not native checkbox)
- Animation: Smooth color transition
- Label: Beside toggle, clickable
- Help text: Secondary color, font-size: sm

// Multi-select (for blocked words, tags, etc.)
- Input: Text field with autocomplete
- Tags: Removable pills with icon
- Add: Press Enter to add new item
- Example values: Shown as placeholder

// Button Group
- Alignment: Right-aligned in footer
- Spacing: 8px gap
- Primary action: Right-most button
- Danger action (Reset): Different color
```

---

## ❌ Modal 3: Agent Confirm Dialog

**Purpose:** Confirm destructive actions  
**Trigger Points:**
- Click "Uninstall" button in Community Settings
- Click "Deactivate" in Personal Agents list

### Layout Structure

```
┌────────────────────────────────────────┐
│  ⚠️ Uninstall Agent?                   │ ✕
├────────────────────────────────────────┤
│                                        │
│  Are you sure you want to uninstall    │
│  the Moderation Agent from your        │
│  "CS Study Group" community?           │
│                                        │
│  This action:                          │
│  • Stops all automatic moderation      │
│  • Won't delete past moderation logs   │
│  • Can be reinstalled anytime          │
│                                        │
│ ────────────────────────────────────  │
│                                        │
│  [Cancel]          [Uninstall Agent]   │
│                                        │
│                   (Button is red/warn) │
└────────────────────────────────────────┘
```

### Component Props

```typescript
interface AgentConfirmDialogProps {
  open: boolean;
  type: 'uninstall' | 'deactivate' | 'delete_data' | 'reset';
  agentName: string;
  communityName?: string;
  onCancel: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
}
```

---

## 🎨 Modal 4: Agent Command Reference (Personal Agents)

**Purpose:** Show keyboard shortcuts and commands for personal agents  
**Trigger Points:**
- "How to use" button in personal agent card
- "?" icon next to agent name

### Layout Structure

```
┌─────────────────────────────────────────────┐
│  📝 Summarizer Agent - Quick Reference      │ ✕
├─────────────────────────────────────────────┤
│                                             │
│  COMMANDS                                   │
│                                             │
│  /summarize [optional: number_of_messages]  │
│  └─ Summarizes last messages in chat        │
│                                             │
│  /summarize 50                              │
│  └─ Summarizes last 50 messages             │
│                                             │
│  EXAMPLES                                   │
│                                             │
│  Your Message:                              │
│  /summarize                                 │
│                                             │
│  Agent Response:                            │
│  📋 Summary (Last 100 messages)              │
│  • Key point 1                              │
│  • Key point 2                              │
│  • Decision made                            │
│                                             │
│  SETTINGS                                   │
│                                             │
│  📊 Current Settings:                       │
│  • Style: Bullet Points                     │
│  • Length: Medium                           │
│  • Include sentiment: Yes                   │
│                                             │
│  [Configure Settings]                       │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 🔌 Integration Points

### 1. Explore Section (Discovery)

**File:** `Frontend/src/pages/DiscoverCommunities.tsx`

When user clicks agent card:

```typescript
const handleAgentCardClick = (agent: AgentMetadata) => {
  setSelectedAgent(agent);
  setDetailModalOpen(true);
  // OR
  navigate(`/explore/agents/${agent.agent_type}`);  // URL-based discovery
};
```

### 2. Community Settings Integration

**File:** `Frontend/src/pages/CommunitySettings.tsx`

Add "Agents" tab:

```typescript
<Tab label="Agents" icon={<Bot />}>
  <CommunityAgentsTab 
    communityId={communityId}
    onConfigureAgent={(agentType) => setSettingsModal({
      open: true,
      agentType,
      communityId
    })}
    onUninstallAgent={(agentType) => setConfirmDialog({
      open: true,
      type: 'uninstall',
      agentType
    })}
  />
</Tab>
```

### 3. User Profile / Settings Integration

**File:** `Frontend/src/pages/UserSettings.tsx` or `Frontend/src/pages/Profile.tsx`

Add "My Agents" section:

```typescript
<Section title="My Agents">
  <PersonalAgentsList 
    agents={userAgents}
    onActivate={(agentType) => setDetailModal({...})}
    onConfigure={(agentType) => setSettingsModal({...})}
    onDeactivate={(agentType) => setConfirmDialog({...})}
  />
</Section>
```

### 4. Navigation & Routing

**File:** `Frontend/src/router/routes.ts`

```typescript
{
  path: '/explore',
  element: <DiscoverCommunities />,
  children: [
    {
      path: 'agents/:agentType',
      element: <AgentDetailModal />,  // Direct URL navigation
    }
  ]
},
{
  path: '/community/:id/agents/:agentType/settings',
  element: <ProtectedRoute><AgentSettingsModal /></ProtectedRoute>
}
```

---

## 🎭 Theme Integration

All modals respect the existing theme system:

```typescript
// From ThemeContext
const { currentTheme, isDarkMode } = useTheme();

// Apply theme classes
<div className={`
  ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}
  ${currentTheme === 'basic' ? 'rounded-lg' : 'rounded-2xl'}
  border border-[hsl(var(--theme-border-default))]
`}>
```

### Color Mapping by Agent

```tsx
const agentColors: Record<string, string> = {
  moderation: 'red',        // 🛡️ Red theme
  engagement: 'emerald',    // 🎯 Green theme
  knowledge_builder: 'indigo',  // 📚 Indigo theme
  focus: 'orange',          // 🎯 Orange theme
  summarizer: 'blue',       // 📝 Blue theme
  mood_tracker: 'pink',     // 😊 Pink theme
  wellness: 'purple'        // 🧘 Purple theme
};
```

---

## 📊 State Management

### Using React Context + Hooks

```typescript
// Create new context for agent modals
interface AgentModalState {
  detailModal: {
    open: boolean;
    agentType: string | null;
    mode: 'discover' | 'manage';
  };
  settingsModal: {
    open: boolean;
    agentType: string | null;
    communityId?: number;
  };
  confirmDialog: {
    open: boolean;
    type: 'uninstall' | 'deactivate';
    agentType: string | null;
  };
}

// Custom hook
const useAgentModals = () => {
  const [state, setState] = useState<AgentModalState>({...});
  
  return {
    openDetailModal: (agentType, mode) => {...},
    closeDetailModal: () => {...},
    openSettingsModal: (agentType, communityId) => {...},
    closeSettingsModal: () => {...},
    openConfirmDialog: (type, agentType) => {...},
    closeConfirmDialog: () => {...},
    // ... more actions
  };
};
```

---

## 🧪 Component Interaction Flow

```
SCENARIO 1: Community Admin Installing Moderation Agent
═══════════════════════════════════════════════════════

1. Admin: Navigate to Explore → AI Agents tab
2. System: Render AgentCatalogSection with all agents
3. Admin: Click on "Moderation Agent" card
4. System: Open AgentDetailModal in 'discover' mode
5. Admin: Select "CS Study Group" from dropdown
6. Admin: Click "Install Agent" button
7. System: POST /api/agents/install/community/{id}
8. System: Show success toast
9. System: Auto-navigate to Community Settings → Agents tab
10. System: Show "Moderation Agent" as installed
11. Admin: Click "Configure" button
12. System: Open AgentSettingsModal
13. Admin: Adjust sensitivity to "High"
14. Admin: Toggle "Auto-delete high severity" ON
15. Admin: Click "Save Changes"
16. System: PUT /api/agents/configure/community/{id}/moderation
17. System: Show success toast and close modal


SCENARIO 2: User Activating Summarizer Agent
════════════════════════════════════════════

1. User: Navigate to Explore → AI Agents → Personal Agents
2. System: Render summarizer card with "Activate" button
3. User: Click "Activate" button
4. System: Open AgentDetailModal in 'discover' mode
5. System: Show activation section (no community selector)
6. User: Click "Activate Agent" button
7. System: POST /api/agents/activate/personal
8. System: Show success toast
9. System: Auto-navigate to chat
10. User: Type "/summarize" command in any chat
11. System: Check if summarizer is activated
12. System: Call POST /api/agents/summarize/channel/{id}
13. System: Display summary in chat as system message


SCENARIO 3: User Deactivating Personal Agent
═════════════════════════════════════════════

1. User: Navigate to Settings → My Agents
2. System: Show list of activated agents
3. User: Click "Deactivate" on Mood Tracker
4. System: Open AgentConfirmDialog
5. User: Click "Deactivate" button
6. System: DELETE /api/agents/deactivate/personal/mood_tracker
7. System: Show success toast
8. System: Auto-remove from list
9. User: Cannot use /mood command anymore
```

---

## 📱 Responsive Behavior

### Mobile (< 768px)
```
- Modals: Full screen with bottom sheet animation
- Settings: Single column layout
- Buttons: Full width, stacked vertically
- Scrollable content area
- Sticky header with close button
```

### Tablet (768px - 1024px)
```
- Modals: 90vw width, centered
- Settings: Single/dual column based on content
- Buttons: Side-by-side if space allows
```

### Desktop (> 1024px)
```
- Modals: 600px width, centered with backdrop blur
- Settings: Dual column layout for complex settings
- Buttons: Inline with proper spacing
- Hover effects on all interactive elements
```

---

## ✨ Animation & Transitions

```typescript
// Modal entrance/exit
<motion.div
  initial={{ opacity: 0, scale: 0.95 }}
  animate={{ opacity: 1, scale: 1 }}
  exit={{ opacity: 0, scale: 0.95 }}
  transition={{ duration: 0.2, ease: "easeOut" }}
>
  {/* Content */}
</motion.div>

// Settings section expand
<motion.section
  initial={{ opacity: 0, height: 0 }}
  animate={{ opacity: 1, height: 'auto' }}
  transition={{ duration: 0.3 }}
>
  {/* Settings */}
</motion.section>

// Feature list item entrance (stagger)
<motion.li
  initial={{ opacity: 0, x: -20 }}
  animate={{ opacity: 1, x: 0 }}
  transition={{ delay: index * 0.05 }}
>
  {/* Feature */}
</motion.li>
```

---

## 🔐 Permission & Validation

### Pre-Modal Validation

Before opening any modal:

```typescript
const validateAgentAction = (action: string, agentType: string, communityId?: number): boolean => {
  switch (action) {
    case 'install':
      // Must be admin of community
      return isAdminOfCommunity(communityId);
    
    case 'uninstall':
      // Must be admin of community
      return isAdminOfCommunity(communityId);
    
    case 'configure':
      // Must be admin of community (for community agents)
      // Any user (for personal agents)
      return agentCategory === 'personal' || isAdminOfCommunity(communityId);
    
    case 'activate':
      // Must be authenticated user
      return isLoggedIn();
    
    case 'deactivate':
      // Must be authenticated user
      return isLoggedIn();
  }
};
```

### In-Modal Permission Checks

```
- Load user's communities via API (filter for admin role)
- Check agent already installed (show "Already installed" state)
- Disable buttons if user loses permission mid-action (websocket update)
- Show permission denied error if API call fails with 403
```

---

## 🚀 Implementation Checklist

### Phase 1: Component Structure
- [ ] Create `AgentDetailModal.tsx`
- [ ] Create `AgentSettingsModal.tsx`
- [ ] Create `AgentConfirmDialog.tsx`
- [ ] Create `AgentCommandModal.tsx`
- [ ] Create `AgentCatalogSection.tsx` (for Explore page)
- [ ] Create `CommunityAgentsList.tsx` (for Community Settings)
- [ ] Create `PersonalAgentsList.tsx` (for User Settings)
- [ ] Create `AgentStatusBadge.tsx` (reusable status display)

### Phase 2: Context & State Management
- [ ] Create `useAgentModals` custom hook
- [ ] Add to `AIAgentContext` or new `AgentModalContext`
- [ ] Implement modal state persistence (if needed)
- [ ] Add error boundary for modal errors

### Phase 3: Integration
- [ ] Update `DiscoverCommunities.tsx` to use new modals
- [ ] Update `CommunitySettings.tsx` to add Agents tab
- [ ] Update user profile/settings to show My Agents
- [ ] Wire up all event handlers and API calls

### Phase 4: Styling & Polish
- [ ] Apply theme system to all modals
- [ ] Add animations and transitions
- [ ] Implement responsive design for mobile/tablet
- [ ] Test accessibility (WCAG 2.1 AA)

### Phase 5: Testing
- [ ] Test all user flows end-to-end
- [ ] Test permission validation
- [ ] Test error handling
- [ ] Performance testing (modal opens in <200ms)
- [ ] Cross-browser testing

### Phase 6: Deprecation
- [ ] Remove `AIAgentPanel.tsx` references
- [ ] Remove from right sidebar
- [ ] Update imports in all files
- [ ] Delete deprecated file

---

## 📝 Notes & Specifications

### Error States
```
- Network error: Show retry button
- Permission denied: Show message "Contact community admin"
- Server error: Show generic error with support link
- Invalid input: Show validation message below field
```

### Loading States
```
- Modal open: Show skeleton loaders for agent metadata
- API call: Show spinner in button, disable interaction
- Large list: Paginate or virtualize (100+ items)
```

### Empty States
```
- No communities: "Create or join a community first"
- No agents installed: "No agents in this community"
- No personal agents: "Activate agents from Explore"
```

### Success States
```
- Installation: Toast + redirect to settings
- Configuration: Toast + stay in modal (auto-close after 2s)
- Deactivation: Toast + remove from list
```

---

**Status:** ✅ Ready for Component Development  
**Estimated Dev Time:** 2-3 weeks  
**Testing Time:** 1 week  
**Total Implementation:** 3-4 weeks
