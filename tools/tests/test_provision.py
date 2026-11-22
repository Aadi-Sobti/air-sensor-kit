import re
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import labels  # noqa: E402
import provision as pv  # noqa: E402

SITE = "https://example.test"


class FakeBoard:
    """Simulates the firmware's USB line protocol (boot lines, SETUPINFO, SETCODE + restart)."""

    def __init__(self, port, *, save_ok=True, code_after_restart=None, env="release", code="", enrolled=0):
        self.code = code
        self.env = env
        self.enrolled = enrolled
        self.save_ok = save_ok
        self.code_after_restart = code_after_restart
        self.out = ""
        self.closed = False
        self.sent = []

    def _boot(self):
        self.out += f"garbage\x00\xff[boot] ProseFire fw=0.7.2 env={self.env} id=esp8266-11001626 reset=External\r\n"
        self.out += (f"[identity] loaded short_code={self.code or '(unassigned)'} fs=ok config=loaded "
                     f"enrolled={self.enrolled}\r\n")

    def reset(self):
        self._boot()

    def send(self, line):
        self.sent.append(line)
        if line == "PFCMD SETUPINFO":
            ssid = f"ProseFire-Setup-{self.code or 'FDK7NA'}"
            self.out += f"[setupinfo] ap_ssid={ssid} ap_password=SETUPPW23456\r\n"
        elif line.startswith("PFCMD SETCODE "):
            c = line.split()[-1]
            self.out += f"[factory] short_code={c} saved={1 if self.save_ok else 0}\r\n"
            if self.save_ok:
                self.code = self.code_after_restart or c
                self._boot()

    def wait(self, pattern, seconds, resend=None):
        for _ in range(2):
            m = pattern.search(self.out)
            if m:
                self.out = self.out[m.end():]
                return m
            if resend:
                self.send(resend)
        raise pv.Fail("no answer")

    def close(self):
        self.closed = True


def reg_ok(site, key, device_id, fw, reprovision=False):
    assert key == "k" * 64 and device_id == "esp8266-11001626" and fw == "0.7.2"
    return {"ok": True, "shortCode": "K7Q2MX", "ownerCode": "7KQ2-MX4P-R9"}


def run(tmp_path, board=FakeBoard, register_fn=reg_ok, size=4, firmware=True, fw_bytes=b"\xe9 release image",
        **kw):
    flashed = []
    boards = []
    fw = tmp_path / "fw.bin"
    fw.write_bytes(fw_bytes)

    def factory(port):
        b = board(port)
        boards.append(b)
        return b

    r = pv.provision("/dev/fake", firmware=fw if firmware else None, site=SITE, key="k" * 64, row=1,
                     out=tmp_path, board_factory=factory, flash_fn=lambda p, f: flashed.append(f),
                     size_fn=lambda p: size, register_fn=register_fn, say=lambda m: None, **kw)
    return r, flashed, boards


def test_happy_path_registers_confirms_and_makes_labels(tmp_path):
    r, flashed, boards = run(tmp_path)
    assert r.ok, r.reason
    assert flashed and r.steps == ["flashed", "registered", "confirmed"]
    assert (r.device_id, r.short_code, r.fw) == ("esp8266-11001626", "K7Q2MX", "0.7.2")
    assert r.label.exists() and r.label.name == "labels-K7Q2MX.pdf"
    assert "PFCMD SETCODE K7Q2MX" in boards[-1].sent and all(b.closed for b in boards)


def test_no_label_when_registration_fails(tmp_path):
    def refuse(*a):
        raise pv.Fail("registration refused (HTTP 401 bad_station_key)")
    r, _, boards = run(tmp_path, register_fn=refuse)
    assert not r.ok and "401" in r.reason
    assert not list(tmp_path.glob("*.pdf"))
    assert not any(s.startswith("PFCMD SETCODE") for b in boards for s in b.sent)


def test_no_label_when_the_board_cant_save_or_reports_another_code(tmp_path):
    r, _, _ = run(tmp_path, board=lambda p: FakeBoard(p, save_ok=False))
    assert not r.ok and "save" in r.reason
    r, _, _ = run(tmp_path, board=lambda p: FakeBoard(p, code_after_restart="WRONG2"))
    assert not r.ok and "WRONG2" in r.reason
    assert not list(tmp_path.glob("*.pdf"))


def test_small_flash_is_refused_before_flashing(tmp_path):
    r, flashed, _ = run(tmp_path, size=1)
    assert not r.ok and "flash" in r.reason and not flashed


def test_reprint_without_flashing(tmp_path):
    r, flashed, _ = run(tmp_path, firmware=False)
    assert r.ok and not flashed and r.steps == ["registered", "confirmed"]


def test_board_already_in_a_kit_or_home_is_never_erased(tmp_path):
    for kw in ({"code": "K7Q2MX"}, {"enrolled": 1}):
        r, flashed, _ = run(tmp_path, board=lambda p, kw=kw: FakeBoard(p, **kw))
        assert not r.ok and "already belongs" in r.reason and not flashed, kw
    # Reprint mode on a board that has sent readings from a home: refused too.
    r, _, _ = run(tmp_path, board=lambda p: FakeBoard(p, enrolled=1), firmware=False)
    assert not r.ok and "readings" in r.reason


def test_reprovision_flag_reaches_the_server(tmp_path):
    seen = []

    def reg(site, key, device_id, fw, reprovision=False):
        seen.append(reprovision)
        return reg_ok(site, key, device_id, fw)
    r, flashed, _ = run(tmp_path, board=lambda p: FakeBoard(p, code="K7Q2MX"), register_fn=reg, reprovision=True)
    assert r.ok and flashed and seen == [True]


def test_kits_get_release_firmware_only(tmp_path):
    r, flashed, _ = run(tmp_path, fw_bytes=b"\xe9 ... http://example.test/ingest ...")
    assert not r.ok and "release build" in r.reason and not flashed
    r, _, _ = run(tmp_path, board=lambda p: FakeBoard(p, env="dev"))
    assert not r.ok and "dev build" in r.reason
    r, _, _ = run(tmp_path, board=lambda p: FakeBoard(p, env="dev"), allow_dev=True)
    assert r.ok


def test_csv_log_never_has_secrets(tmp_path):
    r, _, _ = run(tmp_path)
    pv.log_csv(tmp_path / "log.csv", r)
    text = (tmp_path / "log.csv").read_text()
    assert "K7Q2MX" in text and "esp8266-11001626" in text and "OK" in text
    assert "SETUPPW23456" not in text and "7KQ2-MX4P-R9" not in text


def test_patterns_match_real_firmware_lines():
    assert pv.BOOT_RE.search("[boot] ProseFire fw=0.7.2 env=dev id=esp8266-11001626 reset=External System").group(3) \
        == "esp8266-11001626"
    m = pv.IDENTITY_RE.search("[identity] loaded short_code=(unassigned) fs=ok config=loaded enrolled=1\r\n")
    assert m.group(2) == "(unassigned)" and m.group(3) == "1"
    assert pv.SAVED_RE.search("[factory] short_code=K7Q2MX saved=1").groups() == ("K7Q2MX", "1")
    assert pv.SETUPINFO_RE.search("[setupinfo] ap_ssid=ProseFire-Setup-K7Q2MX ap_password=ABC") is None  # no line end


def test_label_pdf_is_valid_and_contains_codes():
    k = labels.Kit("K7Q2MX", "ProseFire-Setup-K7Q2MX", "SETUPPW23456", "7KQ2-MX4P-R9", SITE)
    pdf = labels.kit_pdf(k, row=3)
    assert pdf.startswith(b"%PDF-1.4") and pdf.rstrip().endswith(b"%%EOF")
    assert b"(K7Q2MX)" in pdf and b"(7KQ2-MX4P-R9)" in pdf and b"(SETUP)" in pdf
    xref = int(re.search(rb"startxref\n(\d+)", pdf).group(1))
    assert pdf[xref:xref + 4] == b"xref"
    with pytest.raises(ValueError):
        labels.kit_pdf(k, row=6)
    assert labels.owner_url(SITE, "7KQ2-MX4P-R9") == "https://example.test/my#owner=7KQ2-MX4P-R9"
    assert labels.wifi_qr_payload('a;b', 'p"w') == 'WIFI:T:WPA;S:a\\;b;P:p\\"w;;'


@pytest.mark.skipif(sys.platform != "darwin" or not shutil.which("swift"), reason="macOS QR decoder only")
def test_qr_codes_decode_with_an_independent_reader(tmp_path):
    """Apple's CoreImage QR reader (not segno) must read back exactly what we encoded."""
    k = labels.Kit("K7Q2MX", "ProseFire-Setup-K7Q2MX", "SETUPPW23456", "7KQ2-MX4P-R9", "https://prosefire-dev.web.app")
    f = tmp_path / "l.pdf"
    f.write_bytes(labels.kit_pdf(k))
    out = subprocess.run(["swift", str(Path(__file__).resolve().parent.parent / "qr_decode_pdf.swift"), str(f)],
                         capture_output=True, text=True, timeout=300).stdout.split("\n")
    assert "WIFI:T:WPA;S:ProseFire-Setup-K7Q2MX;P:SETUPPW23456;;" in out
    assert "https://prosefire-dev.web.app/my#owner=7KQ2-MX4P-R9" in out
