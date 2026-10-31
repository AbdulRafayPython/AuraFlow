"""
Per-agent knowledge
===================
Text, uploaded documents or channel history are cut into chunks that an agent's
``search_knowledge`` tool searches. Search is keyword based for now (works for
English, Urdu, Arabic and Roman Urdu alike because it only needs word overlap) blended with
embedding similarity (see ``embeddings.py``), so spelling variants still match.

Everything here is synchronous and bounded: file size, text length and chunk
count are capped so one upload cannot swamp the database.
"""

from __future__ import annotations

import io
import json
import logging
import re
from typing import Any, Dict, List, Optional

from agents.runtime import embeddings
from database import get_db_connection
from utils.encryption import decrypt

log = logging.getLogger(__name__)

MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_TEXT_CHARS = 200_000
MAX_CHUNKS = 500
MAX_SEARCH_CHUNKS = 2000          # all of one agent's chunks (a few sources) are ranked in memory
CHUNK_SIZE = 800
CHUNK_OVERLAP = 100
CHANNEL_MESSAGE_LIMIT = 300
TEXT_EXTENSIONS = (".txt", ".md", ".csv")
SUPPORTED_EXTENSIONS = TEXT_EXTENSIONS + (".pdf", ".docx")


class KnowledgeError(ValueError):
    """A problem with the supplied knowledge; the message is safe to show the user."""


# ── extraction ──────────────────────────────────────────────────────────

def extract_text(filename: str, data: bytes) -> str:
    name = (filename or "").lower()
    if len(data) > MAX_FILE_BYTES:
        raise KnowledgeError(f"File is too large (limit {MAX_FILE_BYTES // (1024 * 1024)} MB).")
    if name.endswith(TEXT_EXTENSIONS):
        return data.decode("utf-8", errors="replace")
    if name.endswith(".pdf"):
        try:
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(data))
            return "\n\n".join((page.extract_text() or "") for page in reader.pages)
        except Exception as exc:  # noqa: BLE001
            raise KnowledgeError("Could not read this PDF (is it scanned or password protected?).") from exc
    if name.endswith(".docx"):
        try:
            from docx import Document
            doc = Document(io.BytesIO(data))
            parts = [p.text for p in doc.paragraphs]
            for table in doc.tables:
                for row in table.rows:
                    parts.append(" | ".join(cell.text for cell in row.cells))
            return "\n\n".join(parts)
        except Exception as exc:  # noqa: BLE001
            raise KnowledgeError("Could not read this Word document.") from exc
    raise KnowledgeError("Unsupported file type. Use .txt, .md, .csv, .pdf or .docx.")


# ── chunking ────────────────────────────────────────────────────────────

def _split_long(paragraph: str, size: int, overlap: int) -> List[str]:
    pieces, start = [], 0
    while start < len(paragraph):
        end = min(start + size, len(paragraph))
        if end < len(paragraph):
            cut = max(paragraph.rfind(". ", start, end), paragraph.rfind(" ", start, end))
            if cut > start + size // 2:
                end = cut + 1
        pieces.append(paragraph[start:end].strip())
        if end >= len(paragraph):
            break
        start = max(end - overlap, start + 1)
    return [p for p in pieces if p]


def chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    """Pack paragraphs into chunks of at most ``size`` characters."""
    text = re.sub(r"[ \t]+", " ", (text or "").replace("\r\n", "\n"))
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks: List[str] = []
    current = ""
    for para in paragraphs:
        if len(para) > size:
            if current:
                chunks.append(current)
                current = ""
            chunks.extend(_split_long(para, size, overlap))
        elif not current:
            current = para
        elif len(current) + 2 + len(para) <= size:
            current += "\n\n" + para
        else:
            chunks.append(current)
            current = para
    if current:
        chunks.append(current)
    return chunks


# ── storage ─────────────────────────────────────────────────────────────

def read_channel_text(cur: Any, channel_id: int, limit: int = CHANNEL_MESSAGE_LIMIT) -> str:
    cur.execute(
        "SELECT m.content, u.username FROM messages m JOIN users u ON u.id = m.sender_id "
        "WHERE m.channel_id = %s AND m.moderation_flagged = 0 AND m.message_type = 'text' "
        "ORDER BY m.id DESC LIMIT %s", (channel_id, limit))
    rows = list(cur.fetchall() or [])
    rows.reverse()
    return "\n".join(f"{r['username']}: {decrypt(r['content'] or '')}" for r in rows if r.get("content"))


def add_source(cur: Any, agent_id: int, *, type: str, title: str, text: str,
               ref: Optional[str] = None) -> Dict[str, Any]:
    """Chunk ``text`` and store it as a ready source. Raises KnowledgeError."""
    text = (text or "").strip()
    if not text:
        raise KnowledgeError("There is no text to learn from.")
    if len(text) > MAX_TEXT_CHARS:
        raise KnowledgeError(f"Too much text (limit {MAX_TEXT_CHARS:,} characters).")
    chunks = chunk_text(text)
    if len(chunks) > MAX_CHUNKS:
        raise KnowledgeError(f"Too large: more than {MAX_CHUNKS} chunks. Split it into smaller sources.")

    cur.execute(
        "INSERT INTO agent_knowledge_sources (agent_id, type, title, ref, status) "
        "VALUES (%s, %s, %s, %s, 'pending')", (agent_id, type, title[:255], (ref or "")[:500] or None))
    source_id = cur.lastrowid
    emb = embeddings.embed_many(chunks)
    cur.executemany(
        "INSERT INTO agent_knowledge_chunks (source_id, agent_id, chunk_index, content, embedding) "
        "VALUES (%s, %s, %s, %s, %s)",
        [(source_id, agent_id, i, c, json.dumps(embeddings.pack(emb["model"], v)))
         for i, (c, v) in enumerate(zip(chunks, emb["vectors"]))])
    cur.execute("UPDATE agent_knowledge_sources SET status = 'ready', chunk_count = %s WHERE id = %s",
                (len(chunks), source_id))
    return {"id": source_id, "title": title, "type": type, "status": "ready", "chunks": len(chunks)}


def list_sources(cur: Any, agent_id: int) -> List[Dict[str, Any]]:
    cur.execute("SELECT id, type, title, ref, status, error, chunk_count, created_at "
                "FROM agent_knowledge_sources WHERE agent_id = %s ORDER BY id", (agent_id,))
    return [{"id": r["id"], "type": r["type"], "title": r["title"], "ref": r["ref"],
             "status": r["status"], "error": r["error"], "chunks": r["chunk_count"],
             "created_at": r["created_at"].isoformat() if hasattr(r["created_at"], "isoformat") else r["created_at"]}
            for r in cur.fetchall() or []]


def delete_source(cur: Any, agent_id: int, source_id: int) -> bool:
    cur.execute("DELETE FROM agent_knowledge_sources WHERE id = %s AND agent_id = %s", (source_id, agent_id))
    return cur.rowcount == 1


# ── search ──────────────────────────────────────────────────────────────

# Words that say nothing about the topic. Left in, "hai" (Roman Urdu) or "the" would make every note that
# contains them look like a keyword match.
STOPWORDS = frozenset("""
the an is are was were of to in on at for and or what when where how do does can my me you it be this that with
hai hain tha thi the ka ki ke ko kab kya kaun kahan kitne kitna kitni mein main se par pe aur ya ho hota hoti hote
kar karna kia ye yeh wo woh hum aap mera meri
ہے ہیں تھا تھی کا کی کے کو کب کیا کون کہاں کتنے میں سے پر اور یا ہو ہوں ہم آپ
""".split())


def search_terms(query: str) -> List[str]:
    """The topic words of a question (at most 8). If every word is a stop word, all of them are kept."""
    words = list(dict.fromkeys(re.findall(r"\w{2,}", (query or "").lower())))
    return ([w for w in words if w not in STOPWORDS] or words)[:8]


VECTOR_WEIGHT = 0.6          # share of the rank score that comes from the embedding
MIN_VECTOR_SCORE = 0.1       # a chunk with no keyword hit must be at least this close


def _keyword_score(text: str, terms: List[str]) -> float:
    text = (text or "").lower()
    hits = [min(text.count(t), 5) for t in terms]
    return 2 * sum(1 for h in hits if h) + sum(hits)


def rank(rows: List[Dict[str, Any]], query: str, terms: List[str], k: int) -> List[Dict[str, Any]]:
    """Order chunk rows by a blend of embedding similarity and keyword hits (pure, no database).

    A row's ``embedding`` may be missing (older rows): it is then embedded locally. Vectors made by
    a provider other than the query's are skipped, leaving that row to its keyword score."""
    query_vecs: Dict[str, Optional[List[float]]] = {}
    scored = []
    for row in rows:
        kw = _keyword_score(row["content"], terms)
        packed = embeddings.unpack(row.get("embedding"))
        model = packed["m"] if packed else embeddings.HASH_MODEL
        if model not in query_vecs:
            query_vecs[model] = embeddings.embed_query(query, model)
        qv = query_vecs[model]
        vec = packed["v"] if packed else embeddings.hash_embed(row["content"])
        sim = max(embeddings.cosine(qv, vec), 0.0) if qv else 0.0
        if kw == 0 and sim < MIN_VECTOR_SCORE:
            continue
        scored.append((sim, kw, row))
    top_kw = max((kw for _, kw, _ in scored), default=0) or 1
    scored.sort(key=lambda s: VECTOR_WEIGHT * s[0] + (1 - VECTOR_WEIGHT) * s[1] / top_kw, reverse=True)
    return [{"id": r["id"], "title": r["title"], "content": (r["content"] or "")[:600]} for _, _, r in scored[:k]]


def search(agent_id: int, query: str, k: int = 5) -> List[Dict[str, Any]]:
    """Best matching chunks of one agent's own knowledge, strongest first (embeddings + keywords)."""
    terms = search_terms(query)
    if not terms:
        return []
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT c.id, c.content, c.embedding, s.title FROM agent_knowledge_chunks c "
                "JOIN agent_knowledge_sources s ON s.id = c.source_id "
                "WHERE c.agent_id = %s AND s.status = 'ready' ORDER BY c.id LIMIT %s",
                (agent_id, MAX_SEARCH_CHUNKS))
            rows = list(cur.fetchall() or [])
    finally:
        conn.close()
    return rank(rows, query, terms, k)
