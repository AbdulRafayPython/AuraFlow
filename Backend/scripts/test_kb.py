import sys
sys.path.insert(0, '.')
from agents.knowledge_builder_v2 import KnowledgeBuilderAgent

kb = KnowledgeBuilderAgent()
result = kb.quick_extract(channel_id=17)

if result.get('success'):
    print('SUCCESS')
    print('Total:', result['total_items'], 'items')
    print('FAQs:', result['faqs'], '| Definitions:', result['definitions'], '| Decisions:', result['decisions'])
    print('Method:', result['method'])
else:
    print('FAILED:', result.get('error'))
