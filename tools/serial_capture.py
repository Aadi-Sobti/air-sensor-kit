#!/usr/bin/env python3
"""Capture serial output from the board for a fixed time, then exit. The agent's only way to read device logs.

Always exits (hard --seconds limit) and always closes the port. Prints a short summary, not the full log.

  python3 tools/serial_capture.py --port /dev/cu.usbserial-XXXX --seconds 30 --out logs/serial-123.log
  python3 tools/serial_capture.py --port <port> --seconds 20 --reset --until "\\[boot\\]"
"""
from __future__ import annotations

import argparse
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _venv  # noqa: E402

_venv.ensure("serial")
import serial  # noqa: E402

ISSUE_RE = re.compile(r"\b(error|err|warn|warning|fail|failed|exception|panic|wdt|abort)\b", re.I)
TAIL_LINES = 20

PORT_HINTS = """Hints:
  - No port / not found: use a DATA USB cable (many are charge-only); check `pio device list`.
  - Busy / permission denied: close Arduino IDE, another capture, or a Chrome tab using the sensor, then retry.
  - Missing driver: CH340 boards may need the WCH driver; FTDI and CP210x usually work out of the box on macOS."""


def parse_args(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--port", required=True, help="serial port, or a pyserial URL such as loop://")
    p.add_argument("--baud", type=int, default=115200)
    p.add_argument("--seconds", type=float, required=True, help="hard stop after this many seconds")
    p.add_argument("--out", help="write the full log here (parent dirs are created)")
    p.add_argument("--reset", action="store_true", help="reboot the board via DTR/RTS before capturing")
    p.add_argument("--until", help="stop early when a line matches this regex")
    args = p.parse_args(argv)
    if args.seconds <= 0:
        p.error("--seconds must be > 0")
    return args


def reset_board(ser) -> None:
    """NodeMCU auto-reset circuit: RTS low pulls EN (reset); DTR high keeps GPIO0 high (normal boot)."""
    ser.dtr = False
    ser.rts = True
    time.sleep(0.1)
    ser.rts = False
    ser.dtr = False


def capture(ser, seconds: float, until: str | None, clock=time.monotonic, lines: list[str] | None = None):
    """Read lines from an open serial object until timeout or a match. Returns (lines, matched).

    Lines are appended to `lines` as they arrive, so a caller that passes its own list keeps everything
    captured before a read error or Ctrl-C (exactly the lines needed to debug the failure).
    """
    until_re = re.compile(until) if until else None
    deadline = clock() + seconds
    if lines is None:
        lines = []
    buf = b""
    try:
        while clock() < deadline:
            chunk = ser.read(ser.in_waiting or 1)
            if not chunk:
                continue
            buf += chunk
            while b"\n" in buf:
                raw, buf = buf.split(b"\n", 1)
                line = raw.decode("utf-8", errors="replace").rstrip("\r")
                lines.append(line)
                if until_re and until_re.search(line):
                    return lines, True
    finally:
        if buf:
            lines.append(buf.decode("utf-8", errors="replace").rstrip("\r"))
    return lines, False


def summarize(lines: list[str], matched: bool, until: str | None, out: str | None) -> str:
    issues = [l for l in lines if ISSUE_RE.search(l)]
    parts = [f"lines={len(lines)} issues={len(issues)}"]
    if until:
        parts.append(f"until_matched={'yes' if matched else 'no'}")
    if out:
        parts.append(f"log={out}")
    report = ["[capture] " + " ".join(parts)]
    if issues:
        report.append("-- issue lines (first 10) --")
        report.extend(issues[:10])
    report.append(f"-- last {min(TAIL_LINES, len(lines))} lines --")
    report.extend(lines[-TAIL_LINES:])
    return "\n".join(report)


def open_port(port: str, baud: int):
    # Open without toggling DTR/RTS (opening can otherwise reset the board unintentionally).
    ser = serial.serial_for_url(port, baudrate=baud, timeout=0.2, do_not_open=True)
    try:
        ser.dtr = False
        ser.rts = False
    except (AttributeError, NotImplementedError, ValueError):
        pass
    ser.open()
    return ser


def main(argv=None) -> int:
    args = parse_args(argv)
    try:
        ser = open_port(args.port, args.baud)
    except (serial.SerialException, OSError) as e:
        print(f"[capture] could not open {args.port}: {e}\n{PORT_HINTS}", file=sys.stderr)
        return 2
    lines: list[str] = []
    matched = False
    try:
        if args.reset:
            reset_board(ser)
        _, matched = capture(ser, args.seconds, args.until, lines=lines)
    except KeyboardInterrupt:
        pass
    except (serial.SerialException, OSError) as e:
        print(f"[capture] read error on {args.port}: {e}\n{PORT_HINTS}", file=sys.stderr)
    finally:
        ser.close()
    if args.out:
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
    print(summarize(lines, matched, args.until, args.out))
    if args.until and not matched:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
