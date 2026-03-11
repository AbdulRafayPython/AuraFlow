# 🎨 Agent Configuration Modal - Quick Visual Reference

**For:** Frontend Developers & UI Designers  
**Purpose:** Visual prompts and quick reference for implementing the new agent modal system

---

## 📋 Quick Navigation

1. [Component Breakdown](#component-breakdown)
2. [Modal Layouts](#modal-layouts)
3. [Styling Specifications](#styling-specifications)
4. [Interactive States](#interactive-states)
5. [Animation Keyframes](#animation-keyframes)
6. [Color & Icon Guide](#color--icon-guide)
7. [Responsive Breakpoints](#responsive-breakpoints)

---

## 🏗️ Component Breakdown

### Component Hierarchy

```
AgentModalsProvider (Context wrapper)
│
├── AgentDetailModal
│   ├── HeaderSection
│   │   ├── AgentIcon (large, gradient)
│   │   ├── AgentName + Badge
│   │   └── Description
│   ├── FeaturesSection
│   │   └── FeatureList (staggered animation)
│   ├── InstallationSection
│   │   ├── CommunitySelector (dropdown)
│   │   └── HelpText
│   └── ActionButtons
│       ├── CancelButton
│       └── PrimaryButton (Install/Activate)
│
├── AgentSettingsModal
│   ├── AgentInfoHeader
│   ├── FormSections (vertical stack)
│   │   ├── SliderSetting
│   │   ├── ToggleSetting
│   │   ├── MultiSelectSetting
│   │   └── PreviewSection
│   └── ActionButtons
│       ├── ResetButton
│       ├── SaveButton
│       └── CloseButton
│
├── AgentConfirmDialog
│   ├── IconWarning
│   ├── ConfirmText
│   ├── InfoList
│   └── ActionButtons
│
└── AgentCommandModal
    ├── CommandList
    ├── ExamplesSection
    └── SettingsReference
```

---

## 🎨 Modal Layouts

### Layout 1: Agent Detail Modal - Full Wireframe

```
┌────────────────────────────────────────────────┐
│  X                  [Modal Title Area]         │
├────────────────────────────────────────────────┤
│                                                │
│  [Icon Section]                                │
│      🛡️ (80x80px, centered)                   │
│      Gradient: agent color                     │
│      Glow: shadow + blur                       │
│                                                │
│  [Text Section]                                │
│      Moderation Agent                          │
│      🏷️ Community Agent                       │
│                                                │
│  ─────────────────────────────────────────   │
│                                                │
│  Description & Features                        │
│  [20px margin all sides]                       │
│  [Line height: 1.6]                            │
│                                                │
│  ✓ Feature 1 | ✓ Feature 5                    │
│  ✓ Feature 2 | ✓ Feature 6                    │
│  ✓ Feature 3 | ✓ Feature 7                    │
│  ✓ Feature 4 | ✓ Feature 8                    │
│                                                │
│  ─────────────────────────────────────────   │
│                                                │
│  [Installation Section]                        │
│  Label: "Select Community to Install"          │
│  Dropdown: [Choose a community...]      [▼]   │
│  Info: "Only communities where you're admin"   │
│                                                │
│  ─────────────────────────────────────────   │
│                                                │
│  [Button Area - Sticky Bottom]                 │
│  [Cancel]              [Install Agent]        │
│                                                │
└────────────────────────────────────────────────┘

Dimensions:
  Desktop: 600px width, 80vh max-height
  Tablet:  90vw width, 90vh max-height
  Mobile:  100vw, full height (bottom sheet)

Spacing:
  Padding: 24px (desktop), 16px (mobile)
  Gap between sections: 16px
  Button gap: 12px
```

### Layout 2: Agent Settings Modal - Full Wireframe

```
┌────────────────────────────────────────────────┐
│  ⚙️ Configure Moderation Agent          X     │
├────────────────────────────────────────────────┤
│                                                │
│  Agent Header (compact)                        │
│  🛡️ Moderation Agent · Installed Jul 15      │
│                                                │
│  ─────────────────────────────────────────   │
│                                                │
│  [Settings Sections - Scrollable]              │
│                                                │
│  📊 SENSITIVITY SETTINGS                       │
│  ┌──────────────────────────────────────┐    │
│  │ Detection Sensitivity                │    │
│  │ [●    ○    ○]                        │    │
│  │ Low   Medium   High                  │    │
│  │                                      │    │
│  │ ℹ️ Shows more detections              │    │
│  └──────────────────────────────────────┘    │
│                                                │
│  ⚡ ACTION SETTINGS                            │
│  ┌──────────────────────────────────────┐    │
│  │ ☐ Auto-delete flagged messages      │    │
│  │ ☑ Notify user of violation          │    │
│  │ ☑ Log violations                    │    │
│  │ ☐ Auto-warn users                   │    │
│  └──────────────────────────────────────┘    │
│                                                │
│  🌍 LANGUAGE SETTINGS                         │
│  ┌──────────────────────────────────────┐    │
│  │ ☑ Roman Urdu Support                │    │
│  │ ☑ Slang Detection                   │    │
│  │ ☑ Emoji Analysis                    │    │
│  │ ☐ Urdu Script                       │    │
│  └──────────────────────────────────────┘    │
│                                                │
│  ─────────────────────────────────────────   │
│                                                │
│  PREVIEW                                       │
│  Test: "That's stupid"                        │
│  Result: 🚨 High Severity | Action: Block     │
│                                                │
│  ─────────────────────────────────────────   │
│                                                │
│  [Reset Default]  [Save Changes]  [Close]    │
│                                                │
└────────────────────────────────────────────────┘
```

### Layout 3: Confirmation Dialog

```
┌──────────────────────────────────────┐
│  ⚠️  Uninstall Agent?            X   │
├──────────────────────────────────────┤
│                                      │
│  Are you sure you want to uninstall  │
│  the Moderation Agent from "CS       │
│  Study Group" community?             │
│                                      │
│  This action:                        │
│  • Stops automatic moderation        │
│  • Retains moderation logs           │
│  • Can be reinstalled anytime        │
│                                      │
│ ────────────────────────────────   │
│                                      │
│  [Cancel]    [Uninstall Agent]     │
│                       (red)          │
│                                      │
└──────────────────────────────────────┘

Dimensions:
  Width: 400px (desktop), 90vw (mobile)
  Max-width: 500px
```

---

## 🎨 Styling Specifications

### Typography Hierarchy

```
Modal Title (H1)
  Font: 20px / font-bold
  Color: text-primary
  Letter-spacing: -0.02em
  Example: "Configure Moderation Agent"

Section Header (H2)
  Font: 14px / font-semibold
  Color: text-primary
  Uppercase: text-transform: uppercase
  Letter-spacing: 0.05em
  Example: "SENSITIVITY SETTINGS"

Label (H3)
  Font: 13px / font-medium
  Color: text-primary
  Example: "Detect Sensitivity"

Description Text
  Font: 13px / font-normal
  Color: text-secondary
  Line-height: 1.5
  Example: "How sensitive the agent is..."

Helper Text
  Font: 12px / font-normal
  Color: text-muted (with opacity)
  Margin-top: 4px
  Example: "Only communities where you're admin"

Button Text
  Font: 13px / font-medium
  Color: white (primary), inherit (secondary)
  Text-transform: capitalize
  Example: "Install Agent"
```

### Spacing System (8px base)

```
xs  = 4px    (2px offset)
sm  = 8px    (1x)
md  = 12px   (1.5x)
lg  = 16px   (2x)
xl  = 24px   (3x)
2xl = 32px   (4x)

Default margins:
  Modal padding: 24px
  Section gap: 16px
  Control gap: 12px
  Field gap: 8px
```

### Border Radius

```
For 'basic' theme:
  All elements: 8px (rounded-lg)

For other themes:
  Cards/Modal background: 16px (rounded-2xl)
  Control backgrounds: 10px (rounded-lg)
  Buttons: 10px (rounded-lg)
  Icon containers: 12px (rounded-xl)
```

### Colors by Agent

```javascript
const agentColorSchemes = {
  moderation: {
    primary: 'rgb(239, 68, 68)',      // red-500
    light: 'rgb(254, 226, 226)',      // red-100
    dark: 'rgb(127, 29, 29)',         // red-900
    glow: 'rgba(239, 68, 68, 0.3)'
  },
  engagement: {
    primary: 'rgb(16, 185, 129)',     // emerald-500
    light: 'rgb(209, 250, 229)',      // emerald-100
    dark: 'rgb(5, 46, 22)',           // emerald-900
    glow: 'rgba(16, 185, 129, 0.3)'
  },
  knowledge_builder: {
    primary: 'rgb(99, 102, 241)',     // indigo-500
    light: 'rgb(224, 231, 255)',      // indigo-100
    dark: 'rgb(30, 27, 75)',          // indigo-900
    glow: 'rgba(99, 102, 241, 0.3)'
  },
  focus: {
    primary: 'rgb(249, 115, 22)',     // orange-500
    light: 'rgb(254, 237, 220)',      // orange-100
    dark: 'rgb(78, 22, 5)',           // orange-900
    glow: 'rgba(249, 115, 22, 0.3)'
  },
  summarizer: {
    primary: 'rgb(59, 130, 246)',     // blue-500
    light: 'rgb(219, 234, 254)',      // blue-100
    dark: 'rgb(23, 37, 84)',          // blue-900
    glow: 'rgba(59, 130, 246, 0.3)'
  },
  mood_tracker: {
    primary: 'rgb(236, 72, 153)',     // pink-500
    light: 'rgb(252, 231, 243)',      // pink-100
    dark: 'rgb(80, 7, 36)',           // pink-900
    glow: 'rgba(236, 72, 153, 0.3)'
  },
  wellness: {
    primary: 'rgb(168, 85, 247)',     // purple-500
    light: 'rgb(243, 232, 255)',      // purple-100
    dark: 'rgb(59, 7, 100)',          // purple-900
    glow: 'rgba(168, 85, 247, 0.3)'
  }
};
```

---

## 🎭 Interactive States

### Button States

```tsx
/* Default State */
background: primary-color
color: white
border: none
transform: scale(1)
opacity: 1

/* Hover State */
background: primary-color (darker)
transform: scale(1.02)
box-shadow: 0 0 20px rgba(primary, 0.3)
cursor: pointer

/* Active/Pressed State */
background: primary-color (darkest)
transform: scale(0.98)

/* Disabled State */
opacity: 0.5
cursor: not-allowed
transform: scale(1)
box-shadow: none

/* Loading State */
Show spinner icon inside
Text hidden (icon centered)
Disabled = true
cursor: wait
```

### Toggle/Switch States

```
Off State:
  Background: gray-600
  Circle: left side
  Animation: slide-left (200ms)

On State:
  Background: agent-primary
  Circle: right side
  Animation: slide-right (200ms)

Disabled:
  Opacity: 0.5
  Cursor: not-allowed
  No animation
```

### Dropdown States

```
Closed:
  Border: subtle gray
  Chevron: pointing right (▼)

Focused:
  Border: agent-color
  Background: slight highlight
  Outline: none (use border instead)

Open:
  Border: agent-color
  Chevron: pointing up (▲)
  Shadow: dropdown-shadow
  Z-index: 50

Option Hover:
  Background: light agent-color
  Cursor: pointer

Option Selected:
  Background: agent-color
  Color: white
  Icon: checkmark
```

### Input Field States

```
Empty:
  Border: gray
  Placeholder: visible
  Focus ring: none

Focused:
  Border: agent-color
  Focus ring: 2px solid agent-color
  Background: slight highlight

Filled:
  Border: gray
  Value: visible
  Focus ring: per focused state

Error:
  Border: red
  Text: red
  Below: error message
  Icon: warning-circle
```

### Slider States

```
Default:
  Track: gradient (blue to red)
  Thumb: circular, centered
  Value: displayed beside
  Background opacity: 20%

Hover:
  Thumb: enlarge slightly
  Show tooltip with value
  Track: opacity increase

Dragging:
  Thumb: scale(1.1)
  Tooltip: always visible
  Value updates in real-time
  Preview: updates immediately

Disabled:
  Opacity: 0.5
  Cursor: not-allowed
  No hover effects
```

---

## ✨ Animation Keyframes

### Modal Entrance Animation

```css
@keyframes modalSlideIn {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(20px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

/* Applied to modal container */
animation: modalSlideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
```

### Backdrop Animation

```css
@keyframes backdropFadeIn {
  from {
    opacity: 0;
    backdrop-filter: blur(0px);
  }
  to {
    opacity: 1;
    backdrop-filter: blur(4px);
  }
}

animation: backdropFadeIn 0.2s ease-out;
```

### Feature List Stagger

```css
@keyframes featureSlideIn {
  from {
    opacity: 0;
    transform: translateX(-20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

/* Applied to each feature with delay */
animation: featureSlideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
animation-delay: calc(index * 50ms);
```

### Button Hover Scale

```css
/* On button hover */
transform: scale(1.02);
transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
box-shadow: 0 0 20px rgba(agentColor, 0.3);
```

### Toggle Switch Animation

```css
@keyframes toggleSlide {
  /* Smooth slide for toggle switch circle */
  duration: 200ms;
  easing: cubic-bezier(0.4, 0, 0.2, 1);
}
```

### Settings Section Expand

```css
@keyframes sectionExpand {
  from {
    opacity: 0;
    max-height: 0;
    overflow: hidden;
  }
  to {
    opacity: 1;
    max-height: 500px;  /* Or auto with transition-group */
  }
}

animation: sectionExpand 0.3s ease-out;
```

---

## 🎨 Color & Icon Guide

### Icon Library (Use Lucide Icons)

```typescript
// Agent Icons (Large - 80x80px in detail modal)
import {
  Shield,           // Moderation
  TrendingUp,       // Engagement
  BookOpen,         // Knowledge Builder
  Focus,            // Focus
  Brain,            // Summarizer
  Heart,            // Mood Tracker & Wellness
  Settings,         // Settings
  X,                // Close
  ChevronDown,      // Dropdown
  Check,            // Checkmark
  AlertCircle,      // Warning
  Loader2,          // Loading spinner
  Zap,              // Power/Energy
  ShieldCheck       // Safety/Verified
} from 'lucide-react';
```

### Icon Usage

```
Agent Icons in Detail Modal:
  Size: 80x80px
  Stroke-width: 1.5
  Center: absolute positioning
  Wrapper: Icon container with color background

Section Icons in Settings Modal:
  Size: 20x20px
  Stroke-width: 2
  Color: Agent primary color
  Position: Left of section title

Status Icons:
  Size: 16x16px
  Stroke-width: 2
  Colors: 
    Success: emerald-400
    Error: red-400
    Warning: amber-400
    Pending: gray-400

Button Icons:
  Size: 16x16px (inside buttons)
  Color: inherit from button
  Margin-right: 8px
```

### Badge & Badge Colors

```
Category Badge (in detail modal):
  Background: light agent color
  Text: agent color
  Shape: pill (border-radius: 999px)
  Padding: 4px 12px
  Font-size: 12px
  Example: "🏷️ Community Agent"

Status Badge (in settings):
  Background: status color
  Text: white
  Icon + text
  Example: "Active", "Inactive", "Pending"

Alert Badge (on agent card):
  Background: gradient red
  Text: white
  Shape: rounded pill
  Size: 24px
  Font: bold 10px
  Animation: pulse
  Example: "5"
```

---

## 📱 Responsive Breakpoints

### Mobile First (< 640px)

```css
/* Modal */
width: 100vw;
height: 100vh;
border-radius: 16px 16px 0 0;  /* Top rounded only */
position: fixed;
bottom: 0;
left: 0;
animation: slideUp 0.3s ease-out;

/* Padding */
padding: 16px;

/* Buttons */
width: 100%;
display: flex;
flex-direction: column;
gap: 8px;
position: sticky;
bottom: 0;

/* Layout */
grid-template-columns: 1fr;  /* Single column */

/* Font */
font-size: 14px;  /* Slightly smaller */
```

### Tablet (640px - 1024px)

```css
/* Modal */
width: 90vw;
height: 90vh;
max-width: 500px;
border-radius: 12px;
position: absolute;
top: 50%;
left: 50%;
transform: translate(-50%, -50%);

/* Padding */
padding: 20px;

/* Buttons */
width: auto;
flex-direction: row;
gap: 10px;
position: sticky;

/* Layout */
grid-template-columns: repeat(2, 1fr);  /* 2 columns */

/* Font */
font-size: 14px;
```

### Desktop (> 1024px)

```css
/* Modal */
width: 600px;
height: auto;
max-height: 80vh;
border-radius: 16px;
position: absolute;
top: 50%;
left: 50%;
transform: translate(-50%, -50%);

/* Padding */
padding: 24px;

/* Buttons */
width: auto;
flex-direction: row;
gap: 12px;
position: sticky;

/* Layout */
grid-template-columns: repeat(3, 1fr);  /* 3 columns */

/* Font */
font-size: 14px;
```

### Specific Component Adjustments

```
Feature Grid:
  Mobile: 1 column
  Tablet: 2 columns
  Desktop: 2 columns (side by side)

Settings Sections:
  Mobile: Stack full width
  Tablet: Stack full width
  Desktop: Optional 2-column (advanced settings)

Input Fields:
  Mobile: Full width
  Tablet: Full width or 2-column if space
  Desktop: Full width in modal

Overflowing Content (descriptions, lists):
  Mobile: Font size 13px, truncate or wrap
  Tablet: Font size 13px, normal wrap
  Desktop: Font size 14px, normal wrap
```

---

## 🎯 Quick Copy-Paste Templates

### Agent Detail Modal Structure

```tsx
<Dialog open={open} onOpenChange={onClose}>
  <DialogContent className="max-w-[600px]">
    
    {/* Header with Icon */}
    <div className="flex flex-col items-center gap-4">
      <div className={`w-20 h-20 rounded-2xl ${colorClasses.bg} flex items-center justify-center`}>
        <AgentIcon className={`w-10 h-10 ${colorClasses.text}`} />
      </div>
      <div className="text-center">
        <h2 className="text-2xl font-bold">{agent.display_name}</h2>
        <span className="inline-block mt-2 px-3 py-1 rounded-full text-xs bg-gray-200 text-gray-700">
          {agent.category} Agent
        </span>
      </div>
    </div>

    {/* Description */}
    <p className="text-center text-gray-600">{agent.description}</p>

    {/* Features */}
    <div className="grid grid-cols-2 gap-3">
      {features.map((f, i) => (
        <div key={i} className="flex items-start gap-2">
          <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
          <span className="text-sm">{f}</span>
        </div>
      ))}
    </div>

    {/* Installation Section */}
    {agent.category === 'community' ? (
      <div>
        <label className="block text-sm font-medium mb-2">
          Select Community to Install
        </label>
        <select className="w-full px-3 py-2 border rounded-lg">
          <option>Choose a community...</option>
          {communities.map(c => <option key={c.id}>{c.name}</option>)}
        </select>
      </div>
    ) : (
      <div className="text-center py-2">
        {agent.is_activated ? (
          <span className="text-green-600">✓ Already Activated</span>
        ) : (
          <span className="text-gray-600">Ready to activate</span>
        )}
      </div>
    )}

    {/* Buttons */}
    <div className="flex gap-3">
      <Button variant="outline" onClick={onClose}>Cancel</Button>
      <Button className={buttonClasses} onClick={handleInstall}>
        {buttonText}
      </Button>
    </div>

  </DialogContent>
</Dialog>
```

### Settings Modal Toggle/Checkbox

```tsx
<div className="space-y-4">
  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
    <div>
      <label className="text-sm font-medium">Auto-delete High Severity</label>
      <p className="text-xs text-gray-500 mt-1">Automatically remove serious violations</p>
    </div>
    <label className="relative inline-flex items-center cursor-pointer">
      <input
        type="checkbox"
        checked={settings.auto_delete}
        onChange={(e) => updateSetting('auto_delete', e.target.checked)}
        className="sr-only"
      />
      <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
    </label>
  </div>
</div>
```

### Loading State

```tsx
<Button disabled className="opacity-50 cursor-not-allowed">
  <Loader2 className="w-4 h-4 animate-spin mr-2" />
  <span className="invisible">Installing...</span>
</Button>
```

---

## 📢 Key Design Principles

1. **Clarity First** - Users should know exactly what will happen
2. **Progressive Disclosure** - Show details only when needed
3. **Visual Feedback** - Always show what's happening
4. **Accessibility** - Meet WCAG 2.1 AA standards
5. **Consistency** - Use existing theme system throughout
6. **Performance** - Modals open in < 200ms
7. **Responsiveness** - Works on all screen sizes
8. **Error Prevention** - Confirm before destructive actions

---

**Version:** 1.0  
**Last Updated:** February 22, 2026  
**Status:** ✅ Ready for Implementation
