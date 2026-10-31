"""Per-agent knowledge: extraction, chunking, storage and search."""
from __future__ import annotations

import io
import json

import pytest

from runtime_fakes import make_db  # noqa: F401  (pytest fixture)
from agents.runtime import knowledge
from agents.runtime.knowledge import KnowledgeError, chunk_text, extract_text

MOD = ["agents.runtime.knowledge"]


# ── chunking ────────────────────────────────────────────────────────────

def test_short_text_is_one_chunk():
    assert chunk_text("Fees are due in May.") == ["Fees are due in May."]


def test_empty_text_has_no_chunks():
    assert chunk_text("") == [] and chunk_text("  \n\n  ") == []


def test_paragraphs_are_packed_up_to_the_size():
    paras = ["a" * 300, "b" * 300, "c" * 300]
    chunks = chunk_text("\n\n".join(paras), size=700)
    assert len(chunks) == 2
    assert chunks[0] == f"{paras[0]}\n\n{paras[1]}" and chunks[1] == paras[2]


def test_a_long_paragraph_is_split_with_overlap_and_never_exceeds_the_size():
    sentence = "The library opens at nine and closes at five on weekdays. "
    text = sentence * 60
    chunks = chunk_text(text, size=400, overlap=60)
    assert len(chunks) > 5
    assert all(len(c) <= 400 for c in chunks)
    joined = " ".join(chunks)
    assert joined.count("library opens") >= text.count("library opens")      # nothing lost (overlap repeats some)


def test_unbroken_text_without_spaces_still_terminates():
    chunks = chunk_text("x" * 2500, size=800, overlap=100)
    assert 3 <= len(chunks) <= 5 and all(len(c) <= 800 for c in chunks)


def test_whitespace_is_normalised():
    assert chunk_text("a   b\t\tc\r\n\r\nd") == ["a b c\n\nd"]


def test_unicode_text_is_chunked():
    urdu = "فیس مئی میں جمع کرانی ہے۔ " * 80
    assert all(len(c) <= 800 for c in chunk_text(urdu))


# ── extraction ──────────────────────────────────────────────────────────

@pytest.mark.parametrize("name", ["notes.txt", "README.MD", "data.csv"])
def test_plain_text_formats(name):
    assert extract_text(name, "héllo wörld".encode("utf-8")) == "héllo wörld"


def test_bad_bytes_do_not_crash_text_extraction():
    assert "�" in extract_text("x.txt", b"ok \xff\xfe ok")


def test_docx_paragraphs_and_tables():
    from docx import Document
    doc = Document()
    doc.add_paragraph("Hostel rules apply after 10pm.")
    table = doc.add_table(rows=1, cols=2)
    table.rows[0].cells[0].text = "Fee"
    table.rows[0].cells[1].text = "5000"
    buf = io.BytesIO()
    doc.save(buf)
    text = extract_text("rules.docx", buf.getvalue())
    assert "Hostel rules apply after 10pm." in text and "Fee | 5000" in text


def test_pdf_text_is_extracted():
    from pypdf import PdfWriter
    from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject
    w = PdfWriter()
    page = w.add_blank_page(width=300, height=200)
    font = DictionaryObject({NameObject("/Type"): NameObject("/Font"), NameObject("/Subtype"): NameObject("/Type1"),
                             NameObject("/BaseFont"): NameObject("/Helvetica")})
    page[NameObject("/Resources")] = DictionaryObject({NameObject("/Font"): DictionaryObject({NameObject("/F1"): font})})
    stream = DecodedStreamObject()
    stream.set_data(b"BT /F1 14 Tf 20 100 Td (Admissions close on 15 June) Tj ET")
    page[NameObject("/Contents")] = w._add_object(stream)
    buf = io.BytesIO()
    w.write(buf)
    assert "Admissions close on 15 June" in extract_text("policy.pdf", buf.getvalue())


def test_a_broken_pdf_gives_a_friendly_error():
    with pytest.raises(KnowledgeError, match="PDF"):
        extract_text("x.pdf", b"this is not a pdf")


def test_a_broken_docx_gives_a_friendly_error():
    with pytest.raises(KnowledgeError, match="Word"):
        extract_text("x.docx", b"not a zip")


def test_unsupported_types_are_refused():
    with pytest.raises(KnowledgeError, match="Unsupported"):
        extract_text("virus.exe", b"MZ")


def test_oversized_files_are_refused():
    with pytest.raises(KnowledgeError, match="too large"):
        extract_text("big.txt", b"x" * (knowledge.MAX_FILE_BYTES + 1))


# ── storage ─────────────────────────────────────────────────────────────

def test_add_source_stores_chunks_and_marks_ready(make_db):
    _, cur = make_db([], MOD, lastrowid=8)
    out = knowledge.add_source(cur, 2, type="text", title="Fees", text="Fees are due in May.\n\nLate fee is 500.")
    assert out == {"id": 8, "title": "Fees", "type": "text", "status": "ready", "chunks": 1}
    insert_sql, params = cur.sql_containing("INSERT INTO agent_knowledge_sources")[0]
    assert params == (2, "text", "Fees", None)
    sql, rows = cur.many[0]
    assert "agent_knowledge_chunks" in sql and len(rows) == 1
    assert rows[0][:4] == (8, 2, 0, "Fees are due in May.\n\nLate fee is 500.")
    stored = json.loads(rows[0][4])                              # every chunk is stored with its embedding
    assert stored["m"] == "hash1024" and len(stored["v"]) == 1024
    assert cur.sql_containing("status = 'ready'")[0][1] == (1, 8)


def test_add_source_rejects_empty_and_oversized_input(make_db):
    _, cur = make_db([], MOD)
    with pytest.raises(KnowledgeError, match="no text"):
        knowledge.add_source(cur, 2, type="text", title="t", text="   ")
    with pytest.raises(KnowledgeError, match="Too much text"):
        knowledge.add_source(cur, 2, type="text", title="t", text="x" * (knowledge.MAX_TEXT_CHARS + 1))
    assert cur.executed == []                                    # nothing written on failure


def test_add_source_caps_the_number_of_chunks(make_db, monkeypatch):
    monkeypatch.setattr(knowledge, "MAX_CHUNKS", 3)
    _, cur = make_db([], MOD)
    text = ("p" * 700 + "\n\n") * 5                              # 5 chunks > 3
    with pytest.raises(KnowledgeError, match="chunks"):
        knowledge.add_source(cur, 2, type="text", title="t", text=text)
    assert cur.sql_containing("INSERT") == []                    # refused before anything is written


def test_delete_source_is_scoped_to_the_agent(make_db):
    _, cur = make_db([], MOD, rowcount=1)
    assert knowledge.delete_source(cur, 2, 8) is True
    assert cur.executed[0][1] == (8, 2)
    _, cur = make_db([], MOD, rowcount=0)
    assert knowledge.delete_source(cur, 2, 999) is False


def test_list_sources_shape(make_db):
    import datetime
    _, cur = make_db([("FROM agent_knowledge_sources", [
        {"id": 1, "type": "file", "title": "Policy", "ref": "policy.pdf", "status": "ready", "error": None,
         "chunk_count": 4, "created_at": datetime.datetime(2026, 10, 28, 9, 0)}])], MOD)
    [s] = knowledge.list_sources(cur, 2)
    assert s == {"id": 1, "type": "file", "title": "Policy", "ref": "policy.pdf", "status": "ready", "error": None,
                 "chunks": 4, "created_at": "2026-10-28T09:00:00"}


def test_channel_text_is_decrypted_and_oldest_first(make_db, monkeypatch):
    monkeypatch.setattr(knowledge, "decrypt", lambda s: s.upper())
    _, cur = make_db([("FROM messages m", [{"content": "second", "username": "b"},
                                           {"content": "first", "username": "a"}])], MOD)
    assert knowledge.read_channel_text(cur, 11) == "a: FIRST\nb: SECOND"
    assert cur.executed[0][1] == (11, knowledge.CHANNEL_MESSAGE_LIMIT)


# ── search ──────────────────────────────────────────────────────────────

CHUNKS = [
    {"id": 1, "title": "Handbook", "content": "The library is open from nine to five."},
    {"id": 2, "title": "Fees", "content": "Tuition fees are due in May. Late fees apply after May 15."},
    {"id": 3, "title": "Fees", "content": "Scholarships reduce tuition."},
]


def test_search_ranks_by_term_coverage_then_frequency(make_db):
    make_db([("FROM agent_knowledge_chunks c", CHUNKS)], MOD)
    hits = knowledge.search(2, "when are fees due", k=3)
    assert [h["id"] for h in hits][0] == 2
    assert set(hits[0]) == {"id", "title", "content"}


def test_search_is_scoped_to_one_agent_and_ready_sources(make_db):
    _, cur = make_db([("FROM agent_knowledge_chunks c", [])], MOD)
    knowledge.search(7, "fees")
    sql, params = cur.executed[0]
    assert "c.agent_id = %s" in sql and "s.status = 'ready'" in sql and params[0] == 7


def test_search_text_never_reaches_the_sql(make_db):
    _, cur = make_db([("FROM agent_knowledge_chunks c", [])], MOD)
    knowledge.search(7, "100%_off'; DROP TABLE x")
    sql, params = cur.executed[0]
    assert "LIKE" not in sql and params[0] == 7 and "DROP" not in str(params)


def test_search_without_usable_words_returns_nothing(make_db):
    _, cur = make_db([], MOD)
    assert knowledge.search(7, "?! a") == [] and cur.executed == []


def test_search_works_for_urdu_and_arabic_words():
    assert knowledge.search_terms("فیس کب جمع کرانی ہے") == ["فیس", "جمع", "کرانی"]            # "کب" and "ہے" are stop words
    assert knowledge.search_terms("متى الموعد") == ["متى", "الموعد"]


def test_search_limits_results(make_db):
    make_db([("FROM agent_knowledge_chunks c", CHUNKS * 5)], MOD)
    assert len(knowledge.search(2, "fees", k=2)) == 2


def test_stop_words_do_not_count_as_keywords_but_a_question_made_only_of_them_still_searches():
    assert knowledge.search_terms("when is the library open") == ["library", "open"]
    assert knowledge.search_terms("library kitne baje khulti hai") == ["library", "baje", "khulti"]
    assert knowledge.search_terms("what is the") == ["what", "is", "the"]                              # never empty
    assert knowledge.search_terms("kab hai") == ["kab", "hai"]
