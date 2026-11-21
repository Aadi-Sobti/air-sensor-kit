"""Improv Wi-Fi serial codec (client side). Spec: https://www.improv-wifi.com/serial/ ; checksum per the reference
SDK https://github.com/improv-wifi/sdk-cpp (sum of all bytes from 'I' through the data, mod 256).
Mirrors firmware/lib/core/src/improv.cpp; tests in tools/tests/test_improv.py."""
from __future__ import annotations

HEADER = b"IMPROV"
VERSION = 0x01
T_STATE, T_ERROR, T_RPC, T_RESULT = 0x01, 0x02, 0x03, 0x04
WIFI_SETTINGS, GET_STATE, GET_INFO, GET_NETWORKS = 0x01, 0x02, 0x03, 0x04
STATES = {0x00: "stopped", 0x02: "ready", 0x03: "provisioning", 0x04: "provisioned"}
ERRORS = {0x00: "no error", 0x01: "invalid RPC", 0x02: "unknown RPC", 0x03: "unable to connect", 0xFF: "unknown"}


def frame(ftype: int, data: bytes) -> bytes:
    if len(data) > 255:
        raise ValueError("data too long")
    body = HEADER + bytes([VERSION, ftype, len(data)]) + data
    return body + bytes([sum(body) & 0xFF])


def rpc(command: int, payload: bytes = b"") -> bytes:
    return frame(T_RPC, bytes([command, len(payload)]) + payload)


def wifi_settings(ssid: str, password: str) -> bytes:
    s, p = ssid.encode("utf-8"), password.encode("utf-8")
    if not s or len(s) > 32 or len(p) > 64:
        raise ValueError("WiFi name must be 1-32 bytes and password at most 64 bytes")
    return rpc(WIFI_SETTINGS, bytes([len(s)]) + s + bytes([len(p)]) + p)


def parse_strings(data: bytes) -> list[str]:
    """RPC result data: command, length, then length-prefixed strings."""
    out, i = [], 2
    while i < len(data):
        n = data[i]
        out.append(data[i + 1:i + 1 + n].decode("utf-8", "replace"))
        i += 1 + n
    return out


class Parser:
    """Feeds bytes (logs mixed in); yields (type, data) for checksum-valid frames."""

    def __init__(self) -> None:
        self.buf = bytearray()

    def feed(self, chunk: bytes):
        self.buf += chunk
        while True:
            i = self.buf.find(HEADER)
            if i < 0:
                del self.buf[:-5]  # keep a possible partial header
                return
            del self.buf[:i]
            if len(self.buf) >= 7 and self.buf[6] != VERSION:
                del self.buf[:1]  # "IMPROV" inside a log line, not a frame: keep scanning
                continue
            if len(self.buf) < 9:
                return
            n = self.buf[8]
            if len(self.buf) < 10 + n:
                return
            fr = bytes(self.buf[:10 + n])
            del self.buf[:10 + n]
            if fr[6] != VERSION or (sum(fr[:-1]) & 0xFF) != fr[-1]:
                continue
            yield fr[7], fr[9:9 + n]
