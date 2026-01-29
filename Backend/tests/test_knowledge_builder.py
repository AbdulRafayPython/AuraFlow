"""
Knowledge Builder Agent - Test Suite
=====================================

Unit tests for pattern detection, extraction, and storage
"""

import unittest
from agents.knowledge_builder_v2 import KnowledgeBuilderAgent


class TestKnowledgeBuilderAgent(unittest.TestCase):
    """Test cases for Knowledge Builder Agent"""
    
    def setUp(self):
        """Initialize agent for each test"""
        self.agent = KnowledgeBuilderAgent()
    
    # ========================================
    # FAQ DETECTION TESTS
    # ========================================
    
    def test_is_question_with_question_mark(self):
        """Test question detection with question mark"""
        self.assertTrue(self.agent._is_question("what is docker?"))
        self.assertTrue(self.agent._is_question("can you explain apis?"))
    
    def test_is_question_with_keywords(self):
        """Test question detection with keywords"""
        self.assertTrue(self.agent._is_question("what is react"))
        self.assertTrue(self.agent._is_question("how does kubernetes work"))
        self.assertTrue(self.agent._is_question("why are we using flask"))
    
    def test_not_question(self):
        """Test non-question detection"""
        self.assertFalse(self.agent._is_question("docker is great"))
        self.assertFalse(self.agent._is_question("i love coding"))
    
    def test_detect_faqs(self):
        """Test FAQ extraction from message list"""
        messages = [
            {
                'id': 1,
                'user_id': 1,
                'username': 'Alice',
                'text': 'What is Docker?',
                'text_lower': 'what is docker?',
                'timestamp': '2024-01-01 10:00:00'
            },
            {
                'id': 2,
                'user_id': 2,
                'username': 'Bob',
                'text': 'Docker is a containerization platform that packages applications with dependencies.',
                'text_lower': 'docker is a containerization platform that packages applications with dependencies.',
                'timestamp': '2024-01-01 10:01:00'
            }
        ]
        
        faqs = self.agent._detect_faqs(messages)
        
        self.assertEqual(len(faqs), 1)
        self.assertEqual(faqs[0]['type'], 'FAQ')
        self.assertIn('Docker', faqs[0]['question'])
        self.assertIn('containerization', faqs[0]['answer'])
    
    # ========================================
    # DEFINITION DETECTION TESTS
    # ========================================
    
    def test_detect_definition_is_pattern(self):
        """Test definition detection with 'is' pattern"""
        messages = [
            {
                'id': 1,
                'user_id': 1,
                'username': 'Alice',
                'text': 'API is Application Programming Interface',
                'text_lower': 'api is application programming interface',
                'timestamp': '2024-01-01 10:00:00'
            }
        ]
        
        definitions = self.agent._detect_definitions(messages)
        
        self.assertEqual(len(definitions), 1)
        self.assertEqual(definitions[0]['type'], 'DEFINITION')
        self.assertEqual(definitions[0]['question'].lower(), 'api')
        self.assertIn('Application', definitions[0]['answer'])
    
    def test_detect_definition_means_pattern(self):
        """Test definition detection with 'means' pattern"""
        messages = [
            {
                'id': 1,
                'user_id': 1,
                'username': 'Bob',
                'text': 'REST means Representational State Transfer',
                'text_lower': 'rest means representational state transfer',
                'timestamp': '2024-01-01 10:00:00'
            }
        ]
        
        definitions = self.agent._detect_definitions(messages)
        
        self.assertEqual(len(definitions), 1)
        self.assertIn('REST', definitions[0]['question'])
    
    def test_detect_definition_colon_pattern(self):
        """Test definition detection with colon pattern"""
        messages = [
            {
                'id': 1,
                'user_id': 1,
                'username': 'Charlie',
                'text': 'Flask: a lightweight Python web framework',
                'text_lower': 'flask: a lightweight python web framework',
                'timestamp': '2024-01-01 10:00:00'
            }
        ]
        
        definitions = self.agent._detect_definitions(messages)
        
        self.assertEqual(len(definitions), 1)
        self.assertIn('Flask', definitions[0]['question'])
        self.assertIn('lightweight', definitions[0]['answer'])
    
    # ========================================
    # DECISION DETECTION TESTS
    # ========================================
    
    def test_detect_decision_we_decided(self):
        """Test decision detection with 'we decided' keyword"""
        messages = [
            {
                'id': 1,
                'user_id': 1,
                'username': 'Alice',
                'text': 'We decided to use PostgreSQL for the database',
                'text_lower': 'we decided to use postgresql for the database',
                'timestamp': '2024-01-01 10:00:00'
            }
        ]
        
        decisions = self.agent._detect_decisions(messages)
        
        self.assertEqual(len(decisions), 1)
        self.assertEqual(decisions[0]['type'], 'DECISION')
        self.assertIn('PostgreSQL', decisions[0]['answer'])
    
    def test_detect_decision_confirmed(self):
        """Test decision detection with 'confirmed' keyword"""
        messages = [
            {
                'id': 1,
                'user_id': 1,
                'username': 'Bob',
                'text': 'Confirmed: React will be our frontend framework',
                'text_lower': 'confirmed: react will be our frontend framework',
                'timestamp': '2024-01-01 10:00:00'
            }
        ]
        
        decisions = self.agent._detect_decisions(messages)
        
        self.assertEqual(len(decisions), 1)
        self.assertIn('React', decisions[0]['answer'])
    
    # ========================================
    # TAGGING TESTS
    # ========================================
    
    def test_extract_tags_capitalized_words(self):
        """Test tag extraction from capitalized words"""
        text = "Docker is a containerization platform. React is great."
        tags = self.agent._extract_tags(text)
        
        self.assertIn('Docker', tags)
        self.assertIn('React', tags)
    
    def test_extract_tags_longer_words(self):
        """Test tag extraction from longer words"""
        text = "deployment containerization framework testing"
        tags = self.agent._extract_tags(text)
        
        # Should include words longer than 5 chars
        self.assertIn('deployment', tags)
        self.assertIn('containerization', tags)
    
    def test_extract_tags_excludes_stopwords(self):
        """Test that common stopwords are excluded"""
        text = "this is about Docker and React"
        tags = self.agent._extract_tags(text)
        
        # Stopwords should not be in tags
        self.assertNotIn('this', tags)
        self.assertNotIn('about', tags)
    
    # ========================================
    # PREPROCESSING TESTS
    # ========================================
    
    def test_should_ignore_short_messages(self):
        """Test that very short messages are ignored"""
        self.assertTrue(self.agent._should_ignore("ok"))
        self.assertTrue(self.agent._should_ignore("yes"))
        self.assertTrue(self.agent._should_ignore("k"))
    
    def test_should_ignore_emoji_only(self):
        """Test that emoji-only messages are ignored"""
        self.assertTrue(self.agent._should_ignore("👍"))
        self.assertTrue(self.agent._should_ignore("😊😊"))
    
    def test_should_not_ignore_valid_messages(self):
        """Test that valid messages are not ignored"""
        self.assertFalse(self.agent._should_ignore("Docker is great for containerization"))
        self.assertFalse(self.agent._should_ignore("What is an API?"))
    
    # ========================================
    # SIMILARITY TESTS
    # ========================================
    
    def test_text_similarity_identical(self):
        """Test similarity of identical texts"""
        similarity = self.agent._text_similarity("Docker", "Docker")
        self.assertEqual(similarity, 1.0)
    
    def test_text_similarity_similar(self):
        """Test similarity of similar texts"""
        similarity = self.agent._text_similarity(
            "What is Docker?",
            "What is Docker"
        )
        self.assertGreater(similarity, 0.8)
    
    def test_text_similarity_different(self):
        """Test similarity of different texts"""
        similarity = self.agent._text_similarity(
            "What is Docker?",
            "How does Kubernetes work?"
        )
        self.assertLess(similarity, 0.5)
    
    # ========================================
    # INTEGRATION TESTS
    # ========================================
    
    def test_full_extraction_pipeline(self):
        """Test complete extraction pipeline with mixed content"""
        messages = [
            {
                'id': 1,
                'user_id': 1,
                'username': 'Alice',
                'text': 'What is Docker?',
                'text_lower': 'what is docker?',
                'timestamp': '2024-01-01 10:00:00'
            },
            {
                'id': 2,
                'user_id': 2,
                'username': 'Bob',
                'text': 'Docker is a containerization platform',
                'text_lower': 'docker is a containerization platform',
                'timestamp': '2024-01-01 10:01:00'
            },
            {
                'id': 3,
                'user_id': 1,
                'username': 'Alice',
                'text': 'API means Application Programming Interface',
                'text_lower': 'api means application programming interface',
                'timestamp': '2024-01-01 10:02:00'
            },
            {
                'id': 4,
                'user_id': 3,
                'username': 'Charlie',
                'text': 'Final decision: We will use React for frontend',
                'text_lower': 'final decision: we will use react for frontend',
                'timestamp': '2024-01-01 10:03:00'
            }
        ]
        
        faqs = self.agent._detect_faqs(messages)
        definitions = self.agent._detect_definitions(messages)
        decisions = self.agent._detect_decisions(messages)
        
        # Should find 1 FAQ, 1 definition, 1 decision
        self.assertEqual(len(faqs), 1)
        self.assertEqual(len(definitions), 1)
        self.assertEqual(len(decisions), 1)
        
        # Verify FAQ
        self.assertIn('Docker', faqs[0]['question'])
        
        # Verify Definition
        self.assertIn('API', definitions[0]['question'])
        
        # Verify Decision
        self.assertIn('React', decisions[0]['answer'])


if __name__ == '__main__':
    unittest.main()
