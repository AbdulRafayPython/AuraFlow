"""
Knowledge Builder Agent - Flask Route Examples
===============================================

Add these routes to your Backend/routes/agents.py file
"""

from flask import Blueprint, request, jsonify
from functools import wraps
from agents.knowledge_builder_v2 import KnowledgeBuilderAgent
import jwt
import os

# Example JWT decorator (adjust based on your auth.py)
def jwt_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = request.headers.get('Authorization')
        if not token:
            return jsonify({'error': 'No token provided'}), 401
        
        try:
            token = token.replace('Bearer ', '')
            payload = jwt.decode(token, os.getenv('JWT_SECRET'), algorithms=['HS256'])
            kwargs['user_id'] = payload['user_id']
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401
        
        return f(*args, **kwargs)
    return decorated_function


# ========================================
# KNOWLEDGE BUILDER ROUTES
# ========================================

agents_bp = Blueprint('agents', __name__)


@agents_bp.route('/knowledge/extract', methods=['POST'])
@jwt_required
def extract_knowledge(user_id):
    """
    Extract knowledge from recent channel messages
    
    Request Body:
    {
        "channel_id": 123,
        "time_period_hours": 24  // optional, default 24
    }
    
    Response:
    {
        "success": true,
        "total_items": 5,
        "faqs": 2,
        "definitions": 2,
        "decisions": 1,
        "message": "Successfully extracted 5 knowledge items"
    }
    """
    try:
        data = request.json
        
        # Validate input
        if not data or 'channel_id' not in data:
            return jsonify({'error': 'channel_id is required'}), 400
        
        channel_id = data['channel_id']
        time_period_hours = data.get('time_period_hours', 24)
        
        # TODO: Add permission check - verify user has access to this channel
        # if not has_channel_access(user_id, channel_id):
        #     return jsonify({'error': 'Access denied'}), 403
        
        # Extract knowledge
        agent = KnowledgeBuilderAgent()
        result = agent.extract_knowledge(channel_id, time_period_hours)
        
        return jsonify(result), 200
        
    except Exception as e:
        print(f"[Knowledge Builder API] Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/knowledge/search', methods=['GET'])
@jwt_required
def search_knowledge(user_id):
    """
    Search knowledge base
    
    Query Params:
    - query: Search term (required)
    - channel_id: Filter by channel (optional)
    - limit: Max results (optional, default 10)
    
    Response:
    {
        "success": true,
        "results": [
            {
                "id": 1,
                "title": "What is Docker?",
                "content": {...},
                "created_at": "2024-01-01 10:00:00"
            }
        ]
    }
    """
    try:
        query = request.args.get('query')
        channel_id = request.args.get('channel_id', type=int)
        limit = request.args.get('limit', default=10, type=int)
        
        if not query:
            return jsonify({'error': 'query parameter is required'}), 400
        
        # Search
        agent = KnowledgeBuilderAgent()
        results = agent.search_knowledge(query, channel_id, limit)
        
        return jsonify({
            'success': True,
            'results': results
        }), 200
        
    except Exception as e:
        print(f"[Knowledge Search API] Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/knowledge/stats', methods=['GET'])
@jwt_required
def get_knowledge_stats(user_id):
    """
    Get knowledge base statistics
    
    Query Params:
    - channel_id: Filter by channel (optional)
    
    Response:
    {
        "success": true,
        "total_items": 50,
        "by_type": {
            "faq": 20,
            "definition": 15,
            "decision": 15
        }
    }
    """
    try:
        from database import get_db_connection
        import json
        
        channel_id = request.args.get('channel_id', type=int)
        
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                # Build query
                if channel_id:
                    cur.execute("""
                        SELECT content FROM knowledge_base
                        WHERE related_channel = %s
                    """, (channel_id,))
                else:
                    cur.execute("SELECT content FROM knowledge_base")
                
                items = cur.fetchall()
                
                # Count by type
                by_type = {'faq': 0, 'definition': 0, 'decision': 0}
                
                for item in items:
                    try:
                        content = json.loads(item['content'])
                        item_type = content.get('type', 'unknown')
                        if item_type in by_type:
                            by_type[item_type] += 1
                    except:
                        continue
                
                return jsonify({
                    'success': True,
                    'total_items': len(items),
                    'by_type': by_type
                }), 200
        finally:
            conn.close()
            
    except Exception as e:
        print(f"[Knowledge Stats API] Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500


# ========================================
# SOCKET.IO INTEGRATION EXAMPLE
# ========================================

"""
Add this to your Backend/routes/sockets.py:

from agents.knowledge_builder_v2 import KnowledgeBuilderAgent

@socketio.on('save_knowledge')
def handle_save_knowledge(data):
    '''
    Socket event to trigger knowledge extraction
    
    Emitted from frontend with:
    socket.emit('save_knowledge', {
        channel_id: 123,
        time_period_hours: 24
    })
    '''
    try:
        channel_id = data.get('channel_id')
        time_period_hours = data.get('time_period_hours', 24)
        
        # Extract knowledge
        agent = KnowledgeBuilderAgent()
        result = agent.extract_knowledge(channel_id, time_period_hours)
        
        # Emit result back to channel
        if result['success'] and result['total_items'] > 0:
            emit('knowledge_saved', {
                'message': f"📘 {result['message']}",
                'stats': {
                    'total': result['total_items'],
                    'faqs': result['faqs'],
                    'definitions': result['definitions'],
                    'decisions': result['decisions']
                }
            }, room=f"channel_{channel_id}")
        
    except Exception as e:
        print(f"[Socket Knowledge Builder] Error: {e}")
        emit('error', {'message': 'Failed to extract knowledge'})
"""
