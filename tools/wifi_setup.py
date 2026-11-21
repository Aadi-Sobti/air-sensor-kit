#!/usr/bin/env python3
"""Give the sensor your WiFi over USB (Improv Wi-Fi). Run it in YOUR terminal: the password is typed hidden and
goes only to the sensor (never printed, logged, or saved on this computer).

  python3 tools/wifi_setup.py --port /dev/cu.usbserial-XXXX          # pick from the networks it sees
  python3 tools/wifi_setup.py --port /dev/cu.usbserial-XXXX --info   # just show what's connected

The sensor tests the password before saving it. If it doesn't work, nothing changes on the sensor.
The ESP8266 only sees 2.4 GHz WiFi.
"""
from __future__ import annotations

import argparse
import getpass
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _venv  # noqa: E402

_venv.ensure("serial")
import serial  # noqa: E402

import improv  # noqa: E402


def wait_for(ser, parser, want, seconds):
    """Collect frames until want(type, data) returns a value or time runs out."""
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        for ftype, data in parser.feed(ser.read(ser.in_waiting or 1)):
            v = want(ftype, data)
            if v is not None:
                return v
    return None


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", required=True)
    ap.add_argument("--info", action="store_true", help="only show device info and state")
    args = ap.parse_args(argv)

    ser = serial.serial_for_url(args.port, baudrate=115200, timeout=0.2, do_not_open=True)
    ser.dtr = False
    ser.rts = False
    try:
        ser.open()
    except serial.SerialException as e:
        print(f"Couldn't open {args.port}: {e}\nClose other programs using the sensor (Arduino IDE, Chrome), "
              "check it's a data cable, then try again.")
        return 2
    try:
        parser = improv.Parser(on_log=lambda line: print("   sensor: " + line))
        time.sleep(2.5)  # opening the port may reboot the sensor; give it a moment
        ser.reset_input_buffer()
        info = None
        for _ in range(3):
            ser.write(improv.rpc(improv.GET_INFO))
            info = wait_for(ser, parser, lambda t, d: improv.parse_strings(d)
                            if t == improv.T_RESULT and d and d[0] == improv.GET_INFO else None, 3)
            if info:
                break
        if not info:
            print("The sensor didn't answer. Is the new firmware on it? Unplug and replug, then try again.")
            return 1
        print(f"Found: {info[0]} firmware {info[1]} ({info[3].strip()})")
        ser.write(improv.rpc(improv.GET_STATE))
        state = wait_for(ser, parser, lambda t, d: improv.STATES.get(d[0], "?") if t == improv.T_STATE else None, 3)
        print(f"WiFi: {'connected' if state == 'provisioned' else 'not connected'}")
        if args.info:
            return 0

        print("Looking for WiFi networks (2.4 GHz)...")
        ser.write(improv.rpc(improv.GET_NETWORKS))
        nets: list[list[str]] = []

        def collect(t, d):
            if t == improv.T_RESULT and d and d[0] == improv.GET_NETWORKS:
                s = improv.parse_strings(d)
                if not s:
                    return True
                nets.append(s)
            return None

        wait_for(ser, parser, collect, 15)
        for i, n in enumerate(nets, 1):
            bars = "▂▄▆█"[: max(1, min(4, (int(n[1]) + 100) // 12))]
            print(f"  {i:2}. {n[0]:32} {bars}{'' if n[2] == 'YES' else '  (open)'}")
        choice = input("Type the number of your WiFi, or type its name: ").strip()
        ssid = nets[int(choice) - 1][0] if choice.isdigit() and 0 < int(choice) <= len(nets) else choice
        if not ssid:
            print("No WiFi chosen.")
            return 1
        password = getpass.getpass(f"Password for {ssid} (hidden as you type): ")
        ser.write(improv.wifi_settings(ssid, password))
        password = ""  # drop our copy
        print("Sending to the sensor and testing the connection (up to 35 s)...")

        def result(t, d):
            if t == improv.T_ERROR and d and d[0] == 0x03:
                return ("fail", "")
            if t == improv.T_RESULT and d and d[0] == improv.WIFI_SETTINGS:
                s = improv.parse_strings(d)
                return ("ok", s[0] if s else "")
            return None

        r = wait_for(ser, parser, result, 40)
        if r and r[0] == "ok":
            print("Connected! The sensor saved your WiFi.")
            return 0
        if r and r[0] == "fail":
            print("That password didn't work, or the network isn't 2.4 GHz. Nothing was changed. Try again.")
        else:
            print("No answer in time. Check the sensor is near the router, then try again.")
        return 1
    finally:
        ser.close()


if __name__ == "__main__":
    sys.exit(main())
