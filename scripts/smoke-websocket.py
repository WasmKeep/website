#!/usr/bin/env python3
"""Dependency-free local smoke check: two sockets see a POST within one second."""

import base64
import hashlib
import http.client
import json
import os
import socket
import struct
import sys
import time
from contextlib import ExitStack
from urllib.parse import urlsplit


def exact(stream, size):
    data = bytearray()
    while len(data) < size:
        chunk = stream.recv(size - len(data))
        if not chunk:
            raise AssertionError("WebSocket closed before the broadcast")
        data.extend(chunk)
    return bytes(data)


def send(stream, opcode, data):
    # All smoke-test client frames are small and must be masked.
    assert len(data) < 126
    mask = os.urandom(4)
    stream.sendall(bytes([0x80 | opcode, 0x80 | len(data)]) + mask
                   + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))


def connect(base):
    stream = socket.create_connection((base.hostname, base.port), timeout=5)
    try:
        key = base64.b64encode(os.urandom(16)).decode()
        stream.sendall((f"GET /api/wall/live HTTP/1.1\r\nHost: {base.netloc}\r\n"
                        "Upgrade: websocket\r\nConnection: Upgrade\r\n"
                        f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n"
                        f"Origin: http://{base.netloc}\r\n\r\n").encode())
        head = bytearray()
        while not head.endswith(b"\r\n\r\n"):
            assert len(head) < 16384, "oversized handshake"
            head.extend(exact(stream, 1))
        lines = head.decode().split("\r\n")
        assert lines[0].split()[1] == "101", lines[0]
        headers = {name.lower(): value.strip() for name, value in
                   (line.split(":", 1) for line in lines[1:] if ":" in line)}
        accept = base64.b64encode(hashlib.sha1(
            (key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()).digest()).decode()
        assert headers.get("sec-websocket-accept") == accept
        return stream
    except BaseException:
        stream.close()
        raise


def receive(stream, deadline):
    while True:
        stream.settimeout(max(0.001, deadline - time.monotonic()))
        first, second = exact(stream, 2)
        assert first & 0x80 and not first & 0x70, "unexpected fragmented/extended frame"
        assert not second & 0x80, "server frames must not be masked"
        size = second & 0x7F
        if size == 126:
            size = struct.unpack("!H", exact(stream, 2))[0]
        elif size == 127:
            size = struct.unpack("!Q", exact(stream, 8))[0]
        assert size <= 128, "oversized broadcast"
        body = exact(stream, size)
        opcode = first & 0x0F
        if opcode == 9:
            send(stream, 10, body)
            continue
        assert opcode == 1, f"expected text broadcast, got opcode {opcode}"
        return json.loads(body)


def main():
    base = urlsplit(sys.argv[1])
    assert base.scheme == "http" and base.hostname == "127.0.0.1", "local smoke only"
    with ExitStack() as stack:
        sockets = [stack.enter_context(connect(base)) for _ in range(2)]
        # The room must ignore client messages, including forged notifications.
        send(sockets[0], 1, b'{"lang":"rust","count":999999}')
        for lang in ("rust", "zig"):
            client = http.client.HTTPConnection(base.hostname, base.port, timeout=5)
            try:
                started = time.monotonic()
                client.request("POST", f"/api/wall/{lang}", headers={"Accept": "application/json"})
                response = client.getresponse()
                assert response.status == 200, response.status
                added = json.loads(response.read())
                expected = {"lang": lang, "count": added["count"]}
                for stream in sockets:
                    assert receive(stream, started + 1) == expected
                elapsed = time.monotonic() - started
                assert elapsed < 1, f"broadcast took {elapsed:.3f}s"
                print(f"ok   both WebSockets receive {lang} broadcast in {elapsed * 1000:.0f} ms")
            finally:
                client.close()
        for stream in sockets:
            send(stream, 8, struct.pack("!H", 1000))


if __name__ == "__main__":
    main()
