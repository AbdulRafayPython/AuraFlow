"""
Embeddings for knowledge search
===============================
Turns text into a unit vector so a question can be matched to the closest knowledge chunks
even when no word is spelled the same (Roman Urdu spelling variants, typos, word endings).

Two providers behind one interface:

``hash``  Default, no network, no model download. Feature hashing of word and character
          n-grams into ``DIM`` buckets. It captures spelling-level similarity in any script
          (English, Urdu, Arabic, Roman Urdu) but not meaning across words.
``api``   Any OpenAI-compatible ``/embeddings`` endpoint, used when ``EMBEDDING_API_URL``,
          ``EMBEDDING_API_KEY`` and ``EMBEDDING_MODEL`` are set. Falls back to ``hash`` when
          the call fails, and the vector's ``model`` tag stops it being compared with vectors
          from another provider.
"""

from __future__ import annotations

import logging
import math
import os
import re
import zlib
from typing import Any, Dict, List, Optional, Sequence

log = logging.getLogger(__name__)

DIM = 1024
HASH_MODEL = f"hash{DIM}"
NGRAMS = (3, 4)
API_TIMEOUT = 60          # a model that has to be loaded first can take a while (``EMBEDDING_API_TIMEOUT``)
API_ATTEMPTS = 2
API_BATCH = 64


def _tokens(text: str) -> List[str]:
    return re.findall(r"\w+", (text or "").lower())


def _bucket(feature: str) -> int:
    return zlib.crc32(feature.encode("utf-8")) % DIM


def _sign(feature: str) -> int:
    return 1 if zlib.adler32(feature.encode("utf-8")) & 1 else -1


def _normalize(vec: List[float]) -> List[float]:
    norm = math.sqrt(sum(v * v for v in vec))
    return [round(v / norm, 4) for v in vec] if norm else vec


def hash_embed(text: str) -> List[float]:
    vec = [0.0] * DIM
    for word in _tokens(text):
        features = [("w", word, 2.0)]
        padded = f"^{word}$"
        for n in NGRAMS:
            features += [("c", padded[i:i + n], 1.0) for i in range(max(len(padded) - n + 1, 0))]
        for kind, feature, weight in features:
            key = f"{kind}:{feature}"
            vec[_bucket(key)] += _sign(key) * weight
    return _normalize(vec)


def _api_config() -> Optional[Dict[str, str]]:
    url, key, model = (os.getenv("EMBEDDING_API_URL"), os.getenv("EMBEDDING_API_KEY"), os.getenv("EMBEDDING_MODEL"))
    return {"url": url.rstrip("/"), "key": key, "model": model} if url and key and model else None


def _api_timeout() -> int:
    try:
        return max(5, int(os.getenv("EMBEDDING_API_TIMEOUT") or API_TIMEOUT))
    except ValueError:
        return API_TIMEOUT


def _api_embed_once(texts: Sequence[str], cfg: Dict[str, str]) -> List[List[float]]:
    import requests
    out: List[List[float]] = []
    for i in range(0, len(texts), API_BATCH):
        resp = requests.post(f"{cfg['url']}/embeddings", timeout=_api_timeout(),
                             headers={"Authorization": f"Bearer {cfg['key']}"},
                             json={"model": cfg["model"], "input": list(texts[i:i + API_BATCH])})
        resp.raise_for_status()
        data = sorted(resp.json()["data"], key=lambda d: d["index"])
        out.extend(_normalize([float(x) for x in d["embedding"]]) for d in data)
    if len(out) != len(texts):
        raise ValueError("the provider returned the wrong number of vectors")
    return out


def _api_embed(texts: Sequence[str], cfg: Dict[str, str]) -> Optional[List[List[float]]]:
    """Vectors from the provider; one more try after a failure (a cold model is slow once), else None."""
    for attempt in range(API_ATTEMPTS):
        try:
            return _api_embed_once(texts, cfg)
        except Exception as exc:  # noqa: BLE001
            last = attempt == API_ATTEMPTS - 1
            log.warning("[RUNTIME] embedding API failed (try %s of %s)%s: %s", attempt + 1, API_ATTEMPTS,
                        ", using the local embedding" if last else "", exc)
    return None


def embed_many(texts: Sequence[str]) -> Dict[str, Any]:
    """``{"model": tag, "vectors": [...]}``; one provider for the whole batch."""
    texts = [t or "" for t in texts]
    cfg = _api_config()
    if cfg and texts:
        vectors = _api_embed(texts, cfg)
        if vectors:
            return {"model": f"api:{cfg['model']}", "vectors": vectors}
    return {"model": HASH_MODEL, "vectors": [hash_embed(t) for t in texts]}


def embed_query(text: str, model: str) -> Optional[List[float]]:
    """A query vector from the same provider as the stored vectors (``model``), else None."""
    if model == HASH_MODEL:
        return hash_embed(text)
    cfg = _api_config()
    if cfg and model == f"api:{cfg['model']}":
        vectors = _api_embed([text], cfg)
        return vectors[0] if vectors else None
    return None


def cosine(a: Sequence[float], b: Sequence[float]) -> float:
    if not a or len(a) != len(b):
        return 0.0
    return sum(x * y for x, y in zip(a, b))      # both are unit vectors


def pack(model: str, vector: Sequence[float]) -> Dict[str, Any]:
    return {"m": model, "v": list(vector)}


def unpack(value: Any) -> Optional[Dict[str, Any]]:
    import json
    if isinstance(value, (str, bytes)):
        try:
            value = json.loads(value)
        except ValueError:
            return None
    if isinstance(value, dict) and isinstance(value.get("v"), list) and value.get("m"):
        return value
    return None
