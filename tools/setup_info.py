#!/usr/bin/env python3
"""Show the sensor's phone-setup WiFi name and password (until per-device QR stickers exist, M9).

Run it in YOUR terminal: the password is printed here only, never saved or logged by the project.
The sensor answers only within 60 s after it starts (or while it has no factory short code), so the tool
asks right after opening the port (which restarts the board).

  python3 tools/setup_info.py --port /dev/cu.usbserial-XXXX
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

LINE_RE = re.compile(r"\[setupinfo\] ap_ssid=(.+?) ap_password=(\S+)")


def wifi_qr_payload(ssid: str, password: str) -> str:
    """Standard WiFi QR text. Escape \\ ; , : " in SSID and password (tools spec)."""
    special = set('\\;,:"')
    esc = lambda s: "".join('\\' + c if c in special else c for c in s)  # noqa: E731
    return f"WIFI:T:WPA;S:{esc(ssid)};P:{esc(password)};;"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", required=True)
    args = ap.parse_args(argv)
    ser = serial.serial_for_url(args.port, baudrate=115200, timeout=0.2, do_not_open=True)
    ser.dtr = False
    ser.rts = False
    try:
        ser.open()
    except serial.SerialException as e:
        print(f"Couldn't open {args.port}: {e}\nClose other programs using the sensor, then try again.")
        return 2
    try:
        buf = b""
        end = time.monotonic() + 20
        next_ask = time.monotonic() + 3  # let it boot (opening the port may restart it)
        while time.monotonic() < end:
            if time.monotonic() >= next_ask:
                ser.write(b"PFCMD SETUPINFO\n")
                next_ask = time.monotonic() + 3
            buf += ser.read(ser.in_waiting or 1)
            text = buf.decode("utf-8", "replace")
            m = LINE_RE.search(text)
            if m:
                ssid, pw = m.group(1), m.group(2)
                print(f"Phone setup WiFi:  {ssid}\nPassword:          {pw}")
                print(f"(QR text for a label maker: {wifi_qr_payload(ssid, pw)})")
                print("On the phone: WiFi settings -> join that network -> type the password. The setup page opens.")
                return 0
            if "[setupinfo] not available" in text:
                print("The sensor only shares this right after it starts. Unplug it, plug it back in, and run this again.")
                return 1
        print("No answer. Is firmware 0.5.0 or newer on the sensor? Unplug and replug, then try again.")
        return 1
    finally:
        ser.close()


if __name__ == "__main__":
    sys.exit(main())
