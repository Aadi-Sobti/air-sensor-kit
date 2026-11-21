import serial
import pytest

import serial_capture as sc


class FakeClock:
    def __init__(self, step=0.1):
        self.t = 0.0
        self.step = step

    def __call__(self):
        self.t += self.step
        return self.t


class FakeSerial:
    def __init__(self, chunks):
        self.chunks = list(chunks)
        self.in_waiting = 0

    def read(self, n):
        return self.chunks.pop(0) if self.chunks else b""


def test_splits_lines_across_chunks_and_strips_cr():
    ser = FakeSerial([b"[boot] Pro", b"seFire fw=0.0.1\r\n[hb] up", b"time_s=5\r\n"])
    lines, matched = sc.capture(ser, 5, None, clock=FakeClock())
    assert lines == ["[boot] ProseFire fw=0.0.1", "[hb] uptime_s=5"]
    assert matched is False


def test_until_stops_early():
    ser = FakeSerial([b"noise\n", b"[boot] ok\n", b"after\n"])
    lines, matched = sc.capture(ser, 5, r"\[boot\]", clock=FakeClock())
    assert matched is True
    assert lines == ["noise", "[boot] ok"]


def test_hard_timeout_with_no_data():
    clock = FakeClock(step=1.0)
    lines, matched = sc.capture(FakeSerial([]), 3, r"never", clock=clock)
    assert lines == [] and matched is False
    assert clock.t <= 5


def test_garbage_bytes_do_not_crash():
    ser = FakeSerial([b"\xff\xfe\x00rom garbage\n", b"partial-no-newline"])
    lines, _ = sc.capture(ser, 2, None, clock=FakeClock())
    assert len(lines) == 2 and lines[1] == "partial-no-newline"


def test_summary_counts_issues_and_tails():
    lines = [f"line {i}" for i in range(30)] + ["E: upload failed", "warning: low heap"]
    s = sc.summarize(lines, False, None, "logs/x.log")
    assert "lines=32 issues=2" in s and "log=logs/x.log" in s
    assert "line 11" not in s.split("-- last")[1]  # only last 20 lines
    assert "line 29" in s


def test_main_with_loopback_writes_log_and_closes(tmp_path, capsys):
    out = tmp_path / "sub" / "cap.log"
    # loop:// echoes what we write; nothing is written, so this exercises open/timeout/close/write.
    rc = sc.main(["--port", "loop://", "--seconds", "0.3", "--out", str(out)])
    assert rc == 0
    assert out.exists()
    assert "[capture] lines=0" in capsys.readouterr().out


def test_main_until_not_matched_returns_1():
    assert sc.main(["--port", "loop://", "--seconds", "0.2", "--until", "x"]) == 1


def test_main_bad_port_prints_hints(capsys):
    rc = sc.main(["--port", "/dev/does-not-exist-prosefire", "--seconds", "1"])
    assert rc == 2
    assert "DATA USB cable" in capsys.readouterr().err


def test_seconds_required_and_positive():
    with pytest.raises(SystemExit):
        sc.parse_args(["--port", "loop://"])
    with pytest.raises(SystemExit):
        sc.parse_args(["--port", "loop://", "--seconds", "0"])


def test_port_closed_and_partial_log_kept_after_read_error(monkeypatch, tmp_path, capsys):
    closed = {}

    class Boom:
        in_waiting = 0
        dtr = rts = False
        chunks = [b"[boot] ok\n", b"[hb] last words"]

        def read(self, n):
            if self.chunks:
                return self.chunks.pop(0)
            raise serial.SerialException("unplugged")

        def close(self):
            closed["yes"] = True

    monkeypatch.setattr(sc, "open_port", lambda p, b: Boom())
    out = tmp_path / "cap.log"
    sc.main(["--port", "x", "--seconds", "5", "--out", str(out)])
    assert closed.get("yes")
    assert out.read_text().splitlines() == ["[boot] ok", "[hb] last words"]
    assert "lines=2" in capsys.readouterr().out
