"""Scriptable fake database for the runtime tests (import the `make_db` fixture)."""
from __future__ import annotations

from typing import Any, Callable, List, Tuple, Union

import pytest

Result = Union[dict, List[dict], Callable[[str, Any], Any], None]


class FakeCursor:
    """``execute`` picks the first scripted rule whose text appears in the SQL."""

    def __init__(self, script: List[Tuple[str, Result]], lastrowid: int = 1, rowcount: int = 1):
        self.script = script
        self.executed: List[Tuple[str, Any]] = []
        self.many: List[Tuple[str, List[Any]]] = []
        self.lastrowid = lastrowid
        self.rowcount = rowcount
        self._rows: List[dict] = []

    def execute(self, sql, params=None):
        self.executed.append((sql, params))
        for needle, result in self.script:
            if needle in sql:
                value = result(sql, params) if callable(result) else result
                if isinstance(value, dict):
                    value = [value]
                self._rows = list(value or [])
                return
        self._rows = []

    def executemany(self, sql, seq):
        self.many.append((sql, list(seq)))

    def fetchone(self):
        return self._rows.pop(0) if self._rows else None

    def fetchall(self):
        rows, self._rows = self._rows, []
        return rows

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def sql_containing(self, needle: str) -> List[Tuple[str, Any]]:
        return [e for e in self.executed if needle in e[0]]


class FakeConn:
    def __init__(self, cursor: FakeCursor):
        self._cursor = cursor
        self.commits = 0
        self.rollbacks = 0
        self.closed = False

    def cursor(self):
        return self._cursor

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

    def close(self):
        self.closed = True


@pytest.fixture
def make_db(monkeypatch):
    """``make_db(script, modules=(...), lastrowid=1)`` -> (conn, cursor).

    Replaces ``get_db_connection`` in every named module with one returning
    the fake connection.
    """
    def factory(script, modules=(), lastrowid=1, rowcount=1):
        cur = FakeCursor(script, lastrowid, rowcount)
        conn = FakeConn(cur)
        for module in modules:
            monkeypatch.setattr(f"{module}.get_db_connection", lambda: conn)
        return conn, cur

    return factory
