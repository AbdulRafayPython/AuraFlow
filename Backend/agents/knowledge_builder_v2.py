"""
Knowledge Builder Agent
=======================
Extracts structured knowledge from unstructured chat messages.

Features:
- FAQ Detection: Identifies questions and their answers
- Definition Detection: Extracts term definitions
- Decision Detection: Captures team decisions
- Auto-tagging: Generates keywords from content
- Duplicate Prevention: Avoids saving redundant entries
- Gemini AI: Enhanced extraction with fallback to rule-based

Approach: Hybrid (Gemini AI primary, rule-based fallback)
"""

import re
import json
from datetime import datetime
from database import get_db_connection
from difflib import SequenceMatcher

# ── Gemini AI integration (same pattern as summarizer.py) ────────────────────
try:
    from google import genai
    from google.genai import errors as _genai_errors
    from config import GEMINI_API_KEY
    _KB_GEMINI_AVAILABLE = bool(GEMINI_API_KEY)
    if _KB_GEMINI_AVAILABLE:
        _kb_gemini_client = genai.Client(api_key=GEMINI_API_KEY)
    else:
        _kb_gemini_client = None
except ImportError:
    _KB_GEMINI_AVAILABLE = False
    _kb_gemini_client = None
    print("[KB] Gemini not available — rule-based extraction only")
except Exception as _e:
    _KB_GEMINI_AVAILABLE = False
    _kb_gemini_client = None
    print(f"[KB] Gemini init error: {_e}")
# ─────────────────────────────────────────────────────────────────────────────


class KnowledgeBuilderAgent:
    """Extracts and stores knowledge from chat conversations"""
    
    # Question patterns for FAQ detection
    QUESTION_PATTERNS = [
        r'\bwhat\s+is\b',
        r'\bwhat\s+are\b',
        r'\bhow\s+does\b',
        r'\bhow\s+to\b',
        r'\bhow\s+do\b',
        r'\bwhy\s+are\b',
        r'\bwhy\s+is\b',
        r'\bwhen\s+should\b',
        r'\bwhere\s+can\b',
        r'\bcan\s+you\s+explain\b',
    ]
    
    # Definition patterns (improved to handle multi-word terms)
    DEFINITION_PATTERNS = [
        r'([\w\s]{2,30})\s+is\s+(.{5,})',  # "Frontend is..." or "The backend is..."
        r'([\w\s]{2,30})\s+means\s+(.{5,})',
        r'([\w\s]{2,30})\s+refers\s+to\s+(.{5,})',
        r'(\w+):\s+(.+)',  # "Docker: containerization tool"
    ]
    
    # Decision keywords
    DECISION_KEYWORDS = [
        'final decision',
        'we decided',
        'confirmed',
        'we will use',
        'approved',
        'agreed to',
        'decision:',
        'resolved to',
        'voted to',
    ]
    
    # Ignore short/irrelevant messages (but allow 'yup', 'nice', etc. as they can be answers)
    IGNORE_PATTERNS = [
        r'^\s*(ok|okay|k|yes|lol|haha|hmm)\s*$',  # Very short noise words only
        r'^[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF\U0001F1E0-\U0001F1FF]+$',  # Only emojis
    ]
    
    def __init__(self):
        """Initialize the Knowledge Builder Agent"""
        self.min_message_length = 5  # Minimum characters for consideration (lowered for short answers)
        self.similarity_threshold = 0.85  # For duplicate detection
        self.gemini_available = _KB_GEMINI_AVAILABLE
        self.gemini_client = _kb_gemini_client
        self.gemini_model = 'gemini-2.5-flash'
    
    # ========================================
    # MAIN EXTRACTION PIPELINE
    # ========================================
    
    def extract_knowledge(self, channel_id, time_period_hours=None):
        """
        Main pipeline: Extract knowledge from recent messages
        
        Args:
            channel_id: ID of the channel to analyze
            time_period_hours: How far back to look. None = all messages (default)
        
        Returns:
            dict with extraction results and statistics
        """
        try:
            # Step 1: Fetch recent messages
            messages = self._fetch_messages(channel_id, time_period_hours)
            print(f"[Knowledge Builder V2] Fetched {len(messages) if messages else 0} messages from channel {channel_id}")
            
            if not messages or len(messages) < 2:
                print(f"[Knowledge Builder V2] Not enough messages (need at least 2, got {len(messages) if messages else 0})")
                return {
                    'success': True,
                    'total_items': 0,
                    'message': 'Not enough messages to extract knowledge'
                }
            
            # Step 2: Preprocess messages
            clean_messages = self._preprocess_messages(messages)
            print(f"[Knowledge Builder V2] Preprocessed to {len(clean_messages)} clean messages")
            
            # Step 3: Extract different types of knowledge
            # Try Gemini first, then fall back to / supplement with rule-based
            gemini_result = self._extract_with_gemini(clean_messages)

            faqs = self._detect_faqs(clean_messages)
            definitions = self._detect_definitions(clean_messages)
            decisions = self._detect_decisions(clean_messages)

            if gemini_result:
                faqs        = self._merge_items(gemini_result['faqs'],       faqs,       channel_id)
                definitions = self._merge_items(gemini_result['definitions'], definitions, channel_id)
                decisions   = self._merge_items(gemini_result['decisions'],   decisions,  channel_id)

            print(f"[Knowledge Builder V2] Detected: {len(faqs)} FAQs, {len(definitions)} definitions, {len(decisions)} decisions")
            
            # Step 4: Save to database
            saved_count = 0
            saved_faqs = self._save_knowledge_items(faqs, channel_id)
            saved_defs = self._save_knowledge_items(definitions, channel_id)
            saved_decs = self._save_knowledge_items(decisions, channel_id)
            saved_count = saved_faqs + saved_defs + saved_decs
            
            print(f"[Knowledge Builder V2] Saved: {saved_faqs} FAQs, {saved_defs} definitions, {saved_decs} decisions (total: {saved_count})")
            
            return {
                'success': True,
                'total_items': saved_count,
                'faqs': len(faqs),
                'definitions': len(definitions),
                'decisions': len(decisions),
                'message': f'Successfully extracted {saved_count} knowledge items'
            }
            
        except Exception as e:
            print(f"[Knowledge Builder] Error extracting knowledge: {e}")
            import traceback
            traceback.print_exc()
            return {
                'success': False,
                'error': str(e)
            }

    # ========================================
    # GEMINI-ENHANCED EXTRACTION
    # ========================================

    def _extract_with_gemini(self, messages):
        """
        Use Gemini to extract FAQs, definitions, and decisions from messages.

        Falls back gracefully — caller always checks return value for None.

        Returns:
            dict with keys 'faqs', 'definitions', 'decisions' (lists) or None on failure
        """
        if not self.gemini_available or not self.gemini_client:
            return None

        # Build a compact conversation transcript (max 300 messages to stay within token limits)
        sample = messages[-300:] if len(messages) > 300 else messages
        transcript_lines = []
        for m in sample:
            username = m.get('username', 'user')
            text = m.get('text', '').strip()
            if text:
                transcript_lines.append(f"{username}: {text}")
        transcript = '\n'.join(transcript_lines)

        if not transcript:
            return None

        prompt = f"""You are an expert knowledge extractor for a team collaboration chat application.

Analyze the following chat transcript and extract ALL useful structured knowledge.

Return a JSON object with exactly these three keys:
{{
  "faqs": [
    {{"question": "...", "answer": "...", "tags": ["tag1", "tag2"]}}
  ],
  "definitions": [
    {{"term": "...", "definition": "...", "tags": ["tag1", "tag2"]}}
  ],
  "decisions": [
    {{"statement": "...", "summary": "...", "tags": ["tag1", "tag2"]}}
  ]
}}

Extraction rules — be thorough, not conservative:

faqs (Q&A pairs):
- ANY message that contains a question (even casual ones like "How long did this take?") followed by an answer in any nearby message counts as an FAQ.
- The question and answer can be from DIFFERENT users separated by several messages — look for the logical response.
- Also extract implicit Q&A: if someone shares a fact that answers a common question, create the Q&A pair yourself (e.g. if someone says "It took 2 weeks from wireframe to high-fidelity", create Q: "How long did the project/design take?" A: "About 2 weeks from wireframe to high-fidelity").
- Include feedback and review comments as Q&A when useful (e.g. Q: "What is good about the design?" A: "Spacing is perfect, very consistent 8px grid").

definitions:
- Any explanation of a term, tool, technology, concept, workflow, or methodology.
- Implicit definitions count: "consistent 8px grid" defines a design practice; "wireframe to high-fidelity" defines a design workflow stage.

decisions:
- Any agreement, confirmation, conclusion, or team consensus — formal or informal.
- Includes: what the chat/channel is for, project choices, confirmed approaches, agreed-upon standards.

General rules:
- Only extract items actually present or clearly implied in the chat. Do NOT invent unrelated content.
- tags: 1-4 short lowercase keywords relevant to the item.
- If nothing qualifies for a category, return an empty list for that key.
- Return ONLY the JSON object — no markdown, no explanation, no code block.

Chat transcript:
{transcript}"""

        try:
            response = self.gemini_client.models.generate_content(
                model=self.gemini_model,
                contents=prompt
            )
            raw = response.text.strip()

            # Strip markdown code fences if present
            if raw.startswith('```'):
                raw = re.sub(r'^```[a-z]*\n?', '', raw)
                raw = re.sub(r'\n?```$', '', raw)
                raw = raw.strip()

            data = json.loads(raw)

            # Normalise into the internal item format used by rule-based extraction
            result_faqs = []
            for item in data.get('faqs', []):
                if item.get('question') and item.get('answer'):
                    result_faqs.append({
                        'type': 'FAQ',
                        'question': str(item['question']).strip(),
                        'answer': str(item['answer']).strip(),
                        'tags': ','.join(str(t) for t in item.get('tags', [])[:5]),
                        'timestamp': datetime.now(),
                        'source': 'gemini',
                    })

            result_defs = []
            for item in data.get('definitions', []):
                if item.get('term') and item.get('definition'):
                    result_defs.append({
                        'type': 'DEFINITION',
                        'question': str(item['term']).strip(),
                        'answer': str(item['definition']).strip(),
                        'tags': ','.join(str(t) for t in item.get('tags', [])[:5]),
                        'timestamp': datetime.now(),
                        'source': 'gemini',
                    })

            result_decs = []
            for item in data.get('decisions', []):
                if item.get('statement'):
                    stmt = str(item['statement']).strip()
                    summary = str(item.get('summary', stmt[:60])).strip()
                    result_decs.append({
                        'type': 'DECISION',
                        'question': summary,
                        'answer': stmt,
                        'tags': ','.join(str(t) for t in item.get('tags', [])[:5]),
                        'timestamp': datetime.now(),
                        'source': 'gemini',
                    })

            print(f"[KB Gemini] Extracted: {len(result_faqs)} FAQs, {len(result_defs)} definitions, {len(result_decs)} decisions")
            return {'faqs': result_faqs, 'definitions': result_defs, 'decisions': result_decs}

        except json.JSONDecodeError as e:
            print(f"[KB Gemini] JSON parse error: {e} — falling back to rule-based")
            return None
        except Exception as e:
            print(f"[KB Gemini] Extraction error: {e} — falling back to rule-based")
            return None

    def _merge_items(self, gemini_items, rule_items, channel_id):
        """
        Merge Gemini and rule-based results, removing duplicates.

        Gemini results take priority; rule-based items are added only if
        they are not already covered by a Gemini result.
        """
        if not gemini_items:
            return rule_items

        merged = list(gemini_items)
        for rule_item in rule_items:
            is_dup = any(
                self._text_similarity(rule_item['question'], g['question']) > self.similarity_threshold
                for g in merged
            )
            if not is_dup:
                merged.append(rule_item)
        return merged

    # ========================================
    # QUICK EXTRACT (for /kb slash command)
    # ========================================

    def quick_extract(self, channel_id, time_period_hours=None):
        """
        Extract knowledge and return items directly (not just counts).

        Used by the /kb slash command to display inline results.

        Returns:
            dict with 'success', 'items' (list), 'faqs', 'definitions', 'decisions' counts,
            'total_items', 'method' ('gemini', 'rule_based', or 'hybrid')
        """
        try:
            messages = self._fetch_messages(channel_id, time_period_hours)
            if not messages or len(messages) < 2:
                return {
                    'success': True,
                    'total_items': 0,
                    'items': [],
                    'faqs': 0,
                    'definitions': 0,
                    'decisions': 0,
                    'method': 'none',
                    'message': 'Not enough messages to extract knowledge'
                }

            clean_messages = self._preprocess_messages(messages)

            # Run Gemini extraction
            gemini_result = self._extract_with_gemini(clean_messages)

            # Run rule-based extraction
            rule_faqs = self._detect_faqs(clean_messages)
            rule_defs = self._detect_definitions(clean_messages)
            rule_decs = self._detect_decisions(clean_messages)

            if gemini_result:
                all_faqs  = self._merge_items(gemini_result['faqs'],        rule_faqs, channel_id)
                all_defs  = self._merge_items(gemini_result['definitions'],  rule_defs, channel_id)
                all_decs  = self._merge_items(gemini_result['decisions'],    rule_decs, channel_id)
                method = 'gemini' if not (rule_faqs or rule_defs or rule_decs) else 'hybrid'
            else:
                all_faqs, all_defs, all_decs = rule_faqs, rule_defs, rule_decs
                method = 'rule_based'

            # Save to DB
            saved_faqs = self._save_knowledge_items(all_faqs, channel_id)
            saved_defs = self._save_knowledge_items(all_defs, channel_id)
            saved_decs = self._save_knowledge_items(all_decs, channel_id)
            total_saved = saved_faqs + saved_defs + saved_decs

            # Build preview items list for inline display (max 5 per type)
            preview_items = []
            for item in all_faqs[:3]:
                preview_items.append({'type': 'FAQ', 'question': item['question'], 'answer': item['answer']})
            for item in all_defs[:3]:
                preview_items.append({'type': 'DEFINITION', 'term': item['question'], 'definition': item['answer']})
            for item in all_decs[:2]:
                preview_items.append({'type': 'DECISION', 'statement': item['answer']})

            return {
                'success': True,
                'total_items': total_saved,
                'items': preview_items,
                'faqs': saved_faqs,
                'definitions': saved_defs,
                'decisions': saved_decs,
                'method': method,
                'message': f'Extracted {total_saved} new knowledge items'
            }

        except Exception as e:
            print(f"[KB quick_extract] Error: {e}")
            import traceback
            traceback.print_exc()
            return {'success': False, 'error': str(e)}

    # ========================================
    # MESSAGE FETCHING & PREPROCESSING
    # ========================================
    
    def _fetch_messages(self, channel_id, time_period_hours=None):
        """Fetch messages from database. Pass None (default) to fetch all messages with no time limit."""
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                if time_period_hours is None:
                    cur.execute("""
                        SELECT 
                            m.id,
                            m.sender_id as user_id,
                            m.content as text,
                            m.created_at,
                            u.username
                        FROM messages m
                        JOIN users u ON m.sender_id = u.id
                        WHERE m.channel_id = %s
                            AND m.content IS NOT NULL
                            AND m.content != ''
                            AND m.message_type IN ('text', 'bot')
                        ORDER BY m.created_at ASC
                    """, (channel_id,))
                else:
                    cur.execute("""
                        SELECT 
                            m.id,
                            m.sender_id as user_id,
                            m.content as text,
                            m.created_at,
                            u.username
                        FROM messages m
                        JOIN users u ON m.sender_id = u.id
                        WHERE m.channel_id = %s
                            AND m.content IS NOT NULL
                            AND m.content != ''
                            AND m.message_type IN ('text', 'bot')
                            AND m.created_at >= DATE_SUB(NOW(), INTERVAL %s HOUR)
                        ORDER BY m.created_at ASC
                    """, (channel_id, time_period_hours))
                
                return cur.fetchall()
        finally:
            conn.close()
    
    def _preprocess_messages(self, messages):
        """
        Clean and filter messages for knowledge extraction
        
        Returns: List of dicts with cleaned message data
        """
        clean_messages = []
        
        for msg in messages:
            text = msg['text'].strip()
            
            # Skip if too short
            if len(text) < self.min_message_length:
                continue
            
            # Skip if matches ignore patterns
            if self._should_ignore(text):
                continue
            
            clean_messages.append({
                'id': msg['id'],
                'user_id': msg['user_id'],
                'username': msg['username'],
                'text': text,
                'text_lower': text.lower(),
                'timestamp': msg['created_at']
            })
        
        return clean_messages
    
    def _should_ignore(self, text):
        """Check if message should be ignored"""
        text_lower = text.lower().strip()
        
        for pattern in self.IGNORE_PATTERNS:
            if re.match(pattern, text_lower, re.IGNORECASE):
                return True
        
        return False
    
    # ========================================
    # FAQ DETECTION
    # ========================================
    
    def _detect_faqs(self, messages):
        """
        Detect question-answer pairs
        
        Logic:
        - Find messages matching question patterns
        - Check if next 1-3 messages contain an answer
        - Answer should be longer and explanatory
        """
        faqs = []
        
        for i, msg in enumerate(messages):
            # Check if this message is a question
            if self._is_question(msg['text_lower']):
                question = msg['text']
                print(f"[KB V2] Found question: '{question}'")
                
                # Look for answer in next few messages
                answer = self._find_answer(messages, i)
                
                if answer:
                    print(f"[KB V2] Found answer: '{answer}'")
                    tags = self._extract_tags(question + ' ' + answer)
                    
                    faqs.append({
                        'type': 'FAQ',
                        'question': question,
                        'answer': answer,
                        'tags': tags,
                        'timestamp': msg['timestamp']
                    })
                else:
                    print(f"[KB V2] No answer found for question")
        
        return faqs
    
    def _is_question(self, text):
        """Check if text matches question patterns"""
        # Check for question mark
        if '?' in text:
            return True
        
        # Check for question keywords
        for pattern in self.QUESTION_PATTERNS:
            if re.search(pattern, text, re.IGNORECASE):
                return True
        
        return False
    
    def _find_answer(self, messages, question_index):
        """
        Find answer following a question
        
        Heuristics:
        - Answer should be in next 1-3 messages
        - Answer should be longer than question
        - Answer should not be another question
        """
        question_length = len(messages[question_index]['text'])
        
        # Check next 3 messages
        for i in range(question_index + 1, min(question_index + 4, len(messages))):
            candidate = messages[i]['text']
            
            # Skip if it's another question
            if self._is_question(candidate.lower()):
                continue
            
            # Check if it's substantive (at least 30% of question length, or 5+ chars)
            if len(candidate) >= max(5, question_length * 0.3):
                return candidate
        
        return None
    
    # ========================================
    # DEFINITION DETECTION
    # ========================================
    
    def _detect_definitions(self, messages):
        """
        Detect term definitions
        
        Patterns:
        - "Docker is a containerization tool"
        - "API means Application Programming Interface"
        """
        definitions = []
        
        for msg in messages:
            text = msg['text']
            text_lower = msg['text_lower']

            # Decision-style messages should be handled by _detect_decisions,
            # not by definition extraction.
            if any(keyword in text_lower for keyword in self.DECISION_KEYWORDS):
                continue
            
            for idx, pattern in enumerate(self.DEFINITION_PATTERNS):
                match = re.search(pattern, text, re.IGNORECASE)
                
                if match:
                    term = match.group(1).strip()
                    definition = match.group(2).strip()
                    
                    print(f"[KB V2] Potential definition - Term: '{term}' ({len(term.split())} words), Def: '{definition}' ({len(definition)} chars)")
                    
                    # Validate: definition should be substantial (at least 10 chars)
                    # Term can be multiple words (up to 5 words for phrases like "the frontend")
                    # For the generic "is" pattern, require a stronger explanatory signal
                    # to reduce false positives from ordinary chat replies.
                    if idx == 0:
                        cap_word_count = len(re.findall(r'\b[A-Z][a-zA-Z]+\b', definition))
                        if cap_word_count < 2:
                            print(f"[KB V2] ✗ Rejected weak 'is' definition signal")
                            continue

                    if len(definition) >= 10 and len(term.split()) <= 5:
                        print(f"[KB V2] ✓ Valid definition saved")
                        tags = self._extract_tags(term + ' ' + definition)
                        
                        definitions.append({
                            'type': 'DEFINITION',
                            'question': term,
                            'answer': definition,
                            'tags': tags,
                            'timestamp': msg['timestamp']
                        })
                        break  # Only one definition per message
                    else:
                        print(f"[KB V2] ✗ Rejected: def too short ({len(definition)}<10) or term too long ({len(term.split())}>5)")
        
        return definitions
    
    # ========================================
    # DECISION DETECTION
    # ========================================
    
    def _detect_decisions(self, messages):
        """
        Detect team decisions
        
        Keywords: "we decided", "approved", "confirmed"
        """
        decisions = []
        
        for msg in messages:
            text = msg['text']
            text_lower = msg['text_lower']
            
            # Check for decision keywords
            for keyword in self.DECISION_KEYWORDS:
                if keyword in text_lower:
                    # Extract decision statement
                    decision_text = text.strip()
                    
                    # Generate a short title from first few words
                    words = decision_text.split()[:6]
                    title = ' '.join(words)
                    if len(decision_text) > len(title):
                        title += '...'
                    
                    tags = self._extract_tags(decision_text)
                    
                    decisions.append({
                        'type': 'DECISION',
                        'question': title,
                        'answer': decision_text,
                        'tags': tags,
                        'timestamp': msg['timestamp']
                    })
                    break  # Only one decision per message
        
        return decisions
    
    # ========================================
    # TAGGING & UTILITIES
    # ========================================
    
    def _extract_tags(self, text):
        """
        Extract keywords as tags
        
        Simple approach:
        - Find capitalized words (potential proper nouns/tech terms)
        - Find longer words (>5 chars)
        - Remove common words
        """
        # Common words to ignore
        STOPWORDS = {
            'the', 'is', 'are', 'was', 'were', 'will', 'would', 'should',
            'could', 'have', 'has', 'had', 'this', 'that', 'these', 'those',
            'with', 'from', 'about', 'what', 'when', 'where', 'which', 'who'
        }
        
        ordered_tags = []
        seen = set()

        def _push(tag):
            key = tag.lower()
            if key in seen:
                return
            seen.add(key)
            ordered_tags.append(tag)

        # Extract capitalized words first (like Docker, React, API)
        for token in re.findall(r'\b[A-Z][a-zA-Z]+\b', text):
            _push(token)

        # Then add longer lowercase words
        for word in re.findall(r'\b[a-zA-Z]{5,}\b', text.lower()):
            if word not in STOPWORDS:
                _push(word)

        # Limit to top 5 tags in deterministic order
        return ','.join(ordered_tags[:5])
    
    # ========================================
    # DATABASE STORAGE
    # ========================================
    
    def _save_knowledge_items(self, items, channel_id):
        """
        Save knowledge items to database
        
        Includes duplicate checking
        """
        if not items:
            return 0
        
        conn = get_db_connection()
        saved_count = 0
        
        try:
            with conn.cursor() as cur:
                for item in items:
                    # Check for duplicates
                    if self._is_duplicate(cur, item, channel_id):
                        continue
                    
                    # Insert new knowledge item
                    cur.execute("""
                        INSERT INTO knowledge_base 
                        (title, content, source, related_channel, created_at)
                        VALUES (%s, %s, %s, %s, %s)
                    """, (
                        item['question'],
                        self._create_content_json(item),
                        'agent',
                        channel_id,
                        item['timestamp']
                    ))
                    
                    saved_count += 1
            
            conn.commit()
            
        except Exception as e:
            print(f"[Knowledge Builder] Error saving items: {e}")
            conn.rollback()
        finally:
            conn.close()
        
        return saved_count
    
    def _create_content_json(self, item):
        """Create JSON content for storage"""
        import json
        return json.dumps({
            'type': item['type'].lower(),
            'question': item['question'],
            'answer': item['answer'],
            'tags': item['tags'].split(',') if item['tags'] else [],
            'relevance_score': 0.8,  # Default score
            'usage_count': 0
        })
    
    def _is_duplicate(self, cursor, item, channel_id):
        """
        Check if similar knowledge already exists
        
        Uses text similarity on question field
        """
        cursor.execute("""
            SELECT title FROM knowledge_base
            WHERE related_channel = %s
            ORDER BY created_at DESC
            LIMIT 100
        """, (channel_id,))
        
        existing = cursor.fetchall()
        
        for row in existing:
            similarity = self._text_similarity(item['question'], row['title'])
            if similarity > self.similarity_threshold:
                return True
        
        return False
    
    def _text_similarity(self, text1, text2):
        """Calculate similarity between two texts (0.0 to 1.0)"""
        return SequenceMatcher(None, text1.lower(), text2.lower()).ratio()
    
    # ========================================
    # SEARCH & RETRIEVAL
    # ========================================
    
    def search_knowledge(self, query, channel_id=None, limit=10):
        """
        Search knowledge base
        
        Args:
            query: Search query string
            channel_id: Optional channel filter
            limit: Max results to return
        """
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                if channel_id:
                    cur.execute("""
                        SELECT id, title, content, created_at
                        FROM knowledge_base
                        WHERE related_channel = %s
                            AND (title LIKE %s OR content LIKE %s)
                        ORDER BY created_at DESC
                        LIMIT %s
                    """, (channel_id, f'%{query}%', f'%{query}%', limit))
                else:
                    cur.execute("""
                        SELECT id, title, content, created_at
                        FROM knowledge_base
                        WHERE title LIKE %s OR content LIKE %s
                        ORDER BY created_at DESC
                        LIMIT %s
                    """, (f'%{query}%', f'%{query}%', limit))
                
                return cur.fetchall()
        finally:
            conn.close()
