"""Embeddings and the hybrid (embedding + keyword) knowledge ranking."""
from __future__ import annotations

import json
import math

import pytest

from agents.runtime import embeddings, knowledge


def test_vectors_are_unit_length_and_fixed_size():
    v = embeddings.hash_embed("Hostel rent is due on the first")
    assert len(v) == embeddings.DIM
    assert math.isclose(sum(x * x for x in v), 1.0, rel_tol=1e-2)


def test_empty_text_is_a_zero_vector_that_matches_nothing():
    v = embeddings.hash_embed("   ")
    assert not any(v) and embeddings.cosine(v, embeddings.hash_embed("fees")) == 0.0


def test_the_same_text_always_gives_the_same_vector():
    assert embeddings.hash_embed("fees due") == embeddings.hash_embed("fees due")


@pytest.mark.parametrize("a, b, c", [
    ("hostel rent kab dena hai", "hostal rent kab dena hay", "library opens at nine"),       # Roman Urdu spelling
    ("registration deadline", "registrations deadlines", "cafeteria menu"),                  # word endings
    ("فیس جمع کرانی ہے", "فیس جمع کرائیں", "لائبریری کھلی ہے"),                                 # Urdu
])
def test_spelling_variants_are_closer_than_unrelated_text(a, b, c):
    va, vb, vc = (embeddings.hash_embed(t) for t in (a, b, c))
    assert embeddings.cosine(va, vb) > embeddings.cosine(va, vc) + 0.2


def test_cosine_of_different_sizes_is_zero():
    assert embeddings.cosine([1.0, 0.0], [1.0]) == 0.0


def test_pack_and_unpack_round_trip_and_reject_junk():
    packed = embeddings.pack("hash1024", [0.5, 0.5])
    assert embeddings.unpack(json.dumps(packed)) == packed
    assert embeddings.unpack(packed) == packed
    for junk in (None, "", "not json", "[1,2]", {"m": "x"}, {"v": [1]}):
        assert embeddings.unpack(junk) is None


# ── providers ───────────────────────────────────────────────────────────

def test_local_provider_is_used_without_configuration(monkeypatch):
    for name in ("EMBEDDING_API_URL", "EMBEDDING_API_KEY", "EMBEDDING_MODEL"):
        monkeypatch.delenv(name, raising=False)
    out = embeddings.embed_many(["a b", "c d"])
    assert out["model"] == embeddings.HASH_MODEL and len(out["vectors"]) == 2


class _Resp:
    def __init__(self, vectors):
        self._vectors = vectors

    def raise_for_status(self):
        pass

    def json(self):
        return {"data": [{"index": i, "embedding": v} for i, v in reversed(list(enumerate(self._vectors)))]}


@pytest.fixture
def api(monkeypatch):
    monkeypatch.setenv("EMBEDDING_API_URL", "https://emb.example/v1/")
    monkeypatch.setenv("EMBEDDING_API_KEY", "k")
    monkeypatch.setenv("EMBEDDING_MODEL", "m1")
    calls = []

    def fake_post(url, **kw):
        calls.append((url, kw))
        return _Resp([[3.0, 4.0]] * len(kw["json"]["input"]))
    monkeypatch.setattr("requests.post", fake_post)
    return calls


def test_api_provider_is_used_when_configured_and_vectors_are_normalised(api):
    out = embeddings.embed_many(["one", "two"])
    assert out["model"] == "api:m1" and out["vectors"] == [[0.6, 0.8], [0.6, 0.8]]
    assert api[0][0] == "https://emb.example/v1/embeddings".replace("v1/embeddings", "v1/embeddings")
    assert api[0][1]["headers"]["Authorization"] == "Bearer k"


def test_api_failure_falls_back_to_the_local_provider(monkeypatch, api):
    def boom(*a, **k):
        raise RuntimeError("down")
    monkeypatch.setattr("requests.post", boom)
    assert embeddings.embed_many(["x"])["model"] == embeddings.HASH_MODEL


def test_query_vectors_only_come_from_the_provider_that_made_the_chunks(api):
    assert embeddings.embed_query("q", "hash1024") == embeddings.hash_embed("q")
    assert embeddings.embed_query("q", "api:m1") == [0.6, 0.8]
    assert embeddings.embed_query("q", "api:other") is None


# ── hybrid ranking ──────────────────────────────────────────────────────

def chunk(i, text, model="hash1024", with_vec=True):
    row = {"id": i, "title": "Doc", "content": text}
    if with_vec:
        row["embedding"] = json.dumps(embeddings.pack(model, embeddings.hash_embed(text)))
    return row


ROWS = [
    chunk(1, "The library is open from nine to five."),
    chunk(2, "Hostel rent is 1200 AED and is due on the 1st of every month."),
    chunk(3, "Scholarships reduce tuition."),
]


def test_a_misspelt_question_still_finds_the_chunk():
    terms = knowledge.search_terms("hostal rent kab dena hay")
    hits = knowledge.rank(ROWS, "hostal rent kab dena hay", terms, 3)
    assert hits[0]["id"] == 2                       # 'rent' is a keyword hit, 'hostal' only matches by embedding


def test_a_chunk_with_no_keyword_hit_is_found_by_its_embedding():
    terms = knowledge.search_terms("hostals")
    hits = knowledge.rank(ROWS, "hostals", terms, 3)
    assert [h["id"] for h in hits] == [2]


def test_unrelated_chunks_are_left_out():
    terms = knowledge.search_terms("quantum physics")
    assert knowledge.rank(ROWS, "quantum physics", terms, 3) == []


def test_older_rows_without_a_stored_embedding_are_still_ranked():
    rows = [chunk(2, ROWS[1]["content"], with_vec=False)]
    terms = knowledge.search_terms("hostals")
    assert [h["id"] for h in knowledge.rank(rows, "hostals", terms, 3)] == [2]


def test_chunks_from_another_provider_are_ranked_by_keywords_only():
    rows = [chunk(2, ROWS[1]["content"], model="api:gone")]
    assert knowledge.rank(rows, "hostals", ["hostals"], 3) == []                  # no keyword, vector unusable
    assert [h["id"] for h in knowledge.rank(rows, "rent", ["rent"], 3)] == [2]    # keyword still works


def test_result_shape_and_limit():
    hits = knowledge.rank(ROWS * 3, "rent", ["rent"], 2)
    assert len(hits) == 2 and set(hits[0]) == {"id", "title", "content"}


def test_a_slow_first_call_is_tried_once_more_before_giving_up(monkeypatch, api):
    calls = {"n": 0}
    good = __import__("requests").post

    def flaky(url, **kw):
        calls["n"] += 1
        if calls["n"] == 1:
            raise TimeoutError("model still loading")
        return _Resp([[3.0, 4.0]] * len(kw["json"]["input"]))
    monkeypatch.setattr("requests.post", flaky)
    out = embeddings.embed_many(["one"])
    assert out["model"] == "api:m1" and out["vectors"] == [[0.6, 0.8]] and calls["n"] == 2


def test_the_timeout_can_be_set_and_never_goes_below_five_seconds(monkeypatch):
    monkeypatch.setenv("EMBEDDING_API_TIMEOUT", "120")
    assert embeddings._api_timeout() == 120
    monkeypatch.setenv("EMBEDDING_API_TIMEOUT", "1")
    assert embeddings._api_timeout() == 5
    monkeypatch.setenv("EMBEDDING_API_TIMEOUT", "soon")
    assert embeddings._api_timeout() == embeddings.API_TIMEOUT
