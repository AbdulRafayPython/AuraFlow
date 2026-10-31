"""
Summarizer Agent
================
Intelligent chat summarization using hybrid approach:
- Extractive method for quick summaries
- LLM for polished, contextual summaries
Supports both English and Roman Urdu conversations.

Autonomous role: subscribes to ``focus.drift`` (emitted by
the focus agent when channel keywords shift) and produces a concise
checkpoint summary of the *previous* topic before it gets buried by the
new one. The summary is broadcast via Socket.IO as a
``summary_checkpoint`` event — a soft collapsible card the frontend can
render alongside the channel. Adaptive per-channel minimum-messages
threshold lives in ``agent_state.thresholds.min_messages``.
"""

import re
import time as _time
from typing import List, Dict, Optional, Tuple
from datetime import datetime
import math
from collections import Counter
from dotenv import load_dotenv
import os


from database import get_db_connection
from utils.ai.text_processor import TextProcessor
from agents.base import AutonomousAgent
from agents import event_bus as _event_bus
from agents import memory as _agent_memory
from agents._settings import get_personal_settings


_SUMMARIZER_DEFAULTS = {
    'auto_summarize_enabled': False,
    'schedule_time': '21:00',
    'auto_summarize_message_count': 200,
    'summary_length': 'standard',
    'include_topics': True,
    'include_action_items': True,
}


_SUMMARY_LEN_BUDGET = {
    'brief':    {'max_sentences': 5,  'max_chars': 600},
    'standard': {'max_sentences': 10, 'max_chars': 1500},
    'detailed': {'max_sentences': 18, 'max_chars': 3000},
}

load_dotenv()

# Value written to conversation_summaries.method when the LLM produced the
# summary. Rows written before the DeepSeek migration carry 'gemini-ai'.
# Readers must not test for a specific AI value: only 'extractive' means
# rule-based, everything else is AI-generated.
AI_METHOD = 'ai'


def _truncate_on_boundary(text: str, max_chars: int) -> str:
    """Trim ``text`` to ``max_chars`` at the last sentence or word break.

    The old code sliced mid-word and appended an ellipsis, which read as a
    bug in the UI. Prefer a sentence end; fall back to a word boundary.
    """
    if len(text) <= max_chars:
        return text
    window = text[:max_chars]
    cut = max(window.rfind('. '), window.rfind('! '), window.rfind('? '))
    if cut > max_chars * 0.6:
        return window[:cut + 1].rstrip()
    cut = window.rfind(' ')
    if cut > 0:
        return window[:cut].rstrip() + '…'
    return window.rstrip() + '…'


# LLM integration (DeepSeek). No startup validation ping: it cost a request
# on every worker boot, and a bad key surfaces on the first real call anyway
# with the extractive path already in place as the fallback.
try:
    from utils.ai.llm_client import get_llm_client, is_llm_available, humanize_text
    LLM_AVAILABLE = is_llm_available()
    _llm_client = get_llm_client()
    if LLM_AVAILABLE:
        print("[SUMMARIZER] DeepSeek client ready")
    else:
        print("[SUMMARIZER] No DEEPSEEK_API_KEY - extractive summaries only")
except Exception as e:
    LLM_AVAILABLE = False
    _llm_client = None
    humanize_text = lambda t: t  # noqa: E731 — identity fallback
    print(f"[SUMMARIZER] LLM configuration error: {e}")


_SUMMARY_SYSTEM = (
    "You summarise team chat for someone who was away and wants to catch up "
    "in under a minute.\n"
    "- Report only what was actually said. Never infer an outcome that was "
    "not stated, and never invent a participant, number, or date.\n"
    "- Write about the discussion, not about the transcript. Do not say 'the "
    "chat covered' or 'users discussed'; name the people involved.\n"
    "- Distinguish three things: what was discussed, what was decided, and "
    "what someone still has to do. A question nobody answered is not a "
    "decision.\n"
    "- Plain sentences. No markdown, no bold, no headings, no dashes as "
    "punctuation.\n"
    "- The chat may mix English, Roman Urdu and Hinglish. Summarise in "
    "English regardless."
)

# Sentence/word budget passed into the prompt per summary_length setting, so
# verbosity is controlled at generation time instead of by truncating the
# finished summary mid-word.
_SUMMARY_PROMPT_BUDGET = {
    'brief':    ("2 to 3 sentences total", 350),
    'standard': ("4 to 6 sentences total", 700),
    'detailed': ("8 to 12 sentences total", 1200),
}


class SummarizerAgent(AutonomousAgent):
    """
    Summarize long chat conversations into concise summaries
    Uses extractive summarization with sentence scoring
    """

    # ── Autonomous contract ─────────────────────────────
    NAME = "summarizer"
    GOAL = {"checkpoint_topics_before_drift_buries_them": True}
    SUBSCRIBES = [_event_bus.TOPIC_FOCUS_DRIFT]
    SCOPE_TYPE = _agent_memory.SCOPE_CHANNEL
    COOLDOWN_SECONDS = 30 * 60  # at most one auto-summary / channel / 30 min

    _DEFAULT_MIN_MESSAGES = 15  # need at least this many to summarise
    _SUMMARISE_LAST_N    = 80   # how far back the auto-summary looks

    def __init__(self):
        self.text_processor = TextProcessor()
        self.min_messages_for_summary = 20  # Minimum messages to trigger summary
        self.max_summary_sentences = 10     # Maximum sentences in extractive summary
        self.llm = _llm_client
        self.llm_available = LLM_AVAILABLE and _llm_client is not None
        
    def summarize_channel(self, channel_id: int, message_count: int = 100,
                         user_id: Optional[int] = None) -> Dict:
        """
        Summarize recent messages in a channel

        Args:
            channel_id: Channel ID to summarize
            message_count: Number of recent messages to analyze. When the
                user has saved an ``auto_summarize_message_count`` preference
                and the caller passed the default (100), the saved
                preference wins so the slider in the settings UI matters.
            user_id: User requesting the summary (for logging). Also drives
                ``summary_length``, ``include_topics``, ``include_action_items``.

        Returns:
            Dict with summary and metadata
        """
        cfg = (get_personal_settings(user_id, 'summarizer', _SUMMARIZER_DEFAULTS)
               if user_id else dict(_SUMMARIZER_DEFAULTS))
        # If caller passed the legacy default 100, let the user's stored
        # preference take over. Explicit override (any other int) wins.
        if message_count == 100:
            try:
                message_count = max(20, min(500,
                    int(cfg.get('auto_summarize_message_count', 100))))
            except (TypeError, ValueError):
                pass
        # Cap extractive sentence count by the user's chosen verbosity.
        budget = _SUMMARY_LEN_BUDGET.get(
            str(cfg.get('summary_length') or 'standard').lower(),
            _SUMMARY_LEN_BUDGET['standard'],
        )
        original_max_sentences = self.max_summary_sentences
        self.max_summary_sentences = budget['max_sentences']
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
                
                # Upgrade to an LLM summary when one is available. The
                # extractive result stays as the fallback and as the input
                # hint, so a provider outage degrades instead of failing.
                summary_result['method'] = 'extractive'
                if self.llm_available:
                    try:
                        llm_result = self._generate_llm_summary(
                            messages,
                            length=str(cfg.get('summary_length') or 'standard'),
                        )
                        if llm_result and llm_result.get('summary'):
                            summary_result['summary'] = llm_result['summary']
                            summary_result['method'] = AI_METHOD
                            if llm_result.get('key_points'):
                                summary_result['key_points'] = llm_result['key_points']
                            summary_result['action_items'] = llm_result.get(
                                'action_items') or []
                            print(f"[SUMMARIZER] LLM summary: "
                                  f"{len(llm_result['summary'])} chars, "
                                  f"{len(summary_result['key_points'])} topics, "
                                  f"{len(summary_result['action_items'])} actions")
                        else:
                            print("[SUMMARIZER] LLM returned nothing, using extractive")
                    except Exception as e:
                        print(f"[SUMMARIZER] LLM summary failed: {e}")
                else:
                    print("[SUMMARIZER] LLM not available (no API key)")
                
                print(f"[SUMMARIZER] Generated summary with {len(summary_result['key_points'])} key points using {summary_result.get('method', 'extractive')} method")
                
                # Save summary to database
                summary_id = self._save_summary(
                    channel_id=channel_id,
                    summary_text=summary_result['summary'],
                    message_count=len(messages),
                    created_by=user_id,
                    participants=summary_result['participants'],
                    method=summary_result.get('method', 'extractive')
                )
                
                # Log agent activity
                self._log_activity(
                    channel_id=channel_id,
                    user_id=user_id,
                    input_data=f"Analyzed {len(messages)} messages",
                    output_data=summary_result['summary'][:500],
                    status='success'
                )
                
                # Honor include_topics / include_action_items toggles.
                # We always compute the values upstream (cheap) but blank
                # them out here when the user has opted out, so callers
                # see a stable response shape.
                topics_out = (summary_result['key_points']
                              if cfg.get('include_topics', True) else [])
                # Action items are now generated as their own list rather
                # than being aliased to the topic list, so "what was
                # discussed" and "what someone still has to do" stop being
                # the same three strings in the UI.
                action_items_out: List[str] = []
                if cfg.get('include_action_items', True):
                    action_items_out = list(summary_result.get('action_items') or [])

                # Safety net only. The LLM is given the length budget in the
                # prompt, so this should rarely fire; when it does (extractive
                # path on a very long channel) we still avoid a mid-word cut.
                summary_text = summary_result['summary'] or ''
                if len(summary_text) > budget['max_chars']:
                    summary_text = _truncate_on_boundary(
                        summary_text, budget['max_chars'])

                result = {
                    'success': True,
                    'summary_id': summary_id,
                    'summary': summary_text,
                    'key_points': topics_out,
                    'action_items': action_items_out,
                    'message_count': len(messages),
                    'participants': summary_result['participants'],
                    'method': summary_result.get('method', 'extractive'),
                    'summary_length': str(cfg.get('summary_length') or 'standard').lower(),
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
            # Restore the instance-level cap so a per-call override doesn't
            # leak into subsequent calls from other users.
            self.max_summary_sentences = original_max_sentences
            if conn:
                conn.close()

    def summarize_dm(self, peer_user_id: int, requester_user_id: int,
                     message_count: int = 100) -> Dict:
        """
        Summarize a 1:1 direct-message thread between ``requester_user_id``
        and ``peer_user_id``. Mirrors :meth:`summarize_channel` but reads
        from the ``direct_messages`` table and **does not persist** the
        result — DM summaries are ephemeral by design and returned only to
        the requester.

        Args:
            peer_user_id: the other participant in the DM thread.
            requester_user_id: the user asking for the summary; drives
                personal settings (``summary_length``,
                ``auto_summarize_message_count``, ``include_topics``,
                ``include_action_items``).
            message_count: cap on messages to analyse (legacy default 100
                is overridden by the requester's saved preference, same
                rule as ``summarize_channel``).

        Returns:
            Dict with the same shape as ``summarize_channel`` minus
            ``summary_id`` (no row is written) plus ``peer_user_id`` and
            ``requester_user_id`` for caller bookkeeping.
        """
        cfg = (get_personal_settings(requester_user_id, 'summarizer',
                                     _SUMMARIZER_DEFAULTS)
               if requester_user_id else dict(_SUMMARIZER_DEFAULTS))
        if message_count == 100:
            try:
                message_count = max(20, min(500,
                    int(cfg.get('auto_summarize_message_count', 100))))
            except (TypeError, ValueError):
                pass
        budget = _SUMMARY_LEN_BUDGET.get(
            str(cfg.get('summary_length') or 'standard').lower(),
            _SUMMARY_LEN_BUDGET['standard'],
        )
        original_max_sentences = self.max_summary_sentences
        self.max_summary_sentences = budget['max_sentences']

        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                # Pull both directions of the thread. The unique-pair index
                # ``idx_dm_pair`` covers (sender, receiver, created_at) so
                # the OR-of-pairs is index-friendly.
                cur.execute("""
                    SELECT
                        dm.id, dm.content, dm.sender_id, dm.created_at,
                        u.username, u.display_name
                    FROM direct_messages dm
                    JOIN users u ON dm.sender_id = u.id
                    WHERE dm.message_type = 'text'
                      AND LENGTH(dm.content) > 3
                      AND (
                            (dm.sender_id = %s AND dm.receiver_id = %s)
                         OR (dm.sender_id = %s AND dm.receiver_id = %s)
                          )
                    ORDER BY dm.created_at DESC
                    LIMIT %s
                """, (requester_user_id, peer_user_id,
                      peer_user_id, requester_user_id,
                      message_count))

                messages = cur.fetchall()
                print(f"[SUMMARIZER] Fetched {len(messages)} DM messages "
                      f"between {requester_user_id}↔{peer_user_id}")

                if len(messages) < self.min_messages_for_summary:
                    return {
                        'success': False,
                        'error': (f'Not enough messages to summarize. '
                                  f'Found {len(messages)}, need at least '
                                  f'{self.min_messages_for_summary}.'),
                        'message_count': len(messages),
                        'peer_user_id': peer_user_id,
                        'requester_user_id': requester_user_id,
                    }

                # Reverse to chronological order.
                messages = list(reversed(messages))

                summary_result = self._generate_summary(messages)

                summary_result['method'] = 'extractive'
                if self.llm_available:
                    try:
                        llm_result = self._generate_llm_summary(
                            messages,
                            length=str(cfg.get('summary_length') or 'standard'),
                            is_dm=True,
                        )
                        if llm_result and llm_result.get('summary'):
                            summary_result['summary'] = llm_result['summary']
                            summary_result['method'] = AI_METHOD
                            if llm_result.get('key_points'):
                                summary_result['key_points'] = llm_result['key_points']
                            summary_result['action_items'] = llm_result.get(
                                'action_items') or []
                    except Exception as e:
                        print(f"[SUMMARIZER] DM LLM summary failed: {e}")

                # Log to ai_agent_logs for stats — same as channel path but
                # without a channel_id.
                self._log_activity(
                    channel_id=None,
                    user_id=requester_user_id,
                    input_data=(f"DM summary requester={requester_user_id} "
                                f"peer={peer_user_id} "
                                f"messages={len(messages)}"),
                    output_data=summary_result['summary'][:500],
                    status='success',
                )

                topics_out = (summary_result['key_points']
                              if cfg.get('include_topics', True) else [])
                action_items_out: List[str] = []
                if cfg.get('include_action_items', True):
                    action_items_out = list(
                        summary_result.get('action_items') or [])

                summary_text = summary_result['summary'] or ''
                if len(summary_text) > budget['max_chars']:
                    summary_text = _truncate_on_boundary(
                        summary_text, budget['max_chars'])

                return {
                    'success': True,
                    'summary': summary_text,
                    'key_points': topics_out,
                    'action_items': action_items_out,
                    'message_count': len(messages),
                    'participants': summary_result['participants'],
                    'method': summary_result.get('method', 'extractive'),
                    'summary_length': str(
                        cfg.get('summary_length') or 'standard').lower(),
                    'peer_user_id': peer_user_id,
                    'requester_user_id': requester_user_id,
                    'time_range': {
                        'start': messages[0]['created_at'].isoformat(),
                        'end': messages[-1]['created_at'].isoformat(),
                    },
                }
        except Exception as e:
            print(f"[SUMMARIZER] summarize_dm error: {e}")
            self._log_activity(
                channel_id=None,
                user_id=requester_user_id,
                input_data=(f"DM summary attempt requester="
                            f"{requester_user_id} peer={peer_user_id}"),
                output_data=None,
                status='failed',
                error_message=str(e),
            )
            return {
                'success': False,
                'error': str(e),
                'peer_user_id': peer_user_id,
                'requester_user_id': requester_user_id,
            }
        finally:
            self.max_summary_sentences = original_max_sentences
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
    
    def _generate_llm_summary(
        self,
        messages: List[Dict],
        *,
        length: str = 'standard',
        is_dm: bool = False,
    ) -> Optional[Dict]:
        """Generate a structured summary with DeepSeek.

        Returns ``{'summary': str, 'key_points': [str], 'action_items': [str]}``
        or None on failure, in which case the caller keeps its extractive
        result.

        This asks for JSON rather than prose with a "KEY DECISIONS:" header
        that we then scrape back out with a regex. The old approach lost the
        decision list whenever the model reworded the header, and it could
        not separate a decision ("we're going with MySQL") from an action
        item ("Ali is writing the migration"), so the UI showed the same
        strings in both places. Asking for the three fields directly makes
        the split explicit and removes the parsing step entirely.
        """
        if not self.llm:
            return None
        try:
            # Cap the transcript. Very long channels blow the context window
            # and the token bill; the most recent 400 messages carry the part
            # a catch-up reader cares about.
            sample = messages[-400:] if len(messages) > 400 else messages
            lines = []
            for msg in sample:
                author = msg.get('display_name') or msg.get('username', 'User')
                content = (msg.get('content') or '').strip()
                if content:
                    lines.append(f"{author}: {content[:500]}")
            conversation = '\n'.join(lines)
            if not conversation:
                return None

            length_hint, max_tokens = _SUMMARY_PROMPT_BUDGET.get(
                length.lower(), _SUMMARY_PROMPT_BUDGET['standard'])

            scope = ("a direct message thread between two people" if is_dm
                     else "a team channel")

            prompt = (
                f"Below is {scope}.\n\n"
                f"CONVERSATION:\n{conversation}\n\n"
                "Return a JSON object with exactly these keys:\n"
                '{\n'
                '  "summary": "the catch-up narrative, ' + length_hint + '",\n'
                '  "topics": ["what was discussed, one short line each, at most 6"],\n'
                '  "decisions": ["choices the group actually settled on, at most 6"],\n'
                '  "action_items": ["who agreed to do what, phrased as '
                'Name: task, at most 6"]\n'
                '}\n\n'
                "Rules:\n"
                "- If a list has nothing real in it, return an empty array. Do "
                "not pad it.\n"
                "- A decision requires agreement in the chat. An idea someone "
                "floated is a topic, not a decision.\n"
                "- An action item requires a person and a task. If nobody was "
                "assigned anything, return an empty array.\n"
                "- summary is plain prose, no bullet characters, no markdown."
            )

            data = self.llm.complete_json(
                prompt,
                system=_SUMMARY_SYSTEM,
                temperature=0.3,
                max_tokens=max_tokens,
                timeout=30.0,   # background task, latency is not critical
            )
            if not isinstance(data, dict):
                return None

            summary = humanize_text(str(data.get('summary') or '').strip())
            if not summary:
                return None

            def _clean_list(key: str) -> List[str]:
                raw = data.get(key)
                if not isinstance(raw, list):
                    return []
                out = []
                for item in raw[:6]:
                    text = humanize_text(str(item).strip())
                    if text:
                        out.append(text[:300])
                return out

            topics = _clean_list('topics')
            decisions = _clean_list('decisions')
            actions = _clean_list('action_items')

            # `key_points` is what the API and UI already read for "the
            # headline bullets". Decisions outrank topics there when both
            # exist, because a reader skimming wants the outcome first.
            key_points = decisions + [t for t in topics if t not in decisions]

            return {
                'summary': summary,
                'key_points': key_points[:8],
                'action_items': actions,
            }
        except Exception as e:
            print(f"[SUMMARIZER] LLM summary error: {e}")
            return None


    
    def _save_summary(self, channel_id: int, summary_text: str, 
                     message_count: int, created_by: Optional[int],
                     participants: List[str], method: str = 'extractive') -> int:
        """Save summary to database"""
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
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
                    (channel_id, summary, generated_by, created_by, message_count, method, participants)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                """, (channel_id, summary_text, generated_by, created_by, message_count, method, participants_json))
                
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
                
                # Log with agent_id for proper stats tracking. On failure there
                # is no output, so the error text is stored in its place.
                cur.execute("""
                    INSERT INTO ai_agent_logs
                    (agent_id, action_type, channel_id, user_id,
                     input_text, output_text, status)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                """, (agent_id, 'summarize_channel', channel_id, user_id,
                      input_data, output_data or error_message, status))
                
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

    # ────────────────────────────────────────────────────────────────────
    # Autonomous hooks — Focus→Summarizer chain
    # ────────────────────────────────────────────────────────────────────

    def sense(self, event: dict) -> Optional[Dict]:
        """Accept ``focus.drift`` events only; count recent messages
        cheaply to decide whether there's enough material to summarise.
        """
        channel_id = event.get("channel_id")
        if not channel_id:
            return None
        # G1a per-channel override (CoverageMatrix). Falls through to
        # community-level kill-switch via base.py helper.
        if not self._is_enabled_for_channel(
            event.get("community_id"), channel_id
        ):
            return None
        # Count quickly — single COUNT(*) is cheap.
        conn = None
        msg_count = 0
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT COUNT(*) AS c FROM messages "
                    "WHERE channel_id=%s AND message_type='text' "
                    "  AND created_at >= (NOW() - INTERVAL 6 HOUR)",
                    (channel_id,),
                )
                row = cur.fetchone()
                msg_count = int((row or {}).get("c") or 0)
        except Exception:
            msg_count = 0
        finally:
            if conn:
                conn.close()
        return {
            "channel_id":   channel_id,
            "community_id": event.get("community_id"),
            "user_id":      event.get("user_id"),
            "old_topics":   event.get("old_topics") or [],
            "new_topics":   event.get("new_topics") or [],
            "jaccard":      event.get("jaccard"),
            "msg_count":    msg_count,
            # Propagate the upstream correlation_id so the collaboration
            # graph (focus → summarizer edge) can self-join agent_actions
            # on it. Without this the base class mints a fresh UUID.
            "correlation_id": event.get("correlation_id"),
            "scope_type":   _agent_memory.SCOPE_CHANNEL,
            "scope_id":     channel_id,
        }

    def decide(self, observation: Dict):
        """Skip if too few messages to summarise; act otherwise.

        The base-class 30-min cooldown is the real rate limiter — this
        function just decides whether the conversation has accumulated
        enough material for a summary to be worth reading.
        """
        msg_count = observation.get("msg_count", 0)
        threshold = self._min_messages(observation["channel_id"])
        if msg_count < threshold:
            return ("defer", observation,
                    f"msg_count_{msg_count}_below_{threshold}")
        return ("act", observation,
                f"checkpoint_msgs_{msg_count}_topics_{len(observation.get('old_topics') or [])}")

    def act(self, payload: Dict, correlation_id: str) -> Optional[Dict]:
        """Generate a summary of the previous topic and broadcast it as
        a ``summary_checkpoint`` socket event.
        """
        channel_id = payload["channel_id"]
        try:
            result = self.summarize_channel(
                channel_id=channel_id,
                message_count=self._SUMMARISE_LAST_N,
                user_id=None,
            )
        except Exception as exc:
            print(f"[SUMMARIZER] auto summarize_channel failed: {exc}")
            return {"summarised": False}
        if not result or not result.get("success"):
            return {"summarised": False, "reason": (result or {}).get("error")}

        summary_text = (result.get("summary") or "").strip()
        if not summary_text:
            return {"summarised": False, "reason": "empty_summary"}

        try:
            from app import socketio  # lazy: avoid circular import
            socketio.emit("summary_checkpoint", {
                "channel_id":     channel_id,
                "community_id":   payload.get("community_id"),
                "summary":        summary_text[:2000],
                "old_topics":     payload.get("old_topics"),
                "new_topics":     payload.get("new_topics"),
                "msg_count":      payload.get("msg_count"),
                "method":         result.get("method"),
                "correlation_id": correlation_id,
            }, room=f"channel_{channel_id}", namespace="/")
        except Exception as exc:
            print(f"[SUMMARIZER] checkpoint emit failed: {exc}")
            return {"summarised": True, "emitted": False}
        return {"summarised": True, "emitted": True,
                "preview": summary_text[:160]}

    def learn(self, action_id: int, signal: str, *, weight: float = 1.0) -> None:
        """Adapt the per-channel minimum-message threshold.

        - ``positive`` / ``engaged`` → summary was useful even at this
          message count → lower the threshold a bit so we checkpoint
          earlier next time.
        - ``negative`` / ``dismissed`` → premature/noisy → raise threshold
          so we wait for more material.
        """
        try:
            action = _agent_memory.get_action(action_id)
            if not action or not action.get("channel_id"):
                return super().learn(action_id, signal, weight=weight)
            channel_id = action["channel_id"]
            state = _agent_memory.get_state(
                self.NAME, _agent_memory.SCOPE_CHANNEL, channel_id) or {}
            th = dict(state.get("thresholds") or {})
            cur = float(th.get("min_messages", self._DEFAULT_MIN_MESSAGES))
            if signal in ("positive", "engaged"):
                cur = max(5.0, cur - 1.0 * float(weight))
            elif signal in ("negative", "dismissed"):
                cur = min(80.0, cur + 2.0 * float(weight))
            th["min_messages"] = int(round(cur))
            outcome = ("positive" if signal in ("positive", "engaged")
                       else "negative" if signal in ("negative", "dismissed")
                       else "neutral")
            _agent_memory.set_state(
                self.NAME, _agent_memory.SCOPE_CHANNEL, channel_id,
                thresholds=th, last_outcome=outcome,
            )
        except Exception as exc:
            print(f"[SUMMARIZER] learn failed: {exc}")
        super().learn(action_id, signal, weight=weight)

    def _min_messages(self, channel_id: Optional[int]) -> int:
        if not channel_id:
            return self._DEFAULT_MIN_MESSAGES
        try:
            state = _agent_memory.get_state(
                self.NAME, _agent_memory.SCOPE_CHANNEL, channel_id)
            if not state:
                return self._DEFAULT_MIN_MESSAGES
            return int((state.get("thresholds") or {})
                       .get("min_messages", self._DEFAULT_MIN_MESSAGES))
        except Exception:
            return self._DEFAULT_MIN_MESSAGES
