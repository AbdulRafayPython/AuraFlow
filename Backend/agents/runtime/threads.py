"""
Conversation context for replies
================================
When someone replies to an agent's message, the agent should see the thread so
far. :func:`thread_history` walks the ``reply_to`` chain upwards and returns it
in OpenAI message format (the agent's own messages as ``assistant``).
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from database import get_db_connection
from utils.encryption import decrypt

log = logging.getLogger(__name__)


def thread_history(parent_message_id: Optional[int], bot_user_id: int,
                   limit: int = 6) -> List[Dict[str, Any]]:
    """Messages leading up to ``parent_message_id`` (inclusive), oldest first."""
    if not parent_message_id:
        return []
    chain: List[Dict[str, Any]] = []
    seen = set()
    current: Optional[int] = parent_message_id
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            while current and len(chain) < limit and current not in seen:
                seen.add(current)
                cur.execute(
                    "SELECT m.id, m.sender_id, m.content, m.reply_to, u.username "
                    "FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = %s", (current,))
                row = cur.fetchone()
                if not row:
                    break
                chain.append(row)
                current = row.get("reply_to")
    except Exception as exc:  # noqa: BLE001
        log.debug("[RUNTIME] thread_history failed: %s", exc)
    finally:
        if conn:
            conn.close()

    history: List[Dict[str, Any]] = []
    for row in reversed(chain):
        text = decrypt(row["content"] or "")
        if row["sender_id"] == bot_user_id:
            history.append({"role": "assistant", "content": text})
        else:
            history.append({"role": "user", "content": f"@{row['username']}: {text}"})
    return history
