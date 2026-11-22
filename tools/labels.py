"""Kit card labels (M9): a SETUP label (front of the card) and an OWNER label (back), as a printable PDF.

Layout: US-letter sticker sheets with 4" x 2" labels, 2 across x 5 down (the common "5163-style" layout: top margin
0.5", left 0.15625", 3/16" between columns). One kit = one row: SETUP on the left, OWNER on the right, so the two
can't come from different kits. `row` (1-5) picks the row, so a partly used sheet can be fed again.
The exact sticker product is the founder's pick (decision #8 follow-up); only LAYOUT below changes for another one.

QR codes: segno (BSD-3; founder decision 2026-11-22), error correction M, 4-module quiet zone.
PDF: written here by hand (one page, Helvetica, vector squares for the QR modules), no PDF library.
Wording is a DRAFT until the founder approves it (docs/USER_FLOW.md is the source of truth).
"""
from __future__ import annotations

from dataclasses import dataclass

import segno

PT = 72  # points per inch
LAYOUT = dict(page_w=8.5 * PT, page_h=11 * PT, label_w=4 * PT, label_h=2 * PT, top=0.5 * PT, left=0.15625 * PT,
              col_gap=0.1875 * PT, rows=5)


@dataclass
class Kit:
    short_code: str      # e.g. K7Q2MX
    ap_ssid: str         # setup WiFi name
    ap_password: str     # setup WiFi password (secret: only on the printed label)
    owner_code: str      # XXXX-XXXX-XX (secret: only on the printed label)
    site: str            # https://<domain>


def wifi_qr_payload(ssid: str, password: str) -> str:
    """Standard WiFi QR text. Escape \\ ; , : " in SSID and password (tools spec)."""
    special = set('\\;,:"')
    esc = lambda s: "".join("\\" + c if c in special else c for c in s)  # noqa: E731
    return f"WIFI:T:WPA;S:{esc(ssid)};P:{esc(password)};;"


def owner_url(site: str, owner_code: str) -> str:
    return f"{site.rstrip('/')}/my#owner={owner_code}"


def sensor_url(site: str, short_code: str) -> str:
    return f"{site.rstrip('/')}/s/{short_code}"


def qr_modules(data: str) -> list[list[bool]]:
    qr = segno.make(data, error="m", micro=False, boost_error=False)
    return [[bool(v) for v in row] for row in qr.matrix]


def _esc(s: str) -> str:
    s.encode("latin-1")  # Helvetica/WinAnsi: labels are ASCII + Latin-1 only
    return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


class Page:
    def __init__(self) -> None:
        self.ops: list[str] = []

    def text(self, x: float, y: float, size: float, s: str, bold: bool = False) -> None:
        self.ops.append(f"BT /{'F2' if bold else 'F1'} {size:.1f} Tf {x:.2f} {y:.2f} Td ({_esc(s)}) Tj ET")

    def qr(self, x: float, y: float, size: float, data: str) -> None:
        """QR code with a white 4-module quiet zone, `size` points wide including the quiet zone."""
        m = qr_modules(data)
        n = len(m) + 8
        cell = size / n
        rects = []
        for r, row in enumerate(m):
            for c, dark in enumerate(row):
                if dark:
                    rects.append(f"{x + (c + 4) * cell:.3f} {y + size - (r + 5) * cell:.3f} {cell:.3f} {cell:.3f} re")
        self.ops.append("0 g " + " ".join(rects) + " f")

    def outline(self, x: float, y: float, w: float, h: float) -> None:
        self.ops.append(f"0.8 G 0.5 w {x:.2f} {y:.2f} {w:.2f} {h:.2f} re S")

    def content(self) -> bytes:
        return "\n".join(self.ops).encode("latin-1")


def pdf_bytes(page: Page, width: float, height: float) -> bytes:
    content = page.content()
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        (f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {width:.0f} {height:.0f}] "
         f"/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>").encode(),
        b"<< /Length %d >>\nstream\n" % len(content) + content + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    ]
    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = []
    for i, body in enumerate(objs, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)
    for off in offsets:
        out += b"%010d 00000 n \n" % off
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref)
    return bytes(out)


def label_origin(row: int, col: int) -> tuple[float, float]:
    L = LAYOUT
    x = L["left"] + col * (L["label_w"] + L["col_gap"])
    y = L["page_h"] - L["top"] - row * L["label_h"]  # top edge of the label
    return x, y - L["label_h"]


def draw_setup(p: Page, x: float, y: float, k: Kit) -> None:
    q = 118
    p.qr(x + 8, y + (LAYOUT["label_h"] - q) / 2, q, wifi_qr_payload(k.ap_ssid, k.ap_password))
    tx = x + q + 16
    p.text(tx, y + 120, 16, "SETUP", bold=True)
    p.text(tx, y + 106, 7.5, "Phone setup: scan this code with")
    p.text(tx, y + 97, 7.5, "your camera to join the sensor's WiFi.")
    p.text(tx, y + 85, 7, "Escanea para conectar tu teléfono.")
    p.text(tx, y + 66, 7.5, "Sensor code")
    p.text(tx, y + 48, 20, k.short_code, bold=True)
    p.text(tx, y + 32, 6.5, "WiFi: " + k.ap_ssid)
    p.text(tx, y + 23, 6.5, "Password: " + k.ap_password)
    p.text(tx, y + 10, 6.5, sensor_url(k.site, k.short_code).replace("https://", ""))


def draw_owner(p: Page, x: float, y: float, k: Kit) -> None:
    q = 118
    p.qr(x + 8, y + (LAYOUT["label_h"] - q) / 2, q, owner_url(k.site, k.owner_code))
    tx = x + q + 16
    p.text(tx, y + 120, 11.5, "OWNER: KEEP PRIVATE", bold=True)
    p.text(tx, y + 106, 7.5, "Scan to manage your sensor:")
    p.text(tx, y + 97, 7.5, "status, readings, notices.")
    p.text(tx, y + 85, 7, "Escanea para administrar tu sensor.")
    p.text(tx, y + 66, 7.5, "Owner code")
    p.text(tx, y + 48, 15, k.owner_code, bold=True)
    p.text(tx, y + 23, 6.5, "Or go to " + (k.site.rstrip("/") + "/my").replace("https://", ""))
    p.text(tx, y + 14, 6.5, "and type the owner code.")


def kit_pdf(k: Kit, row: int = 1, outlines: bool = False) -> bytes:
    """One kit on row `row` (1-5) of a sticker sheet: SETUP left, OWNER right."""
    if not 1 <= row <= LAYOUT["rows"]:
        raise ValueError("row must be 1-5")
    p = Page()
    for col, draw in ((0, draw_setup), (1, draw_owner)):
        x, y = label_origin(row - 1, col)
        if outlines:
            p.outline(x, y, LAYOUT["label_w"], LAYOUT["label_h"])
        draw(p, x, y, k)
    return pdf_bytes(p, LAYOUT["page_w"], LAYOUT["page_h"])
