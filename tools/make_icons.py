#!/usr/bin/env python3
"""Generates the web-app icons (no image libraries needed): blue tile + white ring + green dot.
Outputs web/public/icons/icon-192.png, icon-512.png, icon-maskable-512.png (content inside the 80% safe zone)."""
import struct
import zlib
from pathlib import Path

BLUE, WHITE, GREEN = (0x15, 0x57, 0xA0), (0xFF, 0xFF, 0xFF), (0x00, 0xC8, 0x3C)


def png(path: Path, size: int, scale: float, rounded: bool) -> None:
    c = (size - 1) / 2
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            dx, dy = x - c, y - c
            r = (dx * dx + dy * dy) ** 0.5 / (size / 2)
            # rounded-square tile (or full bleed for maskable)
            corner = 0.22 * size
            inside = True
            if rounded:
                ex, ey = max(abs(dx) - (size / 2 - corner), 0), max(abs(dy) - (size / 2 - corner), 0)
                inside = ex * ex + ey * ey <= corner * corner
            col = BLUE if inside else None
            if inside and 0.46 * scale <= r <= 0.60 * scale:
                col = WHITE
            if inside and r <= 0.30 * scale:
                col = GREEN
            row += bytes(col) + b"\xff" if col else b"\x00\x00\x00\x00"
        rows.append(bytes(row))
    raw = zlib.compress(b"".join(rows), 9)

    def chunk(t: bytes, d: bytes) -> bytes:
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)) + chunk(b"IDAT", raw) + chunk(b"IEND", b"")
    path.write_bytes(data)


out = Path(__file__).resolve().parent.parent / "web" / "public" / "icons"
out.mkdir(parents=True, exist_ok=True)
png(out / "icon-192.png", 192, 1.0, True)
png(out / "icon-512.png", 512, 1.0, True)
png(out / "icon-maskable-512.png", 512, 0.8, False)
print("icons:", ", ".join(sorted(p.name for p in out.glob("*.png"))))
