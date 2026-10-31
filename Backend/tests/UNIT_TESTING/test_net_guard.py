"""The outbound URL guard that stops webhooks and MCP servers from reaching private addresses."""
from __future__ import annotations

import socket

import pytest

from utils import net_guard
from utils.net_guard import UnsafeURL, check_public_url


def resolves_to(*addresses):
    def resolver(host, port, type=0):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (a, port)) for a in addresses]
    return resolver


@pytest.fixture(autouse=True)
def strict(monkeypatch):
    monkeypatch.delenv("NET_GUARD_ALLOW_PRIVATE", raising=False)


def test_a_public_https_url_passes():
    assert check_public_url("https://hooks.example.com/in?x=1", resolver=resolves_to("93.184.216.34")) \
        == "https://hooks.example.com/in?x=1"


@pytest.mark.parametrize("address", [
    "127.0.0.1", "10.0.0.5", "172.16.3.4", "192.168.1.9", "169.254.169.254", "0.0.0.0", "100.64.0.1",
    "224.0.0.1", "::1", "fe80::1", "fc00::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1"])
def test_private_and_reserved_addresses_are_refused(address):
    with pytest.raises(UnsafeURL, match="private or reserved"):
        check_public_url("https://example.com/x", resolver=resolves_to(address))


def test_one_private_answer_among_public_ones_is_enough_to_refuse():
    with pytest.raises(UnsafeURL):
        check_public_url("https://example.com/x", resolver=resolves_to("93.184.216.34", "10.0.0.1"))


@pytest.mark.parametrize("url, fragment", [
    ("", "characters"), ("x" * 600, "characters"), ("ftp://example.com/x", "https"), ("javascript:alert(1)", "https"),
    ("http://example.com/x", "https"), ("https://user:pw@example.com/x", "username"), ("https:///path", "host"),
    ("https://example.com:99999/x", "port")])
def test_malformed_or_risky_urls_are_refused(url, fragment):
    with pytest.raises(UnsafeURL, match=fragment):
        check_public_url(url, resolver=resolves_to("93.184.216.34"))


def test_a_name_that_does_not_resolve_is_refused():
    def broken(host, port, type=0):
        raise socket.gaierror("nope")
    with pytest.raises(UnsafeURL, match="could not be found"):
        check_public_url("https://nowhere.invalid/x", resolver=broken)


def test_literal_private_ip_in_the_url_is_refused_without_a_real_lookup():
    with pytest.raises(UnsafeURL):
        check_public_url("https://127.0.0.1/x")


def test_development_override_allows_local_http(monkeypatch):
    monkeypatch.setenv("NET_GUARD_ALLOW_PRIVATE", "1")
    assert net_guard.allow_private()
    assert check_public_url("http://localhost:9000/hook") == "http://localhost:9000/hook"
