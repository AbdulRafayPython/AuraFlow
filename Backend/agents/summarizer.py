"""
Summarizer Agent
================
Intelligent chat summarization using hybrid approach:
- Extractive method for quick summaries
- Gemini AI for polished, contextual summaries
Supports both English and Roman Urdu conversations
"""

import re
from typing import List, Dict, Optional, Tuple
from datetime import datetime
import math
import warnings
from collections import Counter
from dotenv import load_dotenv
import os


from database import get_db_connection
from utils.ai.text_processor import TextProcessor

load_dotenv()

# Gemini API integration
try:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", FutureWarning)
        import google.generativeai as genai
    from config import GEMINI_API_KEY
    GEMINI_AVAILABLE = bool(GEMINI_API_KEY)
    if GEMINI_AVAILABLE:
        genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
except ImportError:
    GEMINI_AVAILABLE = False
    print("[SUMMARIZER] Gemini AI not available - using extractive method only")
except Exception as e:
    GEMINI_AVAILABLE = False
    print(f"[SUMMARIZER] Gemini configuration error: {e}")


class SummarizerAgent:
    """
    Summarize long chat conversations into concise summaries
    Uses extractive summarization with sentence scoring
    """
    
    def __init__(self):
        self.text_processor = TextProcessor()
        self.min_messages_for_summary = 20  # Minimum messages to trigger summary
        self.max_summary_sentences = 10     # Maximum sentences in extractive summary
        self.gemini_available = GEMINI_AVAILABLE
        
        # Initialize Gemini model if available
        if self.gemini_available:
            try:
                # Use gemini-2.0-flash directly — fast, reliable, free tier friendly
                self.gemini_model = genai.GenerativeModel('gemini-2.0-flash')
                print("[SUMMARIZER] ✅ Gemini model initialized (gemini-2.0-flash)")
            except Exception as e:
                print(f"[SUMMARIZER] Failed to initialize Gemini: {e}")
                self.gemini_available = False
        
    def summarize_channel(self, channel_id: int, message_count: int = 100, 
                         user_id: Optional[int] = None) -> Dict:
        """
        Summarize recent messages in a channel
        
        Args:
            channel_id: Channel ID to summarize
            message_count: Number of recent messages to analyze
            user_id: User requesting the summary (for logging)
            
        Returns:
            Dict with summary and metadata
        """
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                # Fetch recent messages
                cur.execute("""
                    SELECT 
                        m.id, m.content, m.sender_id, m.created_at,
                        u.username, u.display_name
                    FROM messages m
                    JOIN users u ON m.sender_id = u.id
                    WHERE m.channel_id = %s 
                      AND m.message_type = 'text'
                      AND LENGTH(m.content) > 3
                    ORDER BY m.created_at DESC
                    LIMIT %s
                """, (channel_id, message_count))
                
                messages = cur.fetchall()
                
                print(f"[SUMMARIZER] Fetched {len(messages)} messages from database for channel {channel_id}")
                
                if len(messages) < self.min_messages_for_summary:
                    error_msg = f'Not enough messages to summarize. Found {len(messages)}, need at least {self.min_messages_for_summary} messages.'
                    print(f"[SUMMARIZER] ERROR: {error_msg}")
                    return {
                        'success': False,
                        'error': error_msg,
                        'message_count': len(messages)
                    }
                
                # Reverse to chronological order
                messages = list(reversed(messages))
                print(f"[SUMMARIZER] Messages reversed to chronological order")
                
                # Generate summary
                print(f"[SUMMARIZER] Generating extractive summary...")
                summary_result = self._generate_summary(messages)
                print(f"[SUMMARIZER] Extractive summary generated: {len(summary_result.get('summary', ''))} chars")
                
                # Polish with Gemini if available
                if self.gemini_available:
                    print(f"[SUMMARIZER] Attempting Gemini enhancement (Gemini available: {self.gemini_available})...")
                    try:
                        gemini_summary = self._generate_gemini_summary(messages, summary_result)
                        if gemini_summary:
                            print(f"[SUMMARIZER] Gemini enhancement successful: {len(gemini_summary)} chars")
                            summary_result['summary'] = gemini_summary
                            summary_result['method'] = 'gemini-ai'
                            
                            # Extract key points from "KEY DECISIONS:" section
                            key_points = self._extract_key_decisions(gemini_summary)
                            if key_points:
                                summary_result['key_points'] = key_points
                                print(f"[SUMMARIZER] Extracted {len(key_points)} key decisions from Gemini summary")
                        else:
                            print(f"[SUMMARIZER] Gemini returned None, using extractive only")
                            summary_result['method'] = 'extractive'
                    except Exception as e:
                        print(f"[SUMMARIZER] Gemini enhancement failed: {e}")
                        import traceback
                        traceback.print_exc()
                        summary_result['method'] = 'extractive'
                else:
                    print(f"[SUMMARIZER] Gemini not available (API key missing)")
                    summary_result['method'] = 'extractive'
                
                print(f"[SUMMARIZER] Generated summary with {len(summary_result['key_points'])} key points using {summary_result.get('method', 'extractive')} method")
                
                # Save summary to database
                summary_id = self._save_summary(
                    channel_id=channel_id,
                    summary_text=summary_result['summary'],
                    message_count=len(messages),
                    start_message_id=messages[0]['id'],
                    end_message_id=messages[-1]['id'],
                    created_by=user_id,
                    participants=summary_result['participants']
                )
                
                # Log agent activity
                self._log_activity(
                    channel_id=channel_id,
                    user_id=user_id,
                    input_data=f"Analyzed {len(messages)} messages",
                    output_data=summary_result['summary'][:500],
                    status='success'
                )
                
                result = {
                    'success': True,
                    'summary_id': summary_id,
                    'summary': summary_result['summary'],
                    'key_points': summary_result['key_points'],
                    'message_count': len(messages),
                    'participants': summary_result['participants'],
                    'method': summary_result.get('method', 'extractive'),
                    'time_range': {
                        'start': messages[0]['created_at'].isoformat(),
                        'end': messages[-1]['created_at'].isoformat()
                    }
                }
                
                print(f"[SUMMARIZER] Returning success result: {result.keys()}")
                return result
                
        except Exception as e:
            print(f"[SUMMARIZER] Error: {e}")
            self._log_activity(
                channel_id=channel_id,
                user_id=user_id,
                input_data=f"Attempted to summarize {message_count} messages",
                output_data=None,
                status='failed',
                error_message=str(e)
            )
            return {
                'success': False,
                'error': str(e)
            }
        finally:
            if conn:
                conn.close()
    
    def _generate_summary(self, messages: List[Dict]) -> Dict:
        """
        Generate summary using improved extractive method with deduplication
        
        Args:
            messages: List of message dictionaries
            
        Returns:
            Dict with summary, key points, and metadata
        """
        # Extract text from messages
        texts = []
        participants = set()
        
        for msg in messages:
            cleaned = self.text_processor.clean_text(
                msg['content'],
                remove_urls=False,  # Keep URLs for context
                remove_mentions=False,
                remove_emojis=True
            )
            
            if len(cleaned) > 10:  # Filter very short messages
                texts.append({
                    'text': cleaned,
                    'original': msg['content'],
                    'author': msg['display_name'] or msg['username'],
                    'timestamp': msg['created_at']
                })
                participants.add(msg['display_name'] or msg['username'])
        
        if not texts:
            return {
                'summary': 'No significant content to summarize.',
                'key_points': [],
                'participants': list(participants)
            }
        
        # Score sentences
        scored_sentences = self._score_sentences(texts)
        
        # Select diverse top sentences (avoid repetition)
        num_sentences = min(self.max_summary_sentences, max(5, len(texts) // 8))
        top_sentences = self._select_diverse_sentences(scored_sentences, num_sentences)
        
        # Sort by original order (chronological)
        top_sentences.sort(key=lambda x: x['index'])
        
        # Build summary with better formatting
        summary_parts = self._format_summary(top_sentences)
        summary = '\n'.join(summary_parts)
        
        # Extract key points (most frequent topics)
        all_text = ' '.join([t['text'] for t in texts])
        key_points = self.text_processor.extract_keywords(all_text, top_n=7)
        
        return {
            'summary': summary,
            'key_points': key_points,
            'participants': list(participants)
        }
    
    def _select_diverse_sentences(self, scored_sentences: List[Dict], num_sentences: int) -> List[Dict]:
        """
        Select diverse sentences avoiding repetition and near-duplicates
        
        Args:
            scored_sentences: List of scored sentence dicts
            num_sentences: Number of sentences to select
            
        Returns:
            List of selected diverse sentences
        """
        selected = []
        seen_texts = set()
        
        for sentence in scored_sentences:
            if len(selected) >= num_sentences:
                break
            
            text_normalized = sentence['text'].lower().strip()
            
            # Skip if too similar to already selected
            is_duplicate = False
            for seen in seen_texts:
                # Calculate similarity (simple word overlap)
                words1 = set(text_normalized.split())
                words2 = set(seen.split())
                if len(words1) == 0 or len(words2) == 0:
                    continue
                overlap = len(words1 & words2) / len(words1 | words2)
                if overlap > 0.7:  # 70% similarity threshold
                    is_duplicate = True
                    break
            
            if not is_duplicate:
                selected.append(sentence)
                seen_texts.add(text_normalized)
        
        return selected
    
    def _format_summary(self, sentences: List[Dict]) -> List[str]:
        """
        Format sentences into clean, structured summary
        
        Args:
            sentences: List of sentence dicts
            
        Returns:
            List of formatted strings
        """
        # Categorize sentences
        questions_answers = []
        discussions = []
        decisions = []
        
        i = 0
        while i < len(sentences):
            item = sentences[i]
            text = item['text']
            author = item['author']
            
            # Check if already processed
            if item.get('skip'):
                i += 1
                continue
            
            # Detect Q&A pairs
            if '?' in text and i + 1 < len(sentences):
                next_item = sentences[i + 1]
                if next_item['author'] != author and '?' not in next_item['text']:
                    questions_answers.append({
                        'question': text,
                        'q_author': author,
                        'answer': next_item['text'],
                        'a_author': next_item['author']
                    })
                    sentences[i + 1]['skip'] = True
                    i += 2
                    continue
            
            # Categorize by type
            if any(word in text.lower() for word in ['decided', 'decision', 'final', 'agreed', 'confirmed', 'will use']):
                decisions.append({'author': author, 'text': text})
            elif '?' in text:
                questions_answers.append({
                    'question': text,
                    'q_author': author,
                    'answer': None,
                    'a_author': None
                })
            else:
                discussions.append({'author': author, 'text': text})
            
            i += 1
        
        # Build clean formatted output
        formatted = []
        
        # Add Q&A section
        if questions_answers:
            for idx, qa in enumerate(questions_answers, 1):
                if qa['answer']:
                    formatted.append(f"Q{idx}: {qa['question']}")
                    formatted.append(f"A{idx}: {qa['answer']}")
                    formatted.append("")  # Blank line for spacing
                else:
                    formatted.append(f"Q{idx}: {qa['question']}")
                    formatted.append("")
        
        # Add discussions
        if discussions:
            for item in discussions:
                formatted.append(f"• {item['text']}")
        
        # Add decisions at the end
        if decisions:
            if discussions:
                formatted.append("")  # Separator
            formatted.append("KEY DECISIONS:")
            for item in decisions:
                formatted.append(f"✓ {item['text']}")
        
        return formatted
    
    def _score_sentences(self, texts: List[Dict]) -> List[Dict]:
        """
        Score sentences based on various features with improved algorithm
        
        Args:
            texts: List of text dictionaries
            
        Returns:
            Sorted list of scored sentences
        """
        # Build word frequency (excluding stop words)
        all_words = []
        stop_words = {'is', 'a', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
                      'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during'}
        
        for item in texts:
            words = [w for w in item['text'].lower().split() if w not in stop_words and len(w) > 2]
            all_words.extend(words)
        
        word_freq = Counter(all_words)
        
        # Calculate TF-IDF-like scores
        doc_count = len(texts)
        word_doc_count = Counter()
        for item in texts:
            unique_words = set([w for w in item['text'].lower().split() if w not in stop_words])
            for word in unique_words:
                word_doc_count[word] += 1
        
        # Score each sentence
        scored = []
        for idx, item in enumerate(texts):
            text = item['text']
            words = [w for w in text.lower().split() if w not in stop_words and len(w) > 2]
            
            if not words:
                continue
            
            # Calculate features
            # 1. TF-IDF score (more unique content = higher score)
            tfidf_score = 0
            for word in set(words):
                tf = word_freq.get(word, 0) / len(all_words)
                idf = math.log(doc_count / (word_doc_count.get(word, 1) + 1))
                tfidf_score += tf * idf
            tfidf_score = tfidf_score / len(words) if words else 0
            
            # 2. Length score (prefer informative length)
            length_score = self._length_score(len(words))
            
            # 3. Position score (slight preference for middle messages)
            position_score = 1.0 - abs((idx / len(texts)) - 0.5) * 0.3
            
            # 4. Question/important markers
            importance_score = self._importance_score(text)
            
            # 5. Information density (noun/verb ratio, technical terms)
            density_score = self._information_density(text)
            
            # Combined score with better weighting
            total_score = (
                tfidf_score * 0.25 +        # Uniqueness
                length_score * 0.15 +       # Optimal length
                position_score * 0.1 +      # Position
                importance_score * 0.3 +    # Importance markers
                density_score * 0.2         # Information content
            )
            
            scored.append({
                'text': text,
                'author': item['author'],
                'score': total_score,
                'index': idx
            })
        
        # Sort by score
        scored.sort(key=lambda x: x['score'], reverse=True)
        
        return scored
    
    def _information_density(self, text: str) -> float:
        """
        Calculate information density based on content richness
        """
        score = 0.5  # Base score
        
        # Technical/informative keywords indicate dense information
        technical_terms = [
            'docker', 'flask', 'react', 'mysql', 'redis', 'api', 'database',
            'frontend', 'backend', 'authentication', 'deploy', 'framework',
            'containerization', 'platform', 'application', 'interface',
            'python', 'javascript', 'library', 'tool', 'development'
        ]
        
        text_lower = text.lower()
        term_count = sum(1 for term in technical_terms if term in text_lower)
        score += min(0.4, term_count * 0.1)  # Max +0.4 for technical content
        
        # Explanatory phrases indicate informative content
        explanatory_phrases = ['is a', 'means', 'refers to', 'allows', 'enables', 
                              'provides', 'designed for', 'used for']
        if any(phrase in text_lower for phrase in explanatory_phrases):
            score += 0.2
        
        # Decision/conclusion phrases
        decision_phrases = ['decided', 'will use', 'confirmed', 'final', 'agreed']
        if any(phrase in text_lower for phrase in decision_phrases):
            score += 0.3
        
        return min(1.0, score)
    
    def _length_score(self, word_count: int) -> float:
        """
        Score based on sentence length (Gaussian curve)
        Prefer medium-length sentences (15-30 words)
        """
        optimal_length = 20
        if word_count < 5:
            return 0.3
        
        # Gaussian-like scoring
        score = math.exp(-((word_count - optimal_length) ** 2) / (2 * 100))
        return max(0.3, min(1.0, score))
    
    def _importance_score(self, text: str) -> float:
        """
        Score based on importance markers
        """
        score = 0.5  # Base score
        
        # Question marks indicate important discussions
        if '?' in text:
            score += 0.3
        
        # Exclamation marks indicate emphasis
        if '!' in text:
            score += 0.2
        
        # Important keywords
        important_keywords = [
            'important', 'urgent', 'decided', 'agreed', 'meeting',
            'deadline', 'issue', 'problem', 'solution', 'update',
            'zaruri', 'important', 'faisla', 'meeting'  # Roman Urdu
        ]
        
        text_lower = text.lower()
        for keyword in important_keywords:
            if keyword in text_lower:
                score += 0.2
                break
        
        return min(1.0, score)
    
    def _generate_gemini_summary(self, messages: List[Dict], extractive_result: Dict) -> Optional[str]:
        """
        Generate polished summary using Gemini AI with clean formatting
        
        Args:
            messages: List of message dictionaries
            extractive_result: Result from extractive summarization
            
        Returns:
            Polished summary string or None if failed
        """
        try:
            # Prepare conversation context
            conversation_text = []
            for msg in messages:
                author = msg.get('display_name') or msg.get('username', 'User')
                content = msg.get('content', '')
                conversation_text.append(f"{author}: {content}")
            
            conversation = '\n'.join(conversation_text)
            
            # Prepare enhanced prompt for discussion-style summary
            prompt = """You are a professional conversation summarizer. Analyze this chat conversation and create a natural, flowing discussion summary.

CONVERSATION:
""" + conversation + """

IMPORTANT FORMATTING RULES:
1. Write in a natural discussion format, NOT Q&A format
2. Summarize topics as they were discussed in the conversation
3. Use bullet points for main discussion topics
4. Group important decisions at the end under "KEY DECISIONS:" with dashes
5. Keep it concise, clear, and conversational
6. Do NOT add any introduction or conclusion text
7. Start directly with the content
8. Add blank lines between sections for readability

Example format:
- The team discussed Docker, which is a containerization platform that packages applications with their dependencies. This allows for consistent deployment across different environments.

- Flask was confirmed as the backend framework. It's a lightweight Python web framework that handles HTTP requests and routing efficiently.

- The group covered several technical concepts including MySQL (a relational database), Redis (a cache database), and React (a JavaScript library for building user interfaces).

- Frontend and backend architecture were explained - frontend being the client-side interface users interact with, while backend handles server-side logic and data processing.

KEY DECISIONS:
- MySQL will be used for the database
- React will be the frontend framework
- Deployment will be on Docker containers
- Flask will be used for backend development

Now create the summary in this discussion style:"""

            # Generate with Gemini
            response = self.gemini_model.generate_content(prompt)
            
            if response and response.text:
                return response.text.strip()
            
            return None
            
        except Exception as e:
            print(f"[SUMMARIZER] Gemini API error: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    def _extract_key_decisions(self, summary_text: str) -> List[str]:
        """
        Extract key decisions/points from summary text that contains "KEY DECISIONS:" section
        
        Args:
            summary_text: Full summary text including KEY DECISIONS section
            
        Returns:
            List of key decision strings
        """
        try:
            # Find the KEY DECISIONS section
            if 'KEY DECISIONS:' not in summary_text:
                return []
            
            # Split at KEY DECISIONS
            parts = summary_text.split('KEY DECISIONS:')
            if len(parts) < 2:
                return []
            
            decisions_section = parts[1].strip()
            
            # Extract each line that starts with a dash or bullet
            key_points = []
            for line in decisions_section.split('\n'):
                line = line.strip()
                # Match lines starting with -, •, or *
                if line.startswith('-') or line.startswith('•') or line.startswith('*'):
                    # Remove the leading dash/bullet and clean up
                    point = line[1:].strip()
                    if point:  # Only add non-empty points
                        key_points.append(point)
            
            return key_points
            
        except Exception as e:
            print(f"[SUMMARIZER] Error extracting key decisions: {e}")
            return []
    
    def _save_summary(self, channel_id: int, summary_text: str, 
                     message_count: int, start_message_id: int,
                     end_message_id: int, created_by: Optional[int],
                     participants: List[str]) -> int:
        """Save summary to database"""
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                # Use actual schema: summary, generated_by (not summary_text, created_by)
                generated_by = 'summarizer_agent'
                if created_by:
                    cur.execute("SELECT username FROM users WHERE id = %s", (created_by,))
                    user = cur.fetchone()
                    if user:
                        generated_by = user['username']
                
                import json
                participants_json = json.dumps(participants)
                
                cur.execute("""
                    INSERT INTO conversation_summaries 
                    (channel_id, summary, generated_by, message_count, participants)
                    VALUES (%s, %s, %s, %s, %s)
                """, (channel_id, summary_text, generated_by, message_count, participants_json))
                
                conn.commit()
                return cur.lastrowid
        finally:
            if conn:
                conn.close()
    
    def _log_activity(self, channel_id: Optional[int], user_id: Optional[int],
                     input_data: str, output_data: Optional[str],
                     status: str, error_message: Optional[str] = None):
        """Log agent activity"""
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                # Get or create the summarizer agent ID
                cur.execute("""
                    SELECT id FROM ai_agents WHERE type = 'summarizer' LIMIT 1
                """)
                agent_row = cur.fetchone()
                
                if not agent_row:
                    # Create summarizer agent if it doesn't exist
                    cur.execute("""
                        INSERT INTO ai_agents (name, type, description, is_active)
                        VALUES ('Summarizer Agent', 'summarizer', 
                                'AI-powered conversation summarization', TRUE)
                    """)
                    agent_id = cur.lastrowid
                else:
                    agent_id = agent_row['id']
                
                # Log with agent_id for proper stats tracking
                cur.execute("""
                    INSERT INTO ai_agent_logs 
                    (agent_id, action_type, channel_id, user_id, 
                     input_text, output_text)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (agent_id, 'summarize_channel', channel_id, user_id,
                      input_data, output_data))
                
                conn.commit()
        except Exception as e:
            print(f"[SUMMARIZER] Failed to log activity: {e}")
        finally:
            if conn:
                conn.close()
    
    def get_recent_summaries(self, channel_id: int, limit: int = 5) -> List[Dict]:
        """
        Get recent summaries for a channel
        
        Args:
            channel_id: Channel ID
            limit: Maximum number of summaries to return
            
        Returns:
            List of summary dictionaries
        """
        conn = None
        try:
            print(f"[SUMMARIZER] Fetching summaries for channel {channel_id}, limit {limit}")
            conn = get_db_connection()
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT 
                        cs.id, cs.summary, cs.generated_by,
                        cs.created_at, cs.message_count, cs.participants, cs.key_points
                    FROM conversation_summaries cs
                    WHERE cs.channel_id = %s
                    ORDER BY cs.created_at DESC
                    LIMIT %s
                """, (channel_id, limit))
                
                summaries = cur.fetchall()
                
                result = []
                for s in summaries:
                    # Parse participants if it's JSON string
                    participants = s.get('participants', [])
                    if isinstance(participants, str):
                        try:
                            import json
                            participants = json.loads(participants)
                        except:
                            participants = []
                    
                    # Parse key_points if it's JSON string
                    key_points = s.get('key_points', [])
                    if isinstance(key_points, str):
                        try:
                            import json
                            key_points = json.loads(key_points)
                        except:
                            key_points = []
                    
                    result.append({
                        'id': s['id'],
                        'summary': s['summary'],
                        'created_at': s['created_at'].isoformat() if s['created_at'] else None,
                        'created_by': s['generated_by'],
                        'message_count': s.get('message_count', 0),
                        'participants': participants,
                        'key_points': key_points
                    })
                
                return result
                
        except Exception as e:
            print(f"[SUMMARIZER] Error fetching summaries: {e}")
            import traceback
            traceback.print_exc()
            return []
        finally:
            if conn:
                conn.close()
