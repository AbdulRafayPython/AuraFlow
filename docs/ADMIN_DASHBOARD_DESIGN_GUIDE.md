# AuraFlow - Admin Dashboard Design Guide

**Document Version:** 1.0  
**Date:** January 26, 2026  
**Project:** AuraFlow - Intelligent Real-Time Communication with AI Agents  
**FYP Stage:** Phase 1 Implementation

---

## Table of Contents

1. [Missing Features Analysis](#missing-features-analysis)
2. [Admin Dashboard Overview](#admin-dashboard-overview)
3. [Dashboard Layout Structure](#dashboard-layout-structure)
4. [Sidebar Navigation](#sidebar-navigation)
5. [Detailed Page Flows](#detailed-page-flows)
6. [User Interaction Flows](#user-interaction-flows)
7. [Technical Data Structure](#technical-data-structure)
8. [Backend API Endpoints](#backend-api-endpoints)
9. [UI Components Checklist](#ui-components-checklist)
10. [Roles & Permissions](#roles--permissions)

---

## Missing Features Analysis

### FYP 1 Status: ~55-60% Complete (Need 15-20% more)

#### Implementation Status by Component

| Area | Completion % | Gap |
|------|--------------|-----|
| AI Agents | 63% | 4 agents missing (Translator, AI Assistant, Context Support, Auto Message Generator) |
| Frontend Pages | 30% | 5+ dashboard pages missing |
| Database Layer | 60% | MongoDB & Redis missing |
| File Handling | 10% | Almost no file upload functionality |
| Admin Features | 20% | Minimal moderation interface |
| **Overall FYP 1** | **~55-60%** | **Need 15-20% more** |

#### Critical Missing Agents & Features

| Feature | Status | Location | Priority |
|---------|--------|----------|----------|
| **Translator Agent** (Roman Urdu ↔ English) | ❌ Missing | Backend Agent | **HIGH** |
| **AI Assistant Agent** (Q&A, jokes, general chatbot) | ❌ Missing | Backend Agent | **HIGH** |
| **Context-Aware Support Agent** (Vector DB Q&A) | ❌ Missing | Backend Agent | **HIGH** |
| **Auto Message Generator Agent** (Welcome msgs, templates) | ❌ Missing | Backend Agent | **MEDIUM** |

#### Missing Dashboard & Analytics Pages

**Frontend Pages:**
- ❌ **Admin Dashboard** - Comprehensive moderation logs, analytics, user management
- ❌ **Mood Analytics Dashboard** - Visual charts/trends for mood data
- ❌ **Engagement Reports** - Dashboard showing engagement metrics & trends
- ❌ **Knowledge Base Dashboard** - Organized view of extracted FAQs & topics
- ❌ **Community Analytics** - Overall community statistics & health metrics

**Missing Chart/Visualization Components:**
- ❌ Line charts for mood trends over time
- ❌ Bar charts for engagement metrics
- ❌ Heatmaps for community activity patterns
- ❌ Admin moderation statistics dashboard

---

## Admin Dashboard Overview

### What is the Admin Dashboard?

The Admin Dashboard is a **comprehensive management interface** for administrators to:
- Monitor platform health and community wellness
- Review and manage flagged content
- View detailed analytics and metrics
- Manage users and their roles/permissions
- Track AI agent performance
- Generate reports

### Key Purpose

Provide admins with **real-time visibility** into:
1. **Moderation**: Flagged content, blocked users, violations
2. **Analytics**: Community health, mood trends, engagement metrics
3. **Users**: User management, activity logs, role assignments
4. **Communities**: Community stats, member management, channel organization
5. **Reports**: Daily/weekly summaries, custom reports, data exports

---

## Dashboard Layout Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ADMIN DASHBOARD                              │
├──────────────┬───────────────────────────────────────────────────────┤
│              │                                                        │
│   SIDEBAR    │                    MAIN CONTENT AREA                  │
│  (Fixed)     │          (Responsive, scrollable)                    │
│              │                                                        │
│ • Overview   ├─  [Breadcrumb: Dashboard > Moderation > Users]       │
│ • Moderation │                                                        │
│ • Analytics  │  [TOP STATS CARDS]                                   │
│ • Users      │  ┌──────────┬──────────┬──────────┬──────────┐       │
│ • Communities│  │ Total    │ Flagged  │ Toxic    │ Blocked  │       │
│ • Reports    │  │ Messages │ Messages │ Messages │ Users    │       │
│ • Settings   │  │ 4.2K     │ 127      │ 43       │ 12       │       │
│              │  └──────────┴──────────┴──────────┴──────────┘       │
│              │                                                        │
│              │  [FILTERS & SEARCH]                                  │
│              │  [Date Range] [Status] [Category] [Search]           │
│              │                                                        │
│              │  [DATA TABLE / CHART / CARDS]                        │
│              │  (Content changes based on sidebar selection)         │
│              │                                                        │
└──────────────┴───────────────────────────────────────────────────────┘
```

### Layout Components

**Header (Top):**
- AuraFlow Logo + Dashboard Title
- Breadcrumb navigation
- Theme toggle
- User profile + Logout

**Sidebar (Left):**
- Main navigation menu
- Fixed width (250px)
- Collapsible on mobile
- Icons + Labels for each section

**Main Content Area (Right):**
- Dynamic content based on sidebar selection
- Fully responsive
- Scrollable when content exceeds viewport

---

## Sidebar Navigation

```
📊 ADMIN DASHBOARD SIDEBAR

├── 🏠 Overview
│   └─ Quick stats, recent alerts, AI agent health
│
├── 🚨 Moderation
│   ├─ Flagged Messages
│   ├─ Blocked Users
│   ├─ Moderation Logs
│   ├─ Content Reports
│   └─ Moderation Stats
│
├── 📈 Analytics
│   ├─ Community Health
│   ├─ Engagement Trends
│   ├─ Mood Analytics
│   ├─ User Activity
│   └─ Performance Metrics
│
├── 👥 Users
│   ├─ User Management
│   ├─ User Roles
│   ├─ Activity Logs
│   └─ Banned Users
│
├── 🏢 Communities
│   ├─ Community List
│   ├─ Community Settings
│   ├─ Member Management
│   └─ Channel Management
│
├── 📋 Reports
│   ├─ Daily Summary
│   ├─ Weekly Report
│   ├─ Custom Reports
│   └─ Export Data
│
└── ⚙️ Settings
    ├─ System Settings
    ├─ AI Agent Config
    ├─ Notification Rules
    └─ Admin Permissions
```

---

## Detailed Page Flows

### PAGE 1: OVERVIEW DASHBOARD

**User Flow:**
```
User clicks "Overview" → Loads Overview Page
│
├─ Top Section:
│  ├─ Welcome card: "Welcome back, Admin!"
│  ├─ Quick stats (4 cards):
│  │  ├─ Total Messages (Last 24h)
│  │  ├─ Active Users (Live count)
│  │  ├─ Communities
│  │  └─ Flagged Items (Red alert)
│  │
│  └─ AI Agent Health (Badge status):
│     ├─ ✅ Summarizer: Active
│     ├─ ✅ Mood Tracker: Active
│     ├─ ⚠️ Moderation: Slow
│     ├─ ✅ Engagement: Active
│     └─ ❌ Knowledge Builder: Offline
│
├─ Middle Section:
│  ├─ Recent Alerts (Table with latest flags):
│  │  ├─ Timestamp | User | Reason | Status | Action
│  │  ├─ 2:34 PM | john123 | Toxic content | Flagged | Review
│  │  ├─ 2:12 PM | jane_doe | Spam | Resolved | -
│  │  └─ 1:45 PM | user456 | Harassment | Flagged | Review
│  │
│  └─ System Activity (Mini line chart):
│     └─ Messages per hour (last 24h trend)
│
└─ Bottom Section:
   ├─ Top Communities (By activity)
   ├─ Top Users (By message count)
   └─ Recent Actions Log (Admin actions audit trail)
```

---

### PAGE 2: MODERATION - FLAGGED MESSAGES

**User Flow:**
```
User clicks "Moderation" → "Flagged Messages" (default tab)
│
├─ FILTER BAR:
│  ├─ Date Range Picker (From - To)
│  ├─ Status Filter: [All ▼] [Flagged] [Reviewing] [Resolved] [Dismissed]
│  ├─ Flag Type: [All ▼] [Toxic] [Spam] [Inappropriate] [Other]
│  ├─ Community Filter: [All Communities ▼]
│  ├─ Severity: [All ▼] [Low] [Medium] [High] [Critical]
│  └─ Search: [Search by username or message content...]
│
├─ RESULTS SUMMARY:
│  └─ "Showing 127 flagged messages | Page 1 of 8"
│
├─ DATA TABLE/CARDS:
│  ├─ Message Card/Row:
│  │  ├─ User Avatar | Username | Time
│  │  ├─ Message Preview: "This is offensive content..."
│  │  ├─ Flag Info: 🚨 Toxic (AI Confidence: 92%) | Severity: HIGH
│  │  ├─ Community: #general | Channel: #random
│  │  ├─ Status Badge: [FLAGGED] [REVIEWING] [RESOLVED]
│  │  └─ Actions:
│  │     ├─ [View Full] [Review] [Approve] [Delete] [Warn User] [More...]
│  │
│  ├─ Expandable Details:
│  │  ├─ Full message text
│  │  ├─ User profile preview (username, created_at, message_count)
│  │  ├─ Previous violations (count & history)
│  │  ├─ AI Analysis:
│  │  │  ├─ Type: Toxic
│  │  │  ├─ Confidence: 92%
│  │  │  ├─ Reason: Contains abusive language
│  │  │  ├─ Action Recommended: Warn + Delete
│  │  │  └─ Detected Keywords: [abusive] [harmful]
│  │  │
│  │  └─ Admin Actions Available:
│  │     ├─ ✓ Approve (dismiss flag)
│  │     ├─ ✗ Delete Message
│  │     ├─ ⚠️ Warn User (send notification)
│  │     ├─ 🔒 Temporary Mute (1h, 24h, 7d)
│  │     ├─ 🚫 Permanent Ban User
│  │     └─ 📝 Add Note (for record)
│  │
│  └─ Pagination: [< 1 2 3 4 5 >] | Export Results CSV/PDF
│
└─ BULK ACTIONS (if multiple selected):
   ├─ ☐ Select All
   ├─ Bulk Actions: [Delete Selected] [Mark as Resolved] [Approve All]
   └─ ☐ User1 ☐ User2 ☐ User3...
```

---

### PAGE 3: MODERATION - BLOCKED USERS

**User Flow:**
```
User clicks "Moderation" → "Blocked Users" tab
│
├─ FILTER BAR:
│  ├─ Status: [All ▼] [Active Block] [Temporary] [Expired]
│  ├─ Block Reason: [All ▼] [Toxicity] [Spam] [Harassment] [Violation]
│  ├─ Sort: [Blocked Date ▼] [Username] [Violations]
│  └─ Search: [Search by username...]
│
├─ RESULTS SUMMARY:
│  └─ "12 blocked users | 3 permanent, 9 temporary"
│
├─ DATA TABLE:
│  ├─ Blocked User Entry:
│  │  ├─ Avatar | Username | Email | Last Active
│  │  ├─ Block Details:
│  │  │  ├─ Reason: Repeated toxic behavior
│  │  │  ├─ Type: [Permanent] or [Until: Jan 30, 2026]
│  │  │  ├─ Total Violations: 5
│  │  │  ├─ Blocked By: admin_name
│  │  │  └─ Blocked On: Jan 26, 2026
│  │  │
│  │  └─ Actions:
│  │     ├─ [View Profile] [View Violations] [Unblock] [Extend Block] [More...]
│  │
│  └─ Repeat for each blocked user...
│
└─ QUICK ACTIONS:
   └─ [Add to Blocked List] [Temporary Ban] [Permanent Ban]
```

---

### PAGE 4: ANALYTICS - COMMUNITY HEALTH

**User Flow:**
```
User clicks "Analytics" → "Community Health"
│
├─ FILTER BAR:
│  ├─ Community Filter: [All Communities ▼]
│  ├─ Time Range: [Last 7 days ▼] [Last 30 days] [Last 90 days] [Custom]
│  └─ Metrics: [All ▼] [Activity] [Sentiment] [Engagement] [Safety]
│
├─ TOP CARDS (4 main metrics):
│  ├─ 📊 Overall Health: 87% ↑ (Good)
│  ├─ 💬 Message Volume: 2.3K ↑ (Trending up)
│  ├─ 😊 Avg Sentiment: Positive (72%) | Neutral (22%) | Negative (6%)
│  └─ 🛡️ Safety Score: 94% (Safe)
│
├─ CHARTS SECTION:
│  ├─ Message Volume Over Time (Line Chart):
│  │  └─ X-axis: Dates | Y-axis: Message count | Lines per community
│  │
│  ├─ Sentiment Distribution (Pie/Donut Chart):
│  │  └─ Positive (72%) | Neutral (22%) | Negative (6%)
│  │
│  ├─ User Activity Heatmap:
│  │  └─ Days of week × Hours of day (color intensity = activity level)
│  │
│  ├─ Top Communities by Activity (Bar Chart):
│  │  └─ [Community1: 450 msgs] [Community2: 380 msgs] [Community3: 290 msgs]
│  │
│  └─ Safety Incidents Over Time (Area Chart):
│     └─ Flagged messages trend
│
└─ DETAILED TABLE:
   ├─ Community | Messages | Users | Avg Sentiment | Safety | Status
   ├─ Study Hub | 2.3K | 45 | Positive | 94% | ✅ Healthy
   ├─ General | 1.8K | 38 | Mixed | 89% | ⚠️ Needs Attention
   └─ Gaming | 920 | 22 | Positive | 98% | ✅ Healthy
```

---

### PAGE 5: ANALYTICS - MOOD TRENDS

**User Flow:**
```
User clicks "Analytics" → "Mood Trends"
│
├─ FILTER BAR:
│  ├─ Community: [All Communities ▼]
│  ├─ Time Range: [Last 7 days ▼]
│  ├─ User Group: [All Users ▼] [Active] [Inactive] [At Risk]
│  └─ Language: [All ▼] [English] [Roman Urdu] [Mixed]
│
├─ TOP CARDS:
│  ├─ 😊 Community Mood: Positive (68%)
│  ├─ 📈 Mood Trend: Improving ↑ (+5% from yesterday)
│  ├─ ⚠️ At-Risk Users: 8 (up from 6)
│  └─ 🎯 Dominant Emotion: Joy (34%) | Satisfaction (28%) | Neutral (22%)
│
├─ VISUALIZATIONS:
│  ├─ Sentiment Over Time (Line Chart, multi-line):
│  │  └─ Positive | Neutral | Negative trends
│  │
│  ├─ Emotion Distribution (Radar/Polar Chart):
│  │  └─ Joy | Sadness | Anger | Confidence | Satisfaction | Neutral
│  │
│  ├─ User Mood Status (Pie Chart):
│  │  └─ Positive (68%) | Neutral (18%) | Negative (14%)
│  │
│  ├─ Mood by Community (Grouped Bar Chart):
│  │  └─ For each community: Positive/Neutral/Negative split
│  │
│  └─ At-Risk Users List (Table):
│     ├─ Username | Current Mood | Trend | Last Message | Risk Level
│     ├─ user_123 | Negative | ↓ Declining | "feeling sad..." | 🔴 High
│     ├─ jane_doe | Neutral | ↓ Declining | "stressed lately" | 🟡 Medium
│     └─ john456 | Negative | ↔️ Stable | "exhausted" | 🟡 Medium
│
└─ WELLNESS RECOMMENDATIONS:
   └─ System auto-suggests sending wellness check-ins to at-risk users
      ├─ [Send Wellness Prompt] [View Details] [Log Note]
      └─ Bulk action: [Send to All At-Risk Users]
```

---

### PAGE 6: USERS - USER MANAGEMENT

**User Flow:**
```
User clicks "Users" → "User Management"
│
├─ FILTER BAR:
│  ├─ Status: [All ▼] [Active] [Inactive] [Banned] [Suspended]
│  ├─ Role: [All ▼] [User] [Moderator] [Admin] [Owner]
│  ├─ Join Date: [Anytime ▼] [Last 7 days] [Last 30 days]
│  ├─ Activity: [All ▼] [Very Active] [Active] [Inactive] [Dormant]
│  └─ Search: [Search by username, email...]
│
├─ RESULTS SUMMARY:
│  └─ "Showing 156 users | Page 1 of 8"
│
├─ DATA TABLE:
│  ├─ User Entry:
│  │  ├─ Avatar | Username | Email | Role | Status
│  │  ├─ Activity: Last seen 2h ago | 127 messages | 5 communities
│  │  ├─ Violations: 2 warnings, 0 bans
│  │  ├─ Account: Created Jan 15, 2026
│  │  │
│  │  └─ Actions:
│  │     ├─ [View Profile] [Edit Role] [View Messages] [Violations] [More...]
│  │
│  └─ Expandable Details:
│     ├─ User Stats:
│     │  ├─ Total Messages: 127
│     │  ├─ Communities: 5
│     │  ├─ Channels: 12
│     │  ├─ Current Mood: Positive
│     │  └─ Account Age: 11 days
│     │
│     └─ Admin Actions:
│        ├─ ✏️ Change Role: [User ▼] [Moderator] [Admin]
│        ├─ ⚠️ Send Warning
│        ├─ 🔒 Temporary Suspend: [1d] [7d] [30d]
│        ├─ 🚫 Permanently Ban
│        └─ 📝 Add Note
│
└─ BULK ACTIONS:
   ├─ ☐ Select All
   ├─ Bulk Actions: [Change Role] [Suspend] [Ban] [Send Message]
   └─ ☐ User1 ☐ User2 ☐ User3...
```

---

### PAGE 7: COMMUNITIES - COMMUNITY MANAGEMENT

**User Flow:**
```
User clicks "Communities" → "Community Management"
│
├─ FILTER BAR:
│  ├─ Status: [All ▼] [Active] [Inactive] [Pending Review]
│  ├─ Type: [All ▼] [Public] [Private]
│  ├─ Size: [All ▼] [Small <10] [Medium 10-50] [Large 50-100] [XL >100]
│  └─ Search: [Search by community name...]
│
├─ RESULTS SUMMARY:
│  └─ "45 communities | Page 1 of 2"
│
├─ COMMUNITY CARDS/TABLE:
│  ├─ Community Entry:
│  │  ├─ Logo | Community Name | Owner
│  │  ├─ Details:
│  │  │  ├─ Members: 47 users
│  │  │  ├─ Channels: 8
│  │  │  ├─ Messages: 2.3K (Last 30 days)
│  │  │  ├─ Created: Jan 10, 2026
│  │  │  ├─ Status: 🟢 Active
│  │  │  └─ Health: 87% (Good)
│  │  │
│  │  └─ Actions:
│  │     ├─ [View Details] [Edit] [Channels] [Members] [Settings] [More...]
│  │
│  └─ Expandable Details:
│     ├─ Description & Settings
│     ├─ Member List (table):
│     │  ├─ Username | Role | Joined | Status
│     │  └─ Bulk role change for members
│     │
│     ├─ Channel List:
│     │  ├─ Channel Name | Type | Messages | Activity
│     │  └─ Manage channels
│     │
│     └─ Admin Actions:
│        ├─ ✏️ Edit Community (name, description, settings)
│        ├─ 👥 Manage Members
│        ├─ 📢 Broadcast Message
│        ├─ 🔒 Change Privacy (Public/Private)
│        └─ 🗑️ Delete Community (with confirmation)
│
└─ QUICK STATS:
   └─ Total Members | Total Channels | Flagged Messages | Avg Sentiment
```

---

### PAGE 8: REPORTS - DAILY SUMMARY

**User Flow:**
```
User clicks "Reports" → "Daily Summary"
│
├─ DATE SELECTOR:
│  └─ [Date Picker: Select date or range]
│
├─ EMAIL STYLE REPORT:
│  ├─ HEADER:
│  │  └─ "AuraFlow Admin Report - Jan 26, 2026"
│  │
│  ├─ EXECUTIVE SUMMARY:
│  │  ├─ Total Messages: 4,217 (↑ 12% from yesterday)
│  │  ├─ Active Users: 234 (↑ 5%)
│  │  ├─ Communities: 45
│  │  ├─ Safety Score: 94% (Good)
│  │  └─ System Health: ✅ All systems operational
│  │
│  ├─ KEY METRICS:
│  │  ├─ 📊 Engagement:
│  │  │  ├─ Avg messages per user: 18
│  │  │  ├─ Peak activity: 2-3 PM
│  │  │  └─ Most active community: Study Hub
│  │  │
│  │  ├─ 🛡️ Moderation:
│  │  │  ├─ Flagged messages: 12 (↓ 8% from yesterday)
│  │  │  ├─ Toxic content: 4
│  │  │  ├─ Spam: 6
│  │  │  ├─ Users warned: 2
│  │  │  └─ Users banned: 0
│  │  │
│  │  ├─ 😊 Sentiment:
│  │  │  ├─ Positive: 72% (↑ 3%)
│  │  │  ├─ Neutral: 22%
│  │  │  ├─ Negative: 6%
│  │  │  └─ At-risk users: 8
│  │  │
│  │  └─ 🤖 AI Agents:
│  │     ├─ Summaries generated: 5
│  │     ├─ Knowledge items added: 12
│  │     ├─ Engagement activities: 3
│  │     └─ Avg response time: 2.3s
│  │
│  ├─ ALERTS & ACTIONS NEEDED:
│  │  ├─ 🔴 1 user approaching violation limit
│  │  ├─ 🟡 3 communities showing declining engagement
│  │  ├─ 🟡 2 flagged messages pending review
│  │  └─ ✅ No critical issues
│  │
│  ├─ TOP PERFORMERS:
│  │  ├─ Most active user: john_doe (47 messages)
│  │  ├─ Most engaged community: Study Hub (89% health)
│  │  └─ Highest sentiment: Gaming Hub (94% positive)
│  │
│  └─ BOTTOM PERFORMERS:
│     ├─ Least active community: Art Discussion (12 messages)
│     ├─ Lowest sentiment: General (6% negative)
│     └─ Most moderation issues: Random Chat (8 flags)
│
├─ EXPORT OPTIONS:
│  └─ [📥 Download PDF] [📥 Download CSV] [📧 Email Report] [📋 Print]
│
└─ PAGINATION:
   └─ [< Previous Day] [Next Day >] | Navigate to specific date
```

---

## User Interaction Flows

### FLOW A: Admin Reviews a Flagged Message

```
Step 1: Admin logs in & sees Dashboard
Step 2: Sees "127 flagged messages" card on Overview
Step 3: Clicks on it → Goes to Moderation > Flagged Messages
Step 4: Filters: Status = "Flagged" | Flag Type = "Toxic"
Step 5: Sees table with flagged messages
Step 6: Clicks "Review" on a message → Expands details
Step 7: Sees full message, user profile, AI analysis
Step 8: Takes action:
   - Option A: Approve (dismiss false positive)
   - Option B: Delete + Warn User
   - Option C: Delete + Temporary Mute
   - Option D: Delete + Ban User
Step 9: Adds optional note explaining action
Step 10: Confirms → Status changes to "Resolved"
Step 11: System logs the action in audit trail
```

---

### FLOW B: Admin Checks Community Health

```
Step 1: Admin notices "Community Health" card on Overview
Step 2: Clicks "View Details" → Analytics > Community Health
Step 3: Sees charts for all communities
Step 4: Filters by "Last 7 days"
Step 5: Identifies declining community: "General" (health: 62%)
Step 6: Clicks on "General" → Expands details
Step 7: Sees:
   - Message trend (declining)
   - Sentiment (more negative messages)
   - Recent moderation issues (5 flags in past 7 days)
Step 8: Takes action:
   - Option A: Send engagement boost (polls, icebreakers)
   - Option B: Send wellness check
   - Option C: Review and address moderation issues
Step 9: Clicks "Send Engagement Boost"
Step 10: System schedules engagement activities in that community
```

---

### FLOW C: Admin Generates Weekly Report

```
Step 1: Admin goes to Reports > Weekly Report
Step 2: Selects date range: "Last 7 days"
Step 3: Page loads pre-generated report with all metrics
Step 4: Reviews key highlights:
   - Total messages, active users
   - Top/bottom performing communities
   - Moderation summary
   - Sentiment analysis
   - AI agent performance
Step 5: Clicks "Export PDF" to download
Step 6: Email to stakeholders (optional)
```

---

## Technical Data Structure

### Admin Dashboard State (Frontend)

```typescript
interface AdminDashboardState {
  currentPage: 'overview' | 'moderation' | 'analytics' | 'users' | 'communities' | 'reports';
  subPage?: string;
  filters: {
    dateRange: [Date, Date];
    status?: string;
    community?: number;
    flagType?: string;
    severity?: string;
    searchQuery?: string;
    [key: string]: any;
  };
  data: {
    overviewStats: OverviewStats;
    flaggedMessages: FlaggedMessage[];
    blockedUsers: BlockedUser[];
    communities: CommunityInfo[];
    users: UserInfo[];
    analyticsData: AnalyticsData;
  };
  loading: boolean;
  error: string | null;
}

interface FlaggedMessage {
  id: number;
  message_id: number;
  username: string;
  avatar_url: string;
  messageText: string;
  flagType: 'toxic' | 'spam' | 'inappropriate' | 'other';
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  reason: string;
  actionRecommended: string;
  detectedKeywords: string[];
  community: string;
  channel: string;
  flaggedAt: Date;
  status: 'flagged' | 'reviewing' | 'resolved' | 'dismissed';
  userViolationHistory: number;
}

interface CommunityInfo {
  id: number;
  name: string;
  owner: string;
  logo_url: string;
  memberCount: number;
  channelCount: number;
  messageCount: number;
  createdAt: Date;
  health: number;
  avgSentiment: 'positive' | 'neutral' | 'negative';
  lastActive: Date;
}
```

---

## Backend API Endpoints

### Admin Endpoints to Implement

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/overview/stats` | GET | Get overview statistics |
| `/api/admin/moderation/flagged-messages` | GET | List flagged messages |
| `/api/admin/moderation/flagged-messages/<id>/resolve` | POST | Resolve flagged message |
| `/api/admin/moderation/blocked-users` | GET | List blocked users |
| `/api/admin/users/<id>/ban` | POST | Ban a user |
| `/api/admin/analytics/community-health` | GET | Community health metrics |
| `/api/admin/analytics/mood-trends` | GET | Mood trends data |
| `/api/admin/users` | GET | List users |
| `/api/admin/communities` | GET | List communities |
| `/api/admin/reports/daily` | GET | Daily report data |
| `/api/admin/reports/weekly` | GET | Weekly report data |
| `/api/admin/reports/export` | POST | Export report (PDF/CSV) |

---

## UI Components Checklist

### Components to Build

**Core Layout:**
- AdminSidebar
- AdminHeader
- AdminLayout

**Data Display:**
- StatsCard
- AlertCard
- DataTable
- FlaggedMessageCard
- UserCard
- CommunityCard

**Visualizations:**
- LineChart
- BarChart
- PieChart
- HeatmapChart
- AreaChart

**Interactions:**
- FilterBar
- ModalDialog
- ActionButton
- PaginationControls
- StatusBadge
- TrendIndicator
- ExportButton
- BulkActionBar

---

## Roles & Permissions

### System-Level Roles

```
1. 👑 SUPER ADMIN
   - Full platform access
   - Manage all users and communities
   - Configure system settings

2. 🔧 MODERATOR
   - Review and resolve flags
   - Warn/mute/ban users
   - View analytics

3. 👤 REGULAR USER
   - Send messages
   - Create communities
   - View own data
```

### Community-Level Roles

```
1. 👑 OWNER
   - Full community control
   - Delete community
   - Manage all members

2. 🛡️ ADMIN
   - Manage channels
   - Moderate content
   - Warn users

3. 👥 MEMBER
   - Send messages
   - View channels
   - Leave community
```

### Permission Matrix

| Action | Super Admin | Moderator | Owner | Member |
|--------|-------------|-----------|-------|--------|
| Create Community | ✅ | ✅ | ✅ | ✅ |
| Delete Community | ✅ | ❌ | ✅ | ❌ |
| Ban User | ✅ | ⚠️Temp | ✅ | ❌ |
| View Analytics | ✅ | ✅ | ✅ | Own |
| Manage Settings | ✅ | ❌ | ✅ | ❌ |
| Send Message | ✅ | ✅ | ✅ | ✅ |

---

## Implementation Roadmap

### Phase 1: Core Dashboard (CRITICAL)

- [ ] Implement backend API endpoints
- [ ] Create admin sidebar + layout
- [ ] Create overview dashboard
- [ ] Create moderation pages
- [ ] Create user management page

### Phase 2: Analytics (IMPORTANT)

- [ ] Create analytics pages
- [ ] Implement chart components
- [ ] Add filtering functionality
- [ ] Create mood trends visualization

### Phase 3: Reports (NICE-TO-HAVE)

- [ ] Create reports page
- [ ] Implement export functionality
- [ ] Add scheduled reports
- [ ] Email integration

---

**Document Complete!** 

Location: `/docs/ADMIN_DASHBOARD_DESIGN_GUIDE.md`

