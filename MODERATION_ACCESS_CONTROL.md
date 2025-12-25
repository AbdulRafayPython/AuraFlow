# Smart Moderation Agent – Role-Based Access Control Implementation

## Overview
This document describes the implementation of role-based access control for the Smart Moderation Agent system, ensuring owners have exclusive access to moderation features while protecting member privacy.

## Implementation Date
${new Date().toISOString().split('T')[0]}

---

## ✅ Completed Features

### 1. Owner Immunity from Moderation
**Backend**: `Backend/routes/messages.py`
- Owner messages skip moderation entirely
- No violations logged for owners
- Implemented in `send_message` endpoint before moderation check

```python
# Check user role - owners bypass moderation
if user_role == 'owner':
    # Insert message without moderation
    # ... direct insertion logic
```

### 2. Owner-Only UI Access
**Frontend Components Updated**:

#### a) ModerationAgent Component
**File**: `Frontend/src/components/ai-agents/ModerationAgent.tsx`
- Added role check using `currentCommunity?.role === 'owner'`
- Returns access denied UI for non-owners
- Returns "no community selected" for null community
- Integrated with useRealtime hook for community context

**Key Changes**:
- Import `useRealtime` hook
- Check `isOwner = currentCommunity?.role === 'owner'`
- Conditional rendering with Lock icon for non-owners
- Pass `community_id` and optional `channel_id` to all API calls

#### b) AIAgentPanel Component
**File**: `Frontend/src/components/ai-agents/AIAgentPanel.tsx`
- Moderation agent card only shown to owners
- Uses spread operator to conditionally include agent
- Import `useRealtime` hook

```typescript
...(isOwner ? [{
  id: 'moderation',
  name: 'Moderation',
  ...
}] : [])
```

### 3. Community-Scoped Moderation Logs
**Backend**: `Backend/routes/agents.py`
- `GET /api/agents/moderation/history`: Requires `community_id` query param
- `GET /api/agents/moderation/stats`: Requires `community_id` query param
- Both endpoints filter by `channels.community_id` via JOIN
- Optional `channel_id` parameter for channel-specific filtering
- Owner-only access check via `role='owner'` validation

**Frontend Services**:
**File**: `Frontend/src/services/aiAgentService.ts`
- `getModerationHistory(communityId, channelId?, limit)`: Builds query string with community_id
- `getModerationStats(communityId, days, channelId?)`: Now supports optional channel filtering

**Frontend Context**:
**File**: `Frontend/src/contexts/AIAgentContext.tsx`
- Updated type signatures to require `communityId` parameter
- Updated implementations to pass community and channel IDs

### 4. Socket-Based User Removal
**Backend**: `Backend/routes/messages.py`
- Emits `community:removed` event on `remove_user` and `block_user` actions
- Payload includes: `community_id`, `user_id`, `reason` (violation-based or blocked)

```python
socketio.emit('community:removed', {
    'community_id': community_id,
    'user_id': user_id,
    'reason': 'Repeated violations - removed from community'
}, room=f"user_{user_id}")
```

**Frontend Socket Service**:
**File**: `Frontend/src/services/socketService.ts`
- Added `CommunityRemovedHandler` type
- Registered `community:removed` socket event listener
- Added `onCommunityRemoved(handler)` method
- Added `leaveCommunity(communityId)` method to disconnect from all community rooms

**Frontend Realtime Context**:
**File**: `Frontend/src/contexts/RealtimeContext.tsx`
- Subscribed to `community:removed` event
- Removes community from local state
- Switches to next available community or redirects to `/home`
- Calls `socketService.leaveCommunity()` to clean up socket rooms
- Clears messages and channels for removed community

### 5. Home Page Fallback
**New Component**: `Frontend/src/pages/Home.tsx`
- Created dedicated page for users with no communities
- Features:
  - Welcome message explaining no community access
  - "Create Community" CTA button
  - "Wait for Invitation" option
  - Warning notice about blocked users needing admin contact
  - Full dark mode support

**Routing Updates**:
**File**: `Frontend/src/App.tsx`
- Added `/home` route
- AppRouter checks `communities.length === 0` and renders `<Home />` component
- Auto-redirect when removed from last community

### 6. Message ID Logging Fix
**Backend**: `Backend/agents/moderation.py`
- `moderate_message()` accepts optional `message_id` parameter
- `_log_moderation_action()` writes `message_id` to database
- Manual logging after message INSERT in all escalation paths

**Backend**: `Backend/routes/messages.py`
- Call `log_moderation_action()` after message INSERT
- Pass `message_id` from database result
- Logs for each escalation action (warn, remove_message, remove_user, block_user)

---

## 🔧 Technical Details

### Backend Architecture

#### Role Checking
```python
# Get user's role in community
user_role = db.get_user_role_in_community(user_id, community_id)

# Skip moderation for owners
if user_role == 'owner':
    # Direct message insertion without moderation
```

#### Community Scoping
```sql
-- Moderation history query
SELECT a.* FROM ai_agent_logs a
JOIN channels c ON a.channel_id = c.id
WHERE c.community_id = %s
  AND (%s IS NULL OR a.channel_id = %s)
ORDER BY a.created_at DESC
LIMIT %s
```

#### Socket Events
- Event: `community:removed`
- Room: `user_{user_id}` (private room)
- Payload: `{ community_id, user_id, reason }`

### Frontend Architecture

#### Role Context Flow
1. `RealtimeProvider` loads communities with `role` field
2. `currentCommunity` includes `role: 'owner' | 'admin' | 'member'`
3. Components check `currentCommunity?.role === 'owner'`
4. Conditional rendering based on role

#### Socket Event Handling
1. Listen for `community:removed` event
2. Filter community from state
3. Select next community or null
4. If no communities → navigate to `/home`
5. Call `socketService.leaveCommunity(communityId)`

#### API Request Flow
```typescript
// Component
const loadHistory = async () => {
  await getModerationHistory(currentCommunity.id, 10, currentChannel?.id);
};

// Context
const getModerationHistory = async (communityId, limit, channelId?) => {
  return await aiAgentService.getModerationHistory(communityId, channelId, limit);
};

// Service
async getModerationHistory(communityId, channelId?, limit) {
  let url = `/api/agents/moderation/history?community_id=${communityId}&limit=${limit}`;
  if (channelId) url += `&channel_id=${channelId}`;
  // ...
}
```

---

## 📁 Files Modified

### Backend
1. `Backend/routes/messages.py` - Owner immunity, socket emission
2. `Backend/routes/agents.py` - Community scoping, owner-only endpoints
3. `Backend/agents/moderation.py` - Message ID logging support

### Frontend - Core Services
1. `Frontend/src/services/socketService.ts` - Community removed event handling
2. `Frontend/src/services/aiAgentService.ts` - Community/channel ID parameters

### Frontend - State Management
1. `Frontend/src/contexts/RealtimeContext.tsx` - Socket listener, community removal logic
2. `Frontend/src/contexts/AIAgentContext.tsx` - Updated moderation API signatures

### Frontend - Components
1. `Frontend/src/components/ai-agents/ModerationAgent.tsx` - Owner-only access control
2. `Frontend/src/components/ai-agents/AIAgentPanel.tsx` - Conditional moderation agent display

### Frontend - Pages
1. `Frontend/src/pages/Home.tsx` - New home page for users with no communities
2. `Frontend/src/App.tsx` - Home route and no-community redirect

---

## 🧪 Testing Checklist

### Owner Access
- [x] Owner can see moderation agent in AI panel
- [x] Owner can access moderation history
- [x] Owner can access moderation stats
- [x] Owner messages skip moderation entirely
- [x] No violations logged for owner messages

### Member Access
- [x] Members cannot see moderation agent in AI panel
- [x] Members see "Owner Access Required" if accessing /agent/moderation directly
- [x] Member violations are logged and escalated properly

### Community Scoping
- [x] Moderation logs filtered by current community
- [x] No cross-community data leakage
- [x] Channel-specific filtering works (optional)

### Removal Flow
- [x] Socket event emitted on remove_user action
- [x] Socket event emitted on block_user action
- [x] User removed from community state
- [x] User switches to next available community
- [x] User redirected to /home if no communities remain
- [x] Socket rooms properly cleaned up

### Home Page
- [x] Shows when user has no communities
- [x] Provides create/join options
- [x] Displays blocked user notice
- [x] Supports dark mode

---

## 🚀 Deployment Notes

### Database Migrations
Ensure these migrations have run:
1. `add_violation_count_column.sql` - Adds violation_count to community_members
2. `add_blocked_users_table.sql` - Creates blocked_users table

### Environment Variables
No new environment variables required.

### Socket.IO Configuration
Ensure Socket.IO server is properly configured to:
- Support private user rooms (`user_{user_id}`)
- Emit to specific users via room targeting
- Handle `leave_community` event

---

## 📊 API Endpoints Summary

### Moderation Endpoints (Owner-Only)

#### GET /api/agents/moderation/history
**Query Parameters**:
- `community_id` (required) - Filter by community
- `limit` (optional, default 10) - Number of records
- `channel_id` (optional) - Filter by specific channel

**Response**:
```json
{
  "history": [
    {
      "id": 1,
      "action": "warn",
      "severity": "low",
      "channel_id": 5,
      "message_id": 123,
      "user_id": 10,
      "created_at": "2024-01-15T10:30:00Z",
      "details": {...}
    }
  ]
}
```

#### GET /api/agents/moderation/stats
**Query Parameters**:
- `community_id` (required) - Filter by community
- `days` (optional, default 7) - Time period
- `channel_id` (optional) - Filter by specific channel

**Response**:
```json
{
  "stats": {
    "total_messages": 1000,
    "flagged_messages": 15,
    "removed_messages": 3,
    "violations_by_severity": {
      "low": 8,
      "medium": 5,
      "high": 2
    }
  }
}
```

---

## 🔐 Security Considerations

### Backend Validation
- All moderation endpoints check `role='owner'` before returning data
- Community ID validated against user's membership
- Message ID logged for audit trail
- Blocked users stored per community in separate table

### Frontend Defense-in-Depth
- UI hidden for non-owners (UX protection)
- Backend enforces access control (security layer)
- Socket events only sent to affected user's private room
- Community context validated before API calls

### Data Isolation
- Logs scoped to community via JOIN on channels.community_id
- No cross-community data exposure
- Optional channel filtering for granular access
- User-specific rooms for removal events

---

## 📝 Future Enhancements

### Potential Improvements
1. **Audit Log Export**: Allow owners to download moderation history CSV
2. **Appeal System**: Let blocked users submit appeals to owners
3. **Moderation Dashboard**: Dedicated page with charts and trends
4. **Auto-Escalation Rules**: Configurable thresholds per community
5. **Whitelist/Blacklist Words**: Community-specific content filters
6. **Member Violation History**: Show user's past violations in profile
7. **Notification on Removal**: Email/push notification when removed
8. **Temporary Bans**: Time-based blocks instead of permanent

### Technical Debt
- Consider caching moderation stats for performance
- Add pagination for large moderation histories
- Implement rate limiting on moderation API endpoints
- Add comprehensive logging for debugging removal events

---

## 📞 Support & Troubleshooting

### Common Issues

**Issue**: User not redirected to /home after removal
**Solution**: Check RealtimeContext listener registration and navigation logic

**Issue**: Moderation agent still visible to members
**Solution**: Verify currentCommunity.role is properly set from API response

**Issue**: Cross-community logs showing
**Solution**: Ensure community_id is passed to all moderation API calls

**Issue**: Socket event not received
**Solution**: Verify user is in the correct socket room (`user_{user_id}`)

---

## ✅ Acceptance Criteria Met

All 10 requirements from the specification have been implemented:

1. ✅ **Owner Immunity**: Owners bypass moderation entirely
2. ✅ **Owner-Only UI**: Moderation panel hidden from members
3. ✅ **Community Scoping**: All logs filtered by community_id
4. ✅ **Channel Filtering**: Optional channel_id parameter supported
5. ✅ **Violation Escalation**: Implemented (warn→remove→remove user→block)
6. ✅ **Socket Removal**: Emits community:removed on user removal
7. ✅ **Automatic Redirect**: Navigates to next community or /home
8. ✅ **Home Page Fallback**: Created with no-community messaging
9. ✅ **Blocked Users**: Cannot rejoin via blocked_users table check
10. ✅ **Member Privacy**: Members only see warnings, no AI details

---

## 📚 Related Documentation
- [EMOJI_REACTIONS_IMPLEMENTATION.md](../EMOJI_REACTIONS_IMPLEMENTATION.md)
- [BACKEND_APIS_GUIDE.md](../Backend/BACKEND_APIS_GUIDE.md)
- [ARCHITECTURE_DIAGRAMS.md](../ARCHITECTURE_DIAGRAMS.md)

---

**Document Version**: 1.0
**Last Updated**: ${new Date().toISOString()}
**Implementation Status**: ✅ Complete
