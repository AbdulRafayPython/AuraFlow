"""
Knowledge Builder Agent for AuraFlow
Builds knowledge base from conversations
"""

import json
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from collections import Counter
import re

from database import get_db_connection
from utils.ai.text_processor import TextProcessor


class KnowledgeBuilderAgent:
    """
    Extracts and organizes knowledge from conversations
    Creates searchable knowledge entries and topic summaries
    """
    
    def __init__(self):
        """Initialize the knowledge builder"""
        self.text_processor = TextProcessor()
        self.min_messages_for_topic = 5
        
    def extract_knowledge(self, channel_id: int, 
                         time_period_hours: int = 24) -> Dict[str, any]:
        """
        Extract knowledge from channel conversations
        
        Args:
            channel_id: Channel to analyze
            time_period_hours: Time window
            
        Returns:
            Extracted knowledge items
        """
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                time_threshold = datetime.now() - timedelta(hours=time_period_hours)
                
                # Get messages
                cur.execute("""
                    SELECT m.id, m.content, m.sender_id, m.created_at,
                           u.username
                    FROM messages m
                    JOIN users u ON m.sender_id = u.id
                    WHERE m.channel_id = %s 
                    AND m.created_at >= %s
                    AND m.message_type = 'text'
                    ORDER BY m.created_at ASC
                """, (channel_id, time_threshold))
                
                messages = cur.fetchall()
                
                if len(messages) < self.min_messages_for_topic:
                    return {
                        'success': False,
                        'error': f'Need at least {self.min_messages_for_topic} messages'
                    }
                
                # Extract topics and key information
                topics = self._extract_topics(messages)
                
                # Extract Q&A pairs
                qa_pairs = self._extract_qa_pairs(messages)
                
                # Extract decisions/conclusions
                decisions = self._extract_decisions(messages)
                
                # Extract links and resources
                resources = self._extract_resources(messages)
                
                # Build knowledge entries
                knowledge_entries = []
                
                for topic, details in topics.items():
                    entry = {
                        'topic': topic,
                        'summary': details['summary'],
                        'participants': details['participants'],
                        'message_count': details['count'],
                        'timestamp': datetime.now().isoformat()
                    }
                    knowledge_entries.append(entry)
                
                result = {
                    'success': True,
                    'knowledge_entries': knowledge_entries,
                    'qa_pairs': qa_pairs,
                    'decisions': decisions,
                    'resources': resources,
                    'total_items': len(knowledge_entries) + len(qa_pairs) + len(decisions),
                    'time_period_hours': time_period_hours
                }
                
                # Save knowledge
                self._save_knowledge(channel_id, result)
                
                return result
                
        except Exception as e:
            print(f"[KNOWLEDGE] Error extracting knowledge: {e}")
            return {
                'success': False,
                'error': str(e)
            }
        finally:
            if conn:
                conn.close()
    
    def _extract_topics(self, messages: List[Dict]) -> Dict[str, Dict]:
        """Extract main topics from messages"""
        # Combine all message content
        all_text = ' '.join([msg['content'] for msg in messages])
        
        # Extract keywords
        keywords = self.text_processor.extract_keywords(all_text, top_n=10)
        
        # Group messages by topic
        topics = {}
        
        for keyword in keywords:
            related_messages = [
                msg for msg in messages 
                if keyword.lower() in msg['content'].lower()
            ]
            
            if len(related_messages) >= 3:
                # Get unique participants
                participants = list(set([msg['username'] for msg in related_messages]))
                
                # Create summary from first few messages
                summary_texts = [msg['content'] for msg in related_messages[:3]]
                summary = ' '.join(summary_texts)[:200] + '...'
                
                topics[keyword] = {
                    'summary': summary,
                    'participants': participants,
                    'count': len(related_messages)
                }
        
        return topics
    
    def _extract_qa_pairs(self, messages: List[Dict]) -> List[Dict]:
        """Extract question-answer pairs"""
        qa_pairs = []
        
        question_markers = ['?', 'how', 'what', 'why', 'when', 'where', 'who',
                           'kya', 'kaise', 'kab', 'kahan', 'kyun']
        
        for i, msg in enumerate(messages):
            content = msg['content'].lower()
            
            # Check if it's a question
            is_question = any(marker in content for marker in question_markers)
            
            if is_question and i < len(messages) - 1:
                # Look for answer in next few messages
                potential_answers = messages[i+1:min(i+4, len(messages))]
                
                if potential_answers:
                    qa_pairs.append({
                        'question': msg['content'],
                        'asker': msg['username'],
                        'answer': potential_answers[0]['content'],
                        'answerer': potential_answers[0]['username'],
                        'timestamp': msg['created_at'].isoformat()
                    })
        
        return qa_pairs[:10]  # Limit to top 10
    
    def _extract_decisions(self, messages: List[Dict]) -> List[Dict]:
        """Extract decisions and conclusions"""
        decisions = []
        
        decision_markers = [
            'decided', 'agreed', 'will do', 'let\'s', 'we should',
            'conclusion', 'final', 'resolved', 'settled',
            'faisla', 'theek hai', 'done', 'perfect'
        ]
        
        for msg in messages:
            content = msg['content'].lower()
            
            if any(marker in content for marker in decision_markers):
                decisions.append({
                    'decision': msg['content'],
                    'decided_by': msg['username'],
                    'timestamp': msg['created_at'].isoformat()
                })
        
        return decisions
    
    def _extract_resources(self, messages: List[Dict]) -> List[Dict]:
        """Extract links and resources"""
        resources = []
        
        url_pattern = re.compile(r'(https?://[^\s]+)')
        
        for msg in messages:
            urls = url_pattern.findall(msg['content'])
            
            for url in urls:
                resources.append({
                    'url': url,
                    'shared_by': msg['username'],
                    'context': msg['content'][:100],
                    'timestamp': msg['created_at'].isoformat()
                })
        
        return resources
    
    def _save_knowledge(self, channel_id: int, knowledge: Dict):
        """Save knowledge to database"""
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                output_data = {
                    'knowledge_entries': len(knowledge['knowledge_entries']),
                    'qa_pairs': len(knowledge['qa_pairs']),
                    'decisions': len(knowledge['decisions']),
                    'resources': len(knowledge['resources']),
                    'total_items': knowledge['total_items']
                }
                
                cur.execute("""
                    INSERT INTO ai_agent_logs 
                    (channel_id, action_type, input_text, 
                     output_text, confidence_score)
                    VALUES (%s, %s, %s, %s, %s)
                """, (
                    channel_id, 'knowledge_extraction',
                    f"Extracted knowledge from conversations",
                    json.dumps(output_data),
                    min(knowledge['total_items'] / 10, 1.0)
                ))
                
                conn.commit()
        except Exception as e:
            print(f"[KNOWLEDGE] Error saving knowledge: {e}")
        finally:
            if conn:
                conn.close()
    
    def search_knowledge(self, channel_id: int, query: str, 
                        limit: int = 10) -> List[Dict]:
        """
        Search knowledge base
        
        Args:
            channel_id: Channel to search in
            query: Search query
            limit: Max results
            
        Returns:
            Matching knowledge items
        """
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                # Search in logged knowledge
                cur.execute("""
                    SELECT 
                        id, input_text, output_text, created_at
                    FROM ai_agent_logs
                    WHERE channel_id = %s 
                    AND action_type = 'knowledge_extraction'
                    AND (input_text LIKE %s OR output_text LIKE %s)
                    ORDER BY created_at DESC
                    LIMIT %s
                """, (channel_id, f'%{query}%', f'%{query}%', limit))
                
                results = cur.fetchall()
                
                return [{
                    'id': r['id'],
                    'description': r['input_text'],
                    'data': json.loads(r['output_text']) if r['output_text'] else {},
                    'created_at': r['created_at'].isoformat() if r['created_at'] else None
                } for r in results]
                
        except Exception as e:
            print(f"[KNOWLEDGE] Error searching knowledge: {e}")
            return []
        finally:
            if conn:
                conn.close()
    
    def get_knowledge_history(self, channel_id: int, 
                             limit: int = 10) -> List[Dict]:
        """Get knowledge extraction history"""
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT 
                        id, output_text, confidence_score, created_at
                    FROM ai_agent_logs
                    WHERE channel_id = %s 
                    AND action_type = 'knowledge_extraction'
                    ORDER BY created_at DESC
                    LIMIT %s
                """, (channel_id, limit))
                
                logs = cur.fetchall()
                
                return [{
                    'id': log['id'],
                    'knowledge_data': json.loads(log['output_text']) if log['output_text'] else {},
                    'quality_score': round(log['confidence_score'], 2) if log['confidence_score'] else 0,
                    'created_at': log['created_at'].isoformat() if log['created_at'] else None
                } for log in logs]
                
        except Exception as e:
            print(f"[KNOWLEDGE] Error fetching history: {e}")
            return []
        finally:
            if conn:
                conn.close()

