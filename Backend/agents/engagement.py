"""
Engagement Agent for AuraFlow
Boosts conversation engagement with smart suggestions and ice-breaking activities
"""

import json
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from collections import Counter
import random

from database import get_db_connection


class EngagementAgent:
    """
    Analyzes conversation patterns and suggests engagement boosters
    Provides conversation starters, ice-breakers, polls, and activity suggestions
    """
    
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
    
    def analyze_engagement(self, channel_id: int, 
                          time_period_hours: int = 6) -> Dict[str, any]:
        """
        Analyze channel engagement levels
        
        Args:
            channel_id: Channel to analyze
            time_period_hours: Time window for analysis
            
        Returns:
            Engagement analysis with suggestions
        """
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
                        'message_count': 0,
                        'suggestion': self._suggest_conversation_starter('general'),
                        'reason': 'No recent activity detected'
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
                    'time_period_hours': time_period_hours
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
                output_data = {
                    'engagement_level': analysis['engagement_level'],
                    'engagement_score': analysis['engagement_score'],
                    'message_count': analysis['message_count'],
                    'participant_count': analysis['participant_count'],
                    'suggestions': len(analysis['suggestions'])
                }
                
                cur.execute("""
                    INSERT INTO ai_agent_logs 
                    (channel_id, action_type, input_text, 
                     output_text, confidence_score)
                    VALUES (%s, %s, %s, %s, %s)
                """, (
                    channel_id, 'engagement_analysis',
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
                cur.execute("""
                    INSERT INTO ai_agent_logs 
                    (channel_id, action_type, input_text, output_text, confidence_score)
                    VALUES (%s, %s, %s, %s, %s)
                """, (
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
