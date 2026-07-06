"""
Engagement Agent for AuraFlow
Boosts conversation engagement with smart suggestions and ice-breaking activities.

Autonomous role (Phase 3.1): subscribes to ``channel.silent`` (published
by ``services.presence._silence_probe_loop`` at 15 / 60 / 240-min
buckets) and emits a nudge socket event into the silent channel. The
prompt template is picked via an ε-greedy bandit over the existing
``conversation_starters`` categories, with rewards persisted in
``agent_state.thresholds.category_rewards`` per channel. This replaces
the legacy 30-minute fixed-cron sweep with reactive scheduling.
"""

import json
import os
import random
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from collections import Counter

from database import get_db_connection
from agents.base import AutonomousAgent
from agents import event_bus as _event_bus
from agents import memory as _agent_memory
from agents._settings import get_community_settings
from services.redis_client import get_redis as _get_redis


# Per-channel nudge cooldown. Set to the documented 6-hour spec
# (docs/AUTONOMOUS_AGENTS_PLAN.md §4.4), NOT the silence probe's 1-hour
# re-fire cadence. Matching the probe cadence (the original value) was the
# spam bug: the cooldown expired exactly as the next channel.silent event
# arrived, so it never actually blocked and a still-silent channel got
# re-nudged every single hour.
_COOLDOWN_SECONDS = 6 * 60 * 60  # 6 hours

# TTL on the per-channel nudge claim. The base-class cooldown is durable but
# only enforced *within* one orchestrator process: it reads last_acted_at,
# then acts, then stamps it — so two orchestrator loops (a stray second
# Celery worker, or a second app.py running its own silence probe — both
# common after restarts on Windows) each read "no recent act", both pass the
# cooldown, and both post the same starter. An atomic Redis SET NX collapses
# that fan-out to a single post across every process. TTL is derived from
# _COOLDOWN_SECONDS so the "claim window == cooldown window" invariant holds
# by construction — if one changes, so does the other. See
# auto_message._claim_welcome for the same pattern.
_NUDGE_DEDUPE_TTL = _COOLDOWN_SECONDS


_ENGAGEMENT_DEFAULTS = {
    'auto_analyze': True,
    'analysis_interval': 30,    # minutes
    'track_threads': True,
    'leaderboard': True,
    'inactivity_alerts': False,
}


class EngagementAgent(AutonomousAgent):
    """
    Analyzes conversation patterns and suggests engagement boosters
    Provides conversation starters, ice-breakers, polls, and activity suggestions
    """

    # ── Autonomous contract (Phase 3.1) ─────────────────────────────
    NAME = "engagement"
    GOAL = {"revive_silent_channels": True, "low_intrusiveness": True}
    SUBSCRIBES = [_event_bus.TOPIC_CHANNEL_SILENT]
    SCOPE_TYPE = _agent_memory.SCOPE_CHANNEL
    # 6h per channel — see _COOLDOWN_SECONDS above (AUTONOMOUS_AGENTS_PLAN §4.4).
    COOLDOWN_SECONDS = _COOLDOWN_SECONDS

    # Minimum bucket we'll act on. Anything shorter is just typical
    # background quiet, not actionable.
    _MIN_BUCKET_MINUTES = 15

    # Give-up cap: after this many consecutive nudges into a channel that
    # never woke up (no human message arrived between nudges), stop nudging
    # it entirely until a real message resets the counter. Stands in for the
    # documented "last nudge was not 👎'd" check — there's no real per-nudge
    # dismissal signal today, so "channel stayed silent through N nudges" is
    # the proxy for "these nudges aren't landing."
    _MAX_CONSECUTIVE_IGNORED = 3

    def __init__(self):
        """Initialize the engagement agent"""
        self.min_silence_minutes = 5
        self.conversation_starters = self._load_conversation_starters()
        self.icebreaker_activities = self._load_icebreaker_activities()
        self.quick_polls = self._load_quick_polls()
        self.fun_challenges = self._load_fun_challenges()
        
    def _load_conversation_starters(self) -> Dict[str, List[str]]:
        """Load conversation starter templates"""
        return {
            'general': [
                "What's everyone working on today?",
                "Anyone have interesting plans for the weekend?",
                "What's the best thing that happened to you this week?",
                "If you could learn any skill instantly, what would it be?",
                "What's a topic you could talk about for hours?",
                "What's the most interesting thing you've read/watched recently?",
                "What's your go-to comfort food?",
                "What achievement are you most proud of?"
            ],
            'tech': [
                "What's your favorite programming language and why?",
                "Anyone working on an interesting project?",
                "What's the coolest tech you've learned recently?",
                "What's your go-to development tool?",
                "Share a coding tip that improved your productivity",
                "What's the most frustrating bug you've ever fixed?",
                "Tabs or spaces? 😄",
                "What tech trend are you most excited about?"
            ],
            'casual': [
                "What's everyone up to today? 😊",
                "Kya chal raha hai yaar? (What's going on?)",
                "Anyone up for a quick chat?",
                "What's making you happy today?",
                "Share something that made you smile recently",
                "What song is stuck in your head right now? 🎵",
                "What's your current mood in one emoji?",
                "Any plans for today?"
            ],
            'icebreaker': [
                "Two truths and a lie - go!",
                "What's your unpopular opinion?",
                "Describe yourself in 3 emojis",
                "What's a skill you wish you had?",
                "Coffee or tea? ☕",
                "Morning person or night owl? 🌙",
                "What's your hidden talent?",
                "What would you do if you won the lottery?"
            ],
            'motivational': [
                "What's keeping you motivated today? 💪",
                "Share a goal you're working towards!",
                "What's one small win you had recently?",
                "What advice would you give to your past self?",
                "What's something you're grateful for today?"
            ]
        }
    
    def _load_icebreaker_activities(self) -> Dict[str, List[Dict]]:
        """Load structured ice-breaker activities"""
        return {
            'quick_questions': [
                {
                    'title': '🎯 Would You Rather',
                    'description': 'Classic game of tough choices!',
                    'questions': [
                        "Would you rather have the ability to fly or be invisible?",
                        "Would you rather live without music or without movies?",
                        "Would you rather explore space or the deep ocean?",
                        "Would you rather have unlimited money or unlimited time?",
                        "Would you rather be famous or be rich?"
                    ],
                    'duration': '5 min'
                },
                {
                    'title': '🤔 This or That',
                    'description': 'Quick-fire preference game',
                    'questions': [
                        "Pizza 🍕 or Biryani 🍚?",
                        "Movies 🎬 or TV Shows 📺?",
                        "Beach 🏖️ or Mountains ⛰️?",
                        "Books 📚 or Podcasts 🎧?",
                        "Early bird 🌅 or Night owl 🦉?"
                    ],
                    'duration': '3 min'
                },
                {
                    'title': '💭 Finish The Sentence',
                    'description': 'Complete these sentences with your answer',
                    'questions': [
                        "My favorite way to relax is...",
                        "If I could have dinner with anyone, it would be...",
                        "The best trip I ever took was...",
                        "One thing on my bucket list is...",
                        "The app I use most is..."
                    ],
                    'duration': '5 min'
                }
            ],
            'games': [
                {
                    'title': '🎭 Emoji Story',
                    'description': 'Tell a story using only emojis, others guess!',
                    'instructions': [
                        "One person shares a story using 5-7 emojis",
                        "Others try to guess what the story is about",
                        "The storyteller reveals the answer",
                        "Next person's turn!"
                    ],
                    'example': "🏠➡️🚗➡️🏪➡️🍕➡️🏠 (Went to get pizza!)",
                    'duration': '10 min'
                },
                {
                    'title': '🔢 Number Game',
                    'description': 'Share interesting numbers about yourself',
                    'instructions': [
                        "Share a number that means something to you",
                        "Others guess what it represents",
                        "Example: '7' - years I've been coding!"
                    ],
                    'duration': '5 min'
                },
                {
                    'title': '📝 Word Association',
                    'description': 'Quick word chain game',
                    'instructions': [
                        "Someone says a word",
                        "Next person says the first word that comes to mind",
                        "Keep the chain going!",
                        "Example: Sun → Beach → Waves → Surfing"
                    ],
                    'duration': '5 min'
                }
            ],
            'team_building': [
                {
                    'title': '🌟 Appreciation Round',
                    'description': 'Share something positive about the community',
                    'instructions': [
                        "Take turns appreciating something/someone",
                        "Can be about a person, helpful message, or the community",
                        "Spread positivity! ✨"
                    ],
                    'duration': '5 min'
                },
                {
                    'title': '🎯 Common Ground',
                    'description': 'Find things everyone has in common',
                    'instructions': [
                        "Someone suggests a category (movies, food, hobbies)",
                        "Everyone shares their favorite in that category",
                        "Find what you have in common!",
                        "Great for building connections 🤝"
                    ],
                    'duration': '10 min'
                },
                {
                    'title': '📚 Share & Learn',
                    'description': 'Everyone teaches something new',
                    'instructions': [
                        "Each person shares one quick tip or fact",
                        "Can be about anything - work, life, random knowledge",
                        "Learning from each other is fun!"
                    ],
                    'duration': '10 min'
                }
            ],
            'creative': [
                {
                    'title': '🖼️ Describe Your Day',
                    'description': 'Summarize your day creatively',
                    'instructions': [
                        "Describe your day in exactly 3 words",
                        "Or describe it using only emojis",
                        "Or compare it to a movie/song",
                        "Be creative!"
                    ],
                    'duration': '5 min'
                },
                {
                    'title': '🎨 Caption This',
                    'description': 'Come up with funny captions',
                    'instructions': [
                        "Someone describes a situation",
                        "Everyone comes up with a funny caption",
                        "Vote for the funniest one!",
                        "Example situation: 'Monday morning alarm goes off'"
                    ],
                    'duration': '10 min'
                }
            ]
        }
    
    def _load_quick_polls(self) -> List[Dict]:
        """Load quick poll templates"""
        return [
            {
                'question': "What's your productivity peak? ⏰",
                'options': ['Morning 🌅', 'Afternoon ☀️', 'Evening 🌆', 'Night 🌙'],
                'category': 'productivity'
            },
            {
                'question': "Preferred work environment?",
                'options': ['Silence 🤫', 'Music 🎵', 'Background noise 🔊', 'Depends on mood 🤷'],
                'category': 'work'
            },
            {
                'question': "How's your energy today?",
                'options': ['Fully charged ⚡', 'Good enough 👍', 'Need coffee ☕', 'Running on fumes 😴'],
                'category': 'mood'
            },
            {
                'question': "Weekend plans?",
                'options': ['Productive 💻', 'Relaxing 🛋️', 'Social 🎉', 'Adventure 🏔️'],
                'category': 'casual'
            },
            {
                'question': "Preferred communication style?",
                'options': ['Quick messages 💬', 'Detailed responses 📝', 'Voice notes 🎤', 'Emojis only 😎'],
                'category': 'communication'
            },
            {
                'question': "Current learning goal?",
                'options': ['New tech skill 💻', 'Soft skills 🗣️', 'Creative hobby 🎨', 'Language 🌍'],
                'category': 'growth'
            },
            {
                'question': "Favorite type of content?",
                'options': ['Videos 📹', 'Articles 📰', 'Podcasts 🎧', 'Books 📚'],
                'category': 'content'
            },
            {
                'question': "How do you handle stress?",
                'options': ['Exercise 🏃', 'Music 🎵', 'Talk to friends 👥', 'Alone time 🧘'],
                'category': 'wellness'
            }
        ]
    
    def _load_fun_challenges(self) -> List[Dict]:
        """Load fun challenge templates"""
        return [
            {
                'title': '📸 Photo Challenge',
                'description': 'Share a photo that matches the theme',
                'themes': ['Your workspace', 'View from your window', 'Something blue', 'Your pet/plant', 'Current snack'],
                'duration': '15 min'
            },
            {
                'title': '🎵 Music Challenge',
                'description': 'Share a song that fits the category',
                'themes': ['Current mood', 'Favorite workout song', 'Throwback jam', 'Song that motivates you', 'Hidden gem'],
                'duration': '10 min'
            },
            {
                'title': '💡 Quick Challenge',
                'description': 'Fun mini challenges',
                'themes': [
                    'Share your lock screen (if comfortable)',
                    'Last emoji you used - why?',
                    'Recommend something you love',
                    'Share a random fact about yourself',
                    'Show your handwriting - write "Hello!"'
                ],
                'duration': '5 min'
            }
        ]
    
    def analyze_engagement(
        self,
        channel_id: int,
        time_period_hours: int = 6,
        *,
        community_id: Optional[int] = None,
        scheduled: bool = False,
    ) -> Dict[str, any]:
        """
        Analyze channel engagement levels

        Args:
            channel_id: Channel to analyze
            time_period_hours: Time window for analysis
            community_id: Optional community for settings lookup. When
                provided we honor ``auto_analyze`` (gates scheduled runs),
                ``track_threads``, and ``leaderboard`` toggles.
            scheduled: True for periodic Celery beat runs. Gated by
                ``auto_analyze``; on-demand admin clicks are not.

        Returns:
            Engagement analysis with suggestions
        """
        cfg = (get_community_settings(community_id, 'engagement', _ENGAGEMENT_DEFAULTS)
               if community_id else dict(_ENGAGEMENT_DEFAULTS))
        if scheduled and not cfg.get('auto_analyze', True):
            return {
                'success': False,
                'skipped': 'auto_analyze_disabled',
                'engagement_level': 'inactive',
                'engagement_score': 0,
            }
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                time_threshold = datetime.now() - timedelta(hours=time_period_hours)
                
                # Get message statistics
                cur.execute("""
                    SELECT 
                        COUNT(*) as message_count,
                        COUNT(DISTINCT sender_id) as participant_count,
                        MIN(created_at) as first_message,
                        MAX(created_at) as last_message
                    FROM messages
                    WHERE channel_id = %s 
                    AND created_at >= %s
                    AND message_type = 'text'
                """, (channel_id, time_threshold))
                
                stats = cur.fetchone()
                
                if not stats or stats['message_count'] == 0:
                    return {
                        'success': True,
                        'engagement_level': 'inactive',
                        'engagement_score': 0,
                        'message_count': 0,
                        'participant_count': 0,
                        'avg_messages_per_user': 0,
                        'silence_minutes': 0,
                        'participation_balance': 0,
                        'suggestions': [{
                            'type': 'conversation_starter',
                            'message': self._suggest_conversation_starter('general'),
                            'reason': 'No recent activity detected'
                        }],
                        'time_period_hours': time_period_hours
                    }
                
                # Calculate metrics
                message_count = stats['message_count']
                participant_count = stats['participant_count']
                
                # Calculate time since last message
                last_message_time = stats['last_message']
                silence_minutes = (datetime.now() - last_message_time).total_seconds() / 60
                
                # Get message distribution by user
                cur.execute("""
                    SELECT sender_id, COUNT(*) as count
                    FROM messages
                    WHERE channel_id = %s 
                    AND created_at >= %s
                    AND message_type = 'text'
                    GROUP BY sender_id
                    ORDER BY count DESC
                """, (channel_id, time_threshold))
                
                user_distribution = cur.fetchall()
                
                # Calculate engagement metrics
                avg_messages_per_user = message_count / participant_count if participant_count > 0 else 0
                
                # Check for balanced participation
                if user_distribution:
                    max_messages = user_distribution[0]['count']
                    participation_balance = (message_count / participant_count) / max_messages if max_messages > 0 else 0
                else:
                    participation_balance = 0
                
                # Determine engagement level
                engagement_score = self._calculate_engagement_score(
                    message_count, participant_count, 
                    silence_minutes, participation_balance,
                    time_period_hours
                )
                
                if engagement_score >= 0.7:
                    engagement_level = 'high'
                    suggestion_type = None
                elif engagement_score >= 0.4:
                    engagement_level = 'medium'
                    suggestion_type = 'boost'
                else:
                    engagement_level = 'low'
                    suggestion_type = 'revive'
                
                # Generate suggestions
                suggestions = self._generate_suggestions(
                    engagement_level, silence_minutes,
                    participant_count, suggestion_type
                )
                
                # Honor the community toggles by surfacing them on the
                # response — UI uses `track_threads` / `leaderboard` to
                # decide whether to render those sections. Hiding them
                # here keeps the dashboard consistent with admin intent
                # without needing a second API round-trip.
                result = {
                    'success': True,
                    'engagement_level': engagement_level,
                    'engagement_score': round(engagement_score, 2),
                    'message_count': message_count,
                    'participant_count': participant_count,
                    'avg_messages_per_user': round(avg_messages_per_user, 2),
                    'silence_minutes': round(silence_minutes, 2),
                    'participation_balance': round(participation_balance, 2),
                    'suggestions': suggestions,
                    'time_period_hours': time_period_hours,
                    'features': {
                        'track_threads': bool(cfg.get('track_threads', True)),
                        'leaderboard':   bool(cfg.get('leaderboard', True)),
                    },
                }
                
                # Log engagement analysis
                self._log_engagement_analysis(channel_id, result)
                
                return result
                
        except Exception as e:
            print(f"[ENGAGEMENT] Error analyzing engagement: {e}")
            return {
                'success': False,
                'error': str(e)
            }
        finally:
            if conn:
                conn.close()
    
    def _calculate_engagement_score(self, message_count: int, 
                                    participant_count: int,
                                    silence_minutes: float,
                                    participation_balance: float,
                                    time_period_hours: int) -> float:
        """Calculate overall engagement score"""
        
        # Message frequency score (messages per hour)
        msg_per_hour = message_count / time_period_hours if time_period_hours > 0 else 0
        frequency_score = min(msg_per_hour / 10, 1.0)  # Normalize to max 10 msg/hour = 1.0
        
        # Recency score (how recent was last message)
        if silence_minutes < 5:
            recency_score = 1.0
        elif silence_minutes < 30:
            recency_score = 0.7
        elif silence_minutes < 60:
            recency_score = 0.4
        else:
            recency_score = 0.1
        
        # Participation score (how many people are active)
        participation_score = min(participant_count / 5, 1.0)  # Normalize to 5+ users = 1.0
        
        # Balance score (how evenly distributed are messages)
        balance_score = participation_balance
        
        # Weighted combination
        engagement_score = (
            frequency_score * 0.3 +
            recency_score * 0.3 +
            participation_score * 0.2 +
            balance_score * 0.2
        )
        
        return engagement_score
    
    def _generate_suggestions(self, engagement_level: str, 
                             silence_minutes: float,
                             participant_count: int,
                             suggestion_type: Optional[str]) -> List[Dict]:
        """Generate engagement suggestions"""
        suggestions = []
        
        if engagement_level == 'low':
            if silence_minutes > 30:
                suggestions.append({
                    'type': 'conversation_starter',
                    'message': self._suggest_conversation_starter('general'),
                    'reason': f'Channel has been quiet for {int(silence_minutes)} minutes'
                })
            
            if participant_count < 3:
                suggestions.append({
                    'type': 'invite',
                    'message': 'Consider inviting more people to join the conversation',
                    'reason': 'Low participant count'
                })
            
            suggestions.append({
                'type': 'icebreaker',
                'message': self._suggest_conversation_starter('icebreaker'),
                'reason': 'Break the ice and get people talking'
            })
        
        elif engagement_level == 'medium':
            if silence_minutes > 10:
                suggestions.append({
                    'type': 'prompt',
                    'message': self._suggest_conversation_starter('casual'),
                    'reason': 'Keep the momentum going'
                })
            
            suggestions.append({
                'type': 'topic',
                'message': 'Try introducing a new but related topic',
                'reason': 'Maintain interest with variety'
            })
        
        else:  # high engagement
            suggestions.append({
                'type': 'appreciation',
                'message': 'Great conversation! Keep it going! 🎉',
                'reason': 'High engagement detected'
            })
        
        return suggestions
    
    def _suggest_conversation_starter(self, category: str = 'general') -> str:
        """Get a random conversation starter from category"""
        starters = self.conversation_starters.get(category, self.conversation_starters['general'])
        return random.choice(starters)
    
    def _log_engagement_analysis(self, channel_id: int, analysis: Dict):
        """Log engagement analysis to database"""
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                # Get or create the engagement agent ID
                cur.execute("""
                    SELECT id FROM ai_agents WHERE type = 'engagement' LIMIT 1
                """)
                agent_row = cur.fetchone()
                
                if not agent_row:
                    # Create engagement agent if it doesn't exist
                    cur.execute("""
                        INSERT INTO ai_agents (name, type, description, is_active)
                        VALUES ('Engagement Agent', 'engagement', 
                                'AI-powered engagement analysis', TRUE)
                    """)
                    agent_id = cur.lastrowid
                else:
                    agent_id = agent_row['id']
                
                output_data = {
                    'engagement_level': analysis['engagement_level'],
                    'engagement_score': analysis['engagement_score'],
                    'message_count': analysis['message_count'],
                    'participant_count': analysis['participant_count'],
                    'suggestions': len(analysis['suggestions'])
                }
                
                cur.execute("""
                    INSERT INTO ai_agent_logs 
                    (agent_id, channel_id, action_type, input_text, 
                     output_text, confidence_score)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (
                    agent_id, channel_id, 'engagement_analysis',
                    f"Analyzed {analysis['message_count']} messages",
                    json.dumps(output_data),
                    analysis['engagement_score']
                ))
                
                conn.commit()
        except Exception as e:
            print(f"[ENGAGEMENT] Error logging analysis: {e}")
        finally:
            if conn:
                conn.close()
    
    def get_engagement_history(self, channel_id: int, 
                               limit: int = 10) -> List[Dict]:
        """Get engagement analysis history"""
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT 
                        id, output_text, confidence_score, created_at
                    FROM ai_agent_logs
                    WHERE channel_id = %s 
                    AND action_type = 'engagement_analysis'
                    ORDER BY created_at DESC
                    LIMIT %s
                """, (channel_id, limit))
                
                logs = cur.fetchall()
                
                return [{
                    'id': log['id'],
                    'analysis': json.loads(log['output_text']) if log['output_text'] else {},
                    'engagement_score': round(log['confidence_score'], 2) if log['confidence_score'] else 0,
                    'created_at': log['created_at'].isoformat() if log['created_at'] else None
                } for log in logs]
                
        except Exception as e:
            print(f"[ENGAGEMENT] Error fetching history: {e}")
            return []
        finally:
            if conn:
                conn.close()

    # =========================================================
    # ICE-BREAKER ACTIVITIES API
    # =========================================================
    
    def get_icebreaker_activity(self, activity_type: str = 'random') -> Dict[str, Any]:
        """
        Get an ice-breaker activity
        
        Args:
            activity_type: 'quick_questions', 'games', 'team_building', 'creative', or 'random'
            
        Returns:
            Ice-breaker activity with instructions
        """
        try:
            if activity_type == 'random':
                # Pick random category and activity
                category = random.choice(list(self.icebreaker_activities.keys()))
                activity = random.choice(self.icebreaker_activities[category])
            else:
                if activity_type not in self.icebreaker_activities:
                    return {
                        'success': False,
                        'error': f'Unknown activity type: {activity_type}'
                    }
                activity = random.choice(self.icebreaker_activities[activity_type])
                category = activity_type
            
            return {
                'success': True,
                'category': category,
                'activity': activity,
                'timestamp': datetime.now().isoformat()
            }
        except Exception as e:
            print(f"[ENGAGEMENT] Error getting icebreaker: {e}")
            return {'success': False, 'error': str(e)}
    
    def get_all_icebreaker_categories(self) -> Dict[str, Any]:
        """Get all available ice-breaker categories with activity counts"""
        try:
            categories = []
            for category, activities in self.icebreaker_activities.items():
                categories.append({
                    'id': category,
                    'name': category.replace('_', ' ').title(),
                    'activity_count': len(activities),
                    'icon': self._get_category_icon(category)
                })
            
            return {
                'success': True,
                'categories': categories,
                'total_activities': sum(len(a) for a in self.icebreaker_activities.values())
            }
        except Exception as e:
            print(f"[ENGAGEMENT] Error getting categories: {e}")
            return {'success': False, 'error': str(e)}
    
    def _get_category_icon(self, category: str) -> str:
        """Get emoji icon for category"""
        icons = {
            'quick_questions': '❓',
            'games': '🎮',
            'team_building': '🤝',
            'creative': '🎨'
        }
        return icons.get(category, '📌')
    
    def get_quick_poll(self, category: str = 'random') -> Dict[str, Any]:
        """
        Get a quick poll for the channel
        
        Args:
            category: Poll category or 'random'
            
        Returns:
            Poll question with options
        """
        try:
            if category == 'random':
                poll = random.choice(self.quick_polls)
            else:
                matching_polls = [p for p in self.quick_polls if p['category'] == category]
                if not matching_polls:
                    poll = random.choice(self.quick_polls)
                else:
                    poll = random.choice(matching_polls)
            
            return {
                'success': True,
                'poll': {
                    'question': poll['question'],
                    'options': poll['options'],
                    'category': poll['category'],
                    'id': f"poll_{datetime.now().strftime('%Y%m%d%H%M%S')}_{random.randint(1000, 9999)}"
                },
                'timestamp': datetime.now().isoformat()
            }
        except Exception as e:
            print(f"[ENGAGEMENT] Error getting poll: {e}")
            return {'success': False, 'error': str(e)}
    
    def get_fun_challenge(self, challenge_type: str = 'random') -> Dict[str, Any]:
        """
        Get a fun challenge for the channel
        
        Args:
            challenge_type: Challenge type or 'random'
            
        Returns:
            Challenge with theme options
        """
        try:
            if challenge_type == 'random':
                challenge = random.choice(self.fun_challenges)
            else:
                matching = [c for c in self.fun_challenges if challenge_type.lower() in c['title'].lower()]
                challenge = matching[0] if matching else random.choice(self.fun_challenges)
            
            # Pick a random theme from the challenge
            theme = random.choice(challenge['themes'])
            
            return {
                'success': True,
                'challenge': {
                    'title': challenge['title'],
                    'description': challenge['description'],
                    'current_theme': theme,
                    'all_themes': challenge['themes'],
                    'duration': challenge['duration']
                },
                'timestamp': datetime.now().isoformat()
            }
        except Exception as e:
            print(f"[ENGAGEMENT] Error getting challenge: {e}")
            return {'success': False, 'error': str(e)}
    
    def get_conversation_starter_by_category(self, category: str = 'general') -> Dict[str, Any]:
        """Get conversation starters by category"""
        try:
            if category not in self.conversation_starters:
                category = 'general'
            
            starters = self.conversation_starters[category]
            
            return {
                'success': True,
                'category': category,
                'starters': starters,
                'random_pick': random.choice(starters),
                'total_count': len(starters)
            }
        except Exception as e:
            print(f"[ENGAGEMENT] Error getting starters: {e}")
            return {'success': False, 'error': str(e)}
    
    def get_engagement_booster_pack(self, engagement_level: str = 'low') -> Dict[str, Any]:
        """
        Get a complete engagement booster pack based on current engagement level
        
        Args:
            engagement_level: 'low', 'medium', or 'high'
            
        Returns:
            Pack with conversation starter, activity, and poll
        """
        try:
            pack = {
                'success': True,
                'engagement_level': engagement_level,
                'boosters': []
            }
            
            if engagement_level == 'low':
                # More activities for low engagement
                pack['boosters'] = [
                    {
                        'type': 'conversation_starter',
                        'content': random.choice(self.conversation_starters['icebreaker']),
                        'priority': 'high',
                        'reason': 'Break the silence with an engaging question'
                    },
                    {
                        'type': 'activity',
                        'content': random.choice(self.icebreaker_activities['quick_questions']),
                        'priority': 'high',
                        'reason': 'Quick activity to get everyone involved'
                    },
                    {
                        'type': 'poll',
                        'content': random.choice(self.quick_polls),
                        'priority': 'medium',
                        'reason': 'Easy way for everyone to participate'
                    },
                    {
                        'type': 'challenge',
                        'content': random.choice(self.fun_challenges),
                        'priority': 'medium',
                        'reason': 'Fun challenge to spark interest'
                    }
                ]
            elif engagement_level == 'medium':
                # Moderate boosters
                pack['boosters'] = [
                    {
                        'type': 'conversation_starter',
                        'content': random.choice(self.conversation_starters['casual']),
                        'priority': 'medium',
                        'reason': 'Keep the conversation flowing'
                    },
                    {
                        'type': 'activity',
                        'content': random.choice(self.icebreaker_activities['games']),
                        'priority': 'medium',
                        'reason': 'Add some fun to the mix'
                    },
                    {
                        'type': 'poll',
                        'content': random.choice(self.quick_polls),
                        'priority': 'low',
                        'reason': 'Optional: gauge the group mood'
                    }
                ]
            else:
                # Light boosters for high engagement
                pack['boosters'] = [
                    {
                        'type': 'appreciation',
                        'content': "Great energy in here! 🎉 Keep the awesome conversations going!",
                        'priority': 'low',
                        'reason': 'Acknowledge the active community'
                    },
                    {
                        'type': 'activity',
                        'content': random.choice(self.icebreaker_activities['team_building']),
                        'priority': 'low',
                        'reason': 'Optional: deepen connections'
                    }
                ]
            
            pack['timestamp'] = datetime.now().isoformat()
            pack['total_boosters'] = len(pack['boosters'])
            
            return pack
        except Exception as e:
            print(f"[ENGAGEMENT] Error creating booster pack: {e}")
            return {'success': False, 'error': str(e)}
    
    def log_activity_usage(self, channel_id: int, activity_type: str, 
                          activity_title: str, user_id: int) -> bool:
        """Log when an activity is used in a channel"""
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                # Get or create the engagement agent ID
                cur.execute("""
                    SELECT id FROM ai_agents WHERE type = 'engagement' LIMIT 1
                """)
                agent_row = cur.fetchone()
                
                if not agent_row:
                    cur.execute("""
                        INSERT INTO ai_agents (name, type, description, is_active)
                        VALUES ('Engagement Agent', 'engagement', 
                                'AI-powered engagement analysis', TRUE)
                    """)
                    agent_id = cur.lastrowid
                else:
                    agent_id = agent_row['id']
                
                cur.execute("""
                    INSERT INTO ai_agent_logs 
                    (agent_id, channel_id, action_type, input_text, output_text, confidence_score)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (
                    agent_id,
                    channel_id,
                    'engagement_activity',
                    f"Activity used: {activity_type}",
                    json.dumps({
                        'activity_type': activity_type,
                        'activity_title': activity_title,
                        'used_by': user_id
                    }),
                    1.0
                ))
                conn.commit()
            return True
        except Exception as e:
            print(f"[ENGAGEMENT] Error logging activity: {e}")
            return False
        finally:
            if conn:
                conn.close()
    
    def get_activity_stats(self, channel_id: int, days: int = 7) -> Dict[str, Any]:
        """Get statistics about activity usage in a channel"""
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                time_threshold = datetime.now() - timedelta(days=days)
                
                cur.execute("""
                    SELECT output_text, created_at
                    FROM ai_agent_logs
                    WHERE channel_id = %s 
                    AND action_type = 'engagement_activity'
                    AND created_at >= %s
                    ORDER BY created_at DESC
                """, (channel_id, time_threshold))
                
                logs = cur.fetchall()
                
                activity_counts = Counter()
                for log in logs:
                    if log['output_text']:
                        data = json.loads(log['output_text'])
                        activity_counts[data.get('activity_type', 'unknown')] += 1
                
                return {
                    'success': True,
                    'total_activities': len(logs),
                    'activity_breakdown': dict(activity_counts),
                    'days_analyzed': days,
                    'most_popular': activity_counts.most_common(1)[0] if activity_counts else None
                }
        except Exception as e:
            print(f"[ENGAGEMENT] Error getting activity stats: {e}")
            return {'success': False, 'error': str(e)}
        finally:
            if conn:
                conn.close()

    # ====================================================================
    # POST ENGAGEMENT CONTENT INTO A CHANNEL  (real AI bot message)
    # ====================================================================

    _NUM_EMOJI = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣']

    def _format_poll(self, poll: Dict) -> str:
        lines = [f"📊 **Quick Poll** — {poll['question']}", ""]
        for i, opt in enumerate(poll.get('options', [])):
            emoji = self._NUM_EMOJI[i] if i < len(self._NUM_EMOJI) else '▫️'
            lines.append(f"{emoji} {opt}")
        lines.append("\n_React with the number, or reply with your pick!_ 👇")
        return "\n".join(lines)

    def _format_icebreaker(self, activity: Dict) -> str:
        lines = [f"🧊 **Ice-breaker — {activity.get('title', 'Let’s play!')}**"]
        if activity.get('description'):
            lines.append(activity['description'])
        lines.append("")
        for q in (activity.get('questions') or activity.get('instructions') or []):
            lines.append(f"• {q}")
        if activity.get('example'):
            lines.append(f"\n_Example:_ {activity['example']}")
        if activity.get('duration'):
            lines.append(f"\n⏱️ ~{activity['duration']}")
        return "\n".join(lines)

    def _format_challenge(self, challenge: Dict) -> str:
        lines = [f"{challenge.get('title', '💡 Challenge')}"]
        if challenge.get('description'):
            lines.append(challenge['description'])
        if challenge.get('current_theme'):
            lines.append(f"\n👉 **Theme:** {challenge['current_theme']}")
        if challenge.get('duration'):
            lines.append(f"⏱️ ~{challenge['duration']}")
        return "\n".join(lines)

    def _post_as_ai_bot(self, text: str, channel_id: int,
                        community_id: Optional[int] = None,
                        card: Optional[Dict] = None) -> Dict:
        """Insert an AI bot message into the channel and broadcast it.
        Matches the canonical bot-post pattern in routes/sockets.py:
        sender_id NULL + bot_name, message_type 'ai', plaintext content.
        ``community_id`` is broadcast on the socket payload only — the
        messages table has no such column.

        ``card`` is an optional structured payload (``{'kind': ..., ...}``)
        persisted in ``engagement_cards`` and echoed on the socket/return so
        the frontend can render an interactive card instead of plain text.
        The ``text`` is always stored as a readable fallback.
        """
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO messages "
                    "(channel_id, sender_id, content, message_type, bot_name, created_at) "
                    "VALUES (%s, NULL, %s, 'ai', %s, NOW())",
                    (channel_id, text, 'Engagement Agent'),
                )
                mid = cur.lastrowid
                if card:
                    kind = card.get('kind')
                    payload = {k: v for k, v in card.items() if k != 'kind'}
                    cur.execute(
                        "INSERT INTO engagement_cards "
                        "(message_id, channel_id, kind, payload) "
                        "VALUES (%s, %s, %s, %s)",
                        (mid, channel_id, kind, json.dumps(payload)),
                    )
                conn.commit()
            # A new bot message invalidates the channel's offset=0 cache so a
            # reload re-fetches with the card attached.
            try:
                from services.redis_client import invalidate_channel_messages_cache
                invalidate_channel_messages_cache(channel_id)
            except Exception:
                pass
            created_at = datetime.utcnow().isoformat() + 'Z'
            try:
                from app import socketio  # lazy: avoid circular import
                socketio.emit('message_received', {
                    'id': mid,
                    'channel_id': channel_id,
                    'community_id': community_id,
                    'sender_id': None,
                    'content': text,
                    'message_type': 'ai',
                    'reply_to': None,
                    'created_at': created_at,
                    'author': 'Engagement Agent',
                    'avatar': None,
                    'is_blocked': False,
                    'moderation': None,
                    'card': card,
                }, room=f'channel_{channel_id}', namespace='/')
            except Exception as emit_exc:
                print(f"[ENGAGEMENT] socket emit failed: {emit_exc}")
            return {'posted': True, 'message_id': mid, 'content': text,
                    'author': 'Engagement Agent', 'created_at': created_at,
                    'card': card}
        except Exception as exc:
            print(f"[ENGAGEMENT] _post_as_ai_bot failed: {exc}")
            return {'posted': False, 'error': str(exc)}
        finally:
            if conn:
                conn.close()

    def _build_card_for(self, kind: str,
                        category: Optional[str] = None) -> Optional[Dict]:
        """Build a (text, card) pair for a single engagement ``kind``.
        Returns ``None`` if the underlying generator fails. The card dict is
        ``{'kind': ..., <structured fields>}``; the text is a readable
        fallback rendered by the legacy ``_format_*`` helpers.
        """
        if kind == 'starter':
            text = self._suggest_conversation_starter(category or 'casual')
            return {'text': text, 'card': {'kind': 'starter', 'text': text}}
        if kind == 'poll':
            p = self.get_quick_poll(category or 'random')
            if not p.get('success'):
                return None
            poll = p['poll']
            return {
                'text': self._format_poll(poll),
                'card': {'kind': 'poll',
                         'question': poll['question'],
                         'options': list(poll.get('options', []))},
            }
        if kind == 'icebreaker':
            ib = self.get_icebreaker_activity('random')
            if not ib.get('success'):
                return None
            a = ib['activity']
            return {
                'text': self._format_icebreaker(a),
                'card': {'kind': 'icebreaker',
                         'title': a.get('title', 'Ice-breaker'),
                         'description': a.get('description'),
                         'questions': list(a.get('questions')
                                           or a.get('instructions') or []),
                         'example': a.get('example'),
                         'duration': a.get('duration')},
            }
        if kind == 'challenge':
            c = self.get_fun_challenge('random')
            if not c.get('success'):
                return None
            ch = c['challenge']
            return {
                'text': self._format_challenge(ch),
                'card': {'kind': 'challenge',
                         'title': ch.get('title', 'Challenge'),
                         'description': ch.get('description'),
                         'theme': ch.get('current_theme'),
                         'duration': ch.get('duration')},
            }
        return None

    def post_engagement_content(self, channel_id: int,
                                community_id: Optional[int] = None,
                                kind: str = 'pack',
                                category: Optional[str] = None) -> Dict:
        """Build and POST engagement content into a channel as real, separate
        AI messages — one per booster, each with its own interactive card.

        ``kind`` is one of: starter, poll, icebreaker, challenge, pack
        (= starter + poll + icebreaker, posted as three distinct cards).

        Returns ``{'posted': bool, 'kind': kind, 'items': [<post result>, ...]}``
        where each item is the dict returned by ``_post_as_ai_bot``.
        """
        kind = (kind or 'pack').lower()
        sub_kinds = (['starter', 'poll', 'icebreaker'] if kind == 'pack'
                     else [kind])

        items: List[Dict] = []
        for sk in sub_kinds:
            built = self._build_card_for(sk, category)
            if not built:
                continue
            res = self._post_as_ai_bot(
                built['text'], channel_id, community_id, card=built['card'])
            res['kind'] = sk
            if res.get('posted'):
                items.append(res)

        # Fallback: never return empty-handed.
        if not items:
            built = self._build_card_for('starter', category or 'general')
            res = self._post_as_ai_bot(
                built['text'], channel_id, community_id, card=built['card'])
            res['kind'] = 'starter'
            if res.get('posted'):
                items.append(res)

        posted = bool(items)
        return {
            'posted': posted,
            'kind': kind,
            'items': items,
            # Back-compat single-value fields (first item).
            'message_id': items[0].get('message_id') if posted else None,
        }

    # ────────────────────────────────────────────────────────────────────
    # Autonomous hooks (Phase 3.1)
    # ────────────────────────────────────────────────────────────────────

    def _claim_nudge(self, channel_id: int) -> bool:
        """Atomically claim the right to nudge this channel once per TTL.

        Returns True if this caller won the claim (should post), False if a
        concurrent orchestrator already claimed it. Fail-open: if Redis is
        unavailable we return True — duplicate posting only happens *with*
        Redis + multiple loops anyway, and a single-process setup must still
        nudge. Mirrors auto_message._claim_welcome.
        """
        try:
            r = _get_redis()
            if r is None:
                return True
            key = f"engagement:nudged:{channel_id}"
            # SET NX EX — only the first caller across all processes succeeds.
            return bool(r.set(key, "1", nx=True, ex=_NUDGE_DEDUPE_TTL))
        except Exception:
            return True

    def sense(self, event: dict) -> Optional[Dict]:
        """Accept only ``channel.silent`` events at-or-above the minimum
        bucket. The presence probe already rate-limits to one event per
        bucket per hour, so we don't need additional gating here.
        """
        channel_id = event.get("channel_id")
        bucket = int(event.get("bucket") or 0)
        if not channel_id or bucket < self._MIN_BUCKET_MINUTES:
            return None
        # G1a per-channel override / Phase 5.2 community kill-switch.
        # Channel helper falls through to community level when no override
        # row exists.
        if not self._is_enabled_for_channel(
            event.get("community_id"), channel_id
        ):
            return None
        # Honor community settings: auto_analyze gates the whole pipeline
        # (the nudge IS the engagement reaction). We intentionally do NOT
        # also gate on inactivity_alerts here — existing community rows
        # may have it false-by-default in the schema yet still expect the
        # autonomous nudge (matches legacy behaviour). Inactivity_alerts
        # is treated as a hint surfaced on the dashboard side, not a hard
        # gate on the bus reaction.
        community_id = event.get("community_id")
        if community_id:
            try:
                cfg = get_community_settings(int(community_id), 'engagement',
                                             _ENGAGEMENT_DEFAULTS)
                if not cfg.get('auto_analyze', True):
                    return None
            except Exception:
                pass

        # Give-up gate — stop nudging a channel that has stayed silent through
        # _MAX_CONSECUTIVE_IGNORED nudges in a row (no human message arrived to
        # reset it). The silence probe recomputes silent_minutes fresh from
        # MAX(created_at) each pass, so a real message would drop it back toward
        # zero: if this event's silent_minutes is LOWER than the value recorded
        # at our last nudge, the channel woke up in between → fresh episode,
        # reset the counter; if it's the same or higher, the channel never woke
        # → this nudge would be another unanswered one.
        #
        # Runs BEFORE _claim_nudge so a given-up channel doesn't needlessly
        # consume (and churn) its Redis claim key every probe cycle.
        silent_minutes = int(event.get("silent_minutes") or bucket)
        _state = _agent_memory.get_state(
            self.NAME, _agent_memory.SCOPE_CHANNEL, channel_id)
        _th = (_state or {}).get("thresholds") or {}
        last_silent = _th.get("last_nudge_silent_minutes")
        consecutive = int(_th.get("consecutive_ignored") or 0)
        # First-ever nudge (no prior record) must never be skipped.
        silence_reset = last_silent is not None and silent_minutes < last_silent
        if (last_silent is not None and not silence_reset
                and consecutive >= self._MAX_CONSECUTIVE_IGNORED):
            return None

        # Idempotency guard — collapse duplicate dispatch from multiple
        # orchestrator loops / silence probes to a single nudge. Must be the
        # last gate so we only claim when we're otherwise going to act
        # (decide() always returns 'act' for engagement).
        if not self._claim_nudge(int(channel_id)):
            return None
        return {
            "channel_id":     channel_id,
            "community_id":   event.get("community_id"),
            "silent_minutes": silent_minutes,
            "bucket":         bucket,
            "scope_type":     _agent_memory.SCOPE_CHANNEL,
            "scope_id":       channel_id,
            # Consumed by act() when persisting the give-up counter — carried
            # forward so act() reuses the exact silent_minutes/reset decision
            # sense() made, rather than re-deriving from a fresher probe value.
            "_silence_reset": silence_reset,
        }

    def decide(self, observation: Dict):
        """Pick a conversation-starter category via ε-greedy bandit over
        the per-channel reward table.
        """
        channel_id = observation["channel_id"]
        bucket = observation["bucket"]
        category = self._pick_category(channel_id, bucket)
        return ("act", {**observation, "category": category},
                f"nudge_bucket_{bucket}_cat_{category}")

    def act(self, payload: Dict, correlation_id: str) -> Optional[Dict]:
        """POST engagement content into the silent channel as a real AI
        message, escalating with how long it has been quiet:
            • 15-min bucket  → a single conversation starter
            • 60-min bucket  → starter + quick poll
            • 240-min bucket → full starter pack (starter + poll + ice-breaker)
        We also emit a lightweight ``engagement_nudge`` event so the admin
        AgentActivityTimeline can render the decision in real time.
        """
        channel_id = payload["channel_id"]
        community_id = payload.get("community_id")
        category = payload.get("category") or "general"
        bucket = int(payload.get("bucket") or 0)

        if bucket >= 240:
            kind = 'pack'
        elif bucket >= 60:
            kind = 'poll'
        else:
            kind = 'starter'

        post = self.post_engagement_content(
            channel_id, community_id, kind=kind, category=category)

        # Advance the give-up counter — but ONLY when a message actually
        # posted. The base-class cooldown (base.py handle()) runs between
        # decide() and act(), so persisting in sense() could count a nudge
        # that never went out. Reset on a fresh silence episode (a human
        # message arrived, per sense()'s _silence_reset), else increment.
        # Re-read state fresh so we don't clobber a concurrent learn() write
        # to the same thresholds blob.
        if post.get("posted"):
            try:
                st = _agent_memory.get_state(
                    self.NAME, _agent_memory.SCOPE_CHANNEL, channel_id) or {}
                th = dict(st.get("thresholds") or {})
                th["last_nudge_silent_minutes"] = int(
                    payload.get("silent_minutes") or bucket)
                th["consecutive_ignored"] = (
                    0 if payload.get("_silence_reset")
                    else int(th.get("consecutive_ignored") or 0) + 1)
                _agent_memory.set_state(
                    self.NAME, _agent_memory.SCOPE_CHANNEL, channel_id,
                    thresholds=th)
            except Exception as exc:
                print(f"[ENGAGEMENT] give-up counter persist failed: {exc}")

        # Surface the decision on the dashboard timeline (non-blocking).
        try:
            from app import socketio  # lazy: avoid circular import
            socketio.emit("engagement_nudge", {
                "channel_id":     channel_id,
                "community_id":   community_id,
                "category":       category,
                "kind":           kind,
                "starter":        self._suggest_conversation_starter(category),
                "silent_minutes": payload.get("silent_minutes"),
                "bucket":         bucket,
                "correlation_id": correlation_id,
            }, room=f"channel_{channel_id}", namespace="/")
        except Exception as exc:
            print(f"[ENGAGEMENT] nudge emit failed: {exc}")

        return {"emitted": bool(post.get("posted")), "category": category,
                "kind": kind, "message_id": post.get("message_id")}

    def learn(self, action_id: int, signal: str, *, weight: float = 1.0) -> None:
        """Per-channel category bandit. Reward the picked category on
        positive/engaged feedback; lightly punish on dismissed (so
        repeated dismissals shift the bandit toward other categories
        without ever fully zeroing out the chosen arm).
        """
        try:
            action = _agent_memory.get_action(action_id)
            if not action or not action.get("channel_id"):
                return super().learn(action_id, signal, weight=weight)
            channel_id = action["channel_id"]
            category = self._category_for(action_id) or "general"
            state = _agent_memory.get_state(
                self.NAME, _agent_memory.SCOPE_CHANNEL, channel_id) or {}
            th = dict(state.get("thresholds") or {})
            rewards = dict(th.get("category_rewards") or {})
            cur = float(rewards.get(category, 0))
            if signal in ("positive", "engaged"):
                rewards[category] = cur + float(weight)
            elif signal in ("negative", "dismissed"):
                # Half-step downward, floor at 0 so we never get negative.
                rewards[category] = max(0.0, cur - 0.5 * float(weight))
            th["category_rewards"] = rewards
            outcome = ("positive" if signal in ("positive", "engaged")
                       else "negative" if signal in ("negative", "dismissed")
                       else "neutral")
            _agent_memory.set_state(
                self.NAME, _agent_memory.SCOPE_CHANNEL, channel_id,
                thresholds=th, last_outcome=outcome,
            )
        except Exception as exc:
            print(f"[ENGAGEMENT] learn failed: {exc}")
        super().learn(action_id, signal, weight=weight)

    # ── Bandit helpers ─────────────────────────────────────────────

    def _pick_category(self, channel_id: int, bucket: int) -> str:
        """ε-greedy over conversation_starter categories.
        Bucket-aware: longer silence → prefer 'icebreaker' / 'casual'.
        """
        cats = list(self.conversation_starters.keys()) or ["general"]
        state = _agent_memory.get_state(
            self.NAME, _agent_memory.SCOPE_CHANNEL, channel_id) or {}
        rewards = (state.get("thresholds") or {}).get("category_rewards") or {}

        # Explore 25% of the time, OR if no priors exist.
        if random.random() < 0.25 or not rewards:
            if bucket >= 240 and "icebreaker" in cats:
                return "icebreaker"
            if bucket >= 60 and "casual" in cats:
                return "casual"
            return random.choice(cats)

        # Exploit the best-rewarded category we know about.
        try:
            best = max(rewards, key=lambda k: float(rewards[k]))
            if best in cats:
                return best
        except Exception:
            pass
        return random.choice(cats)

    def _category_for(self, action_id: int) -> Optional[str]:
        """Recover the category we picked when logging this action."""
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                cur.execute("SELECT payload_json FROM agent_actions WHERE id=%s",
                            (action_id,))
                row = cur.fetchone()
            if not row:
                return None
            raw = row["payload_json"] if isinstance(row, dict) else row[0]
            if isinstance(raw, (str, bytes, bytearray)):
                data = json.loads(raw)
            else:
                data = raw
            return (data or {}).get("category")
        except Exception:
            return None
        finally:
            if conn:
                conn.close()
