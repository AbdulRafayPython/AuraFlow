"""
Outbound URL guard (SSRF)
=========================
Webhooks and MCP servers make the server call a URL a user typed. Without a check, that URL
could point at ``localhost``, the database, the cloud metadata service (169.254.169.254) or
anything else on the private network. :func:`check_public_url` only lets through ``http(s)``
URLs whose host resolves to public addresses.

The check resolves the name itself, so call it right before each request (and send with
redirects disabled). A name that changes its answer between the check and the connection
(DNS rebinding) is not covered; keep the network egress of the server restricted as well.

Set ``NET_GUARD_ALLOW_PRIVATE=1`` for local development (it also allows plain ``http``).
"""

from __future__ import annotations

import ipaddress
import os
import socket
from typing import Callable, Iterable, Optional
from urllib.parse import urlsplit

MAX_URL_CHARS = 500


class UnsafeURL(ValueError):
    """The URL is not acceptable; the message is safe to show to the user."""


def allow_private() -> bool:
    return (os.getenv("NET_GUARD_ALLOW_PRIVATE") or "").strip() == "1"


def _is_public(address: str) -> bool:
    try:
        ip = ipaddress.ip_address(address.split("%")[0])
    except ValueError:
        return False
    mapped = getattr(ip, "ipv4_mapped", None)
    if mapped is not None:
        ip = mapped
    return ip.is_global and not ip.is_multicast


def check_public_url(url: str, *, resolver: Optional[Callable[..., Iterable]] = None) -> str:
    """Return ``url`` if it is a safe public http(s) URL, else raise :class:`UnsafeURL`."""
    url = (url or "").strip()
    if not url or len(url) > MAX_URL_CHARS:
        raise UnsafeURL(f"The URL must be 1 to {MAX_URL_CHARS} characters.")
    parts = urlsplit(url)
    private_ok = allow_private()
    if parts.scheme not in ("https", "http") or (parts.scheme == "http" and not private_ok):
        raise UnsafeURL("The URL must start with https://")
    if parts.username or parts.password:
        raise UnsafeURL("The URL must not contain a username or password.")
    host = parts.hostname
    if not host:
        raise UnsafeURL("The URL has no host name.")
    try:
        port = parts.port
    except ValueError:
        raise UnsafeURL("The URL has an invalid port.")
    if private_ok:
        return url
    try:
        ipaddress.ip_address(host)                  # a literal address needs no lookup
        addresses = {host}
    except ValueError:
        try:
            infos = list((resolver or socket.getaddrinfo)(host, port or (443 if parts.scheme == "https" else 80),
                                                           type=socket.SOCK_STREAM))
        except OSError:
            raise UnsafeURL("The host name could not be found.")
        addresses = {info[4][0] for info in infos}
    if not addresses or not all(_is_public(a) for a in addresses):
        raise UnsafeURL("The URL points to a private or reserved address, which is not allowed.")
    return url
