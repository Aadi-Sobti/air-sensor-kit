#!/usr/bin/env python3
"""Packing-laptop tool: get a bare WiFi board ready for a kit in about 2 minutes (M9; docs/USER_FLOW.md "Volunteer").

  python3 tools/provision.py                 # every board plugged in (one worker per USB port)
  python3 tools/provision.py --port /dev/cu.usbserial-XXXX
  python3 tools/provision.py --port ... --no-flash   # reprint: same board, NEW owner code (the old one stops working)

Per board: detect it (USB chips CH340 0x1A86, FTDI 0x0403, CP210x 0x10C4) -> check the flash size -> erase + flash the
firmware (esptool) -> read its chip ID + setup WiFi password over USB -> register it (POST /api/v1/factory/register
with this laptop's station key) -> send the short code to the board and confirm it after the restart -> write the
two labels (SETUP + OWNER) as a PDF -> log one CSV line. A label is never made for a board whose registration or
confirmation failed. Green "DONE" = pack it; red "SET ASIDE" = put the board aside.

Never logged or printed: the setup password, the owner code, the station key (they're only on the label PDF; print
it, then delete it). The CSV log has chip ID, short code, firmware version, time, and OK/FAIL.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import re
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _venv  # noqa: E402

_venv.ensure("serial")
import serial  # noqa: E402
import serial.tools.list_ports  # noqa: E402

import labels  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "tools" / "out"
USB_VIDS = {0x1A86: "CH340", 0x0403: "FTDI", 0x10C4: "CP210x"}
MIN_FLASH_MB = 4  # the firmware's 4m1m layout (platformio.ini)
GREEN, RED, RESET = "\033[1;32m", "\033[1;31m", "\033[0m"

BOOT_RE = re.compile(r"\[boot\] \S+ fw=(\d+\.\d+\.\d+) env=(\w+) id=(esp8266-\d+)")
IDENTITY_RE = re.compile(r"\[identity\] (\w+) short_code=(\S+)")
SETUPINFO_RE = re.compile(r"\[setupinfo\] ap_ssid=(\S+) ap_password=(\S+)\r?\n")  # full line only (see setup_info.py)
SAVED_RE = re.compile(r"\[factory\] short_code=([A-Z0-9]{6}) saved=([01])")


class Fail(Exception):
    """A step failed: the board is set aside and nothing is printed."""


@dataclass
class Result:
    port: str
    ok: bool = False
    device_id: str = ""
    short_code: str = ""
    fw: str = ""
    reason: str = ""
    label: Path | None = None
    steps: list[str] = field(default_factory=list)


def config_value(name: str) -> str:
    m = re.search(rf'#define\s+{name}\s+"([^"]+)"', (ROOT / "firmware/src/config.h").read_text())
    if not m:
        raise SystemExit(f"{name} not found in firmware/src/config.h")
    return m.group(1)


def find_ports() -> list[tuple[str, str]]:
    return [(p.device, USB_VIDS[p.vid]) for p in serial.tools.list_ports.comports() if p.vid in USB_VIDS]


# ---- Steps that touch hardware or the network (replaced by fakes in tests) ----

def esptool(port: str, *args: str, timeout: float = 180) -> str:
    cmd = [sys.executable, "-m", "esptool", "--chip", "esp8266", "--port", port, "--baud", "115200", *args]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        tail = (r.stdout + r.stderr).strip().splitlines()[-3:]
        raise Fail("flashing tool failed: " + " | ".join(tail) +
                   " (check the cable is a data cable and no other program uses the port)")
    return r.stdout


def flash_size_mb(port: str) -> int:
    out = esptool(port, "flash-id", timeout=60)
    m = re.search(r"Detected flash size:\s*(\d+)\s*MB", out)
    if not m:
        raise Fail("couldn't read the flash size")
    return int(m.group(1))


def flash(port: str, firmware: Path) -> None:
    esptool(port, "erase-flash")  # fresh identity: new secret + setup password on first boot
    esptool(port, "write-flash", "0x0", str(firmware))  # esptool verifies what it wrote


class SerialBoard:
    """Line protocol with the firmware over USB (firmware rules "Identity and factory mode")."""

    def __init__(self, port: str):
        self.s = serial.serial_for_url(port, baudrate=115200, timeout=0.2, do_not_open=True)
        self.s.dtr = False
        self.s.rts = False
        self.s.open()
        self.buf = ""

    def close(self) -> None:
        self.s.close()

    def reset(self) -> None:
        self.s.rts = True  # EN low (NodeMCU auto-reset circuit), GPIO0 high = normal boot
        time.sleep(0.15)
        self.s.rts = False
        self.buf = ""

    def send(self, line: str) -> None:
        self.s.write(b"\n" + line.encode() + b"\n")  # leading newline: junk bytes can't spoil the command
        self.s.flush()

    def wait(self, pattern: re.Pattern, seconds: float, resend: str | None = None) -> re.Match:
        end = time.monotonic() + seconds
        next_send = time.monotonic()
        while time.monotonic() < end:
            if resend and time.monotonic() >= next_send:
                self.send(resend)
                next_send = time.monotonic() + 3
            self.buf += self.s.read(self.s.in_waiting or 1).decode("utf-8", "replace")
            m = pattern.search(self.buf)
            if m:
                self.buf = self.buf[m.end():]
                return m
        raise Fail(f"no answer from the board ({pattern.pattern[:30]}...)")


def register(site: str, key: str, device_id: str, fw: str, timeout: float = 30) -> dict:
    req = urllib.request.Request(f"{site.rstrip('/')}/api/v1/factory/register", method="POST",
                                 data=json.dumps({"deviceId": device_id, "fw": fw}).encode(),
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:
            err = json.loads(e.read()).get("error", "")
        except Exception:  # noqa: BLE001
            err = ""
        hints = {"bad_station_key": "this laptop's station key isn't accepted (ask the founder)",
                 "already_in_use": "this board was already used in the field (ask the founder)",
                 "owner_data_present": "this board still has its previous owner's data (ask the founder)"}
        raise Fail(f"registration refused (HTTP {e.code} {err}): {hints.get(err, 'try again')}") from None
    except (urllib.error.URLError, TimeoutError) as e:
        raise Fail(f"couldn't reach the server ({e}); check the internet and try again") from None
    if not body.get("ok") or not re.fullmatch(r"[A-Z0-9]{6}", str(body.get("shortCode", ""))):
        raise Fail("unexpected answer from the server")
    return body


# ---- The flow ----

def provision(port: str, *, firmware: Path | None, site: str, key: str, row: int, out: Path,
              board_factory=SerialBoard, flash_fn=flash, size_fn=flash_size_mb, register_fn=register,
              say=print) -> Result:
    res = Result(port=port)
    board = None
    try:
        if firmware:
            say(f"[{port}] checking the board")
            if size_fn(port) < MIN_FLASH_MB:
                raise Fail(f"flash is smaller than {MIN_FLASH_MB} MB (wrong board type)")
            say(f"[{port}] flashing (about 1 minute)")
            flash_fn(port, firmware)
            res.steps.append("flashed")
        board = board_factory(port)
        board.reset()
        boot = board.wait(BOOT_RE, 25)
        res.fw, env, res.device_id = boot.group(1), boot.group(2), boot.group(3)
        board.wait(IDENTITY_RE, 25)
        board.wait(SETUPINFO_RE, 15, resend="PFCMD SETUPINFO")  # proves the factory command channel works
        say(f"[{port}] registering {res.device_id} (fw {res.fw}, {env})")
        reg = register_fn(site, key, res.device_id, res.fw)
        res.short_code, owner_code = reg["shortCode"], reg["ownerCode"]
        res.steps.append("registered")
        board.send(f"PFCMD SETCODE {res.short_code}")
        saved = board.wait(SAVED_RE, 10)
        if saved.group(1) != res.short_code or saved.group(2) != "1":
            raise Fail("the board couldn't save its code")
        # Confirm from the restart: the code must come back from the board's own storage.
        board.wait(BOOT_RE, 25)
        ident = board.wait(IDENTITY_RE, 25)
        if ident.group(2) != res.short_code:
            raise Fail(f"the board reports code {ident.group(2)} after restart, expected {res.short_code}")
        info = board.wait(SETUPINFO_RE, 15, resend="PFCMD SETUPINFO")
        ssid, password = info.group(1), info.group(2)
        if not ssid.endswith(res.short_code):
            raise Fail("the setup WiFi name doesn't include the new code")
        res.steps.append("confirmed")
        kit = labels.Kit(short_code=res.short_code, ap_ssid=ssid, ap_password=password, owner_code=owner_code, site=site)
        out.mkdir(parents=True, exist_ok=True)
        res.label = out / f"labels-{res.short_code}.pdf"
        res.label.write_bytes(labels.kit_pdf(kit, row=row))
        res.ok = True
    except Fail as e:
        res.reason = str(e)
    except serial.SerialException as e:
        res.reason = f"USB port problem ({e}); close other programs using it, or try another cable"
    finally:
        if board:
            board.close()
    return res


def log_csv(path: Path, r: Result) -> None:
    new = not path.exists()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", newline="") as f:
        w = csv.writer(f)
        if new:
            w.writerow(["time_utc", "port", "device_id", "short_code", "fw", "result", "reason"])
        w.writerow([dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), r.port, r.device_id,
                    r.short_code, r.fw, "OK" if r.ok else "FAIL", r.reason])


def default_key() -> Path | None:
    keys = sorted((ROOT / "secrets").glob("factory-*.key"))
    return keys[0] if len(keys) == 1 else None


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", action="append", help="USB port (repeat for several); default: every board found")
    ap.add_argument("--env", choices=["release", "dev"], default="release", help="which firmware build to flash")
    ap.add_argument("--firmware", help="firmware .bin to flash (default: the --env build)")
    ap.add_argument("--no-flash", action="store_true", help="skip flashing (reprint labels with a new owner code)")
    ap.add_argument("--key", help="station key file (default: the only secrets/factory-*.key)")
    ap.add_argument("--site", default=None, help="website (default: SITE_URL in firmware/src/config.h)")
    ap.add_argument("--row", type=int, default=1, help="sticker-sheet row to print on (1-5)")
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args(argv)

    key_path = Path(args.key) if args.key else default_key()
    if not key_path or not key_path.exists():
        print("No station key found. The founder makes one with: python3 tools/factory_station.py new <laptop-name>")
        return 2
    key = key_path.read_text().strip()
    site = args.site or config_value("SITE_URL")
    firmware = None
    if not args.no_flash:
        firmware = Path(args.firmware) if args.firmware else ROOT / "firmware" / ".pio" / "build" / args.env / "firmware.bin"
        if not firmware.exists():
            print(f"Firmware not found: {firmware}. Build it first: pio run -d firmware -e {args.env}")
            return 2
    ports = args.port or [p for p, _ in find_ports()]
    if not ports:
        print("No board found. Use a data cable (some cables only charge) and check the board's light is on.")
        return 2
    out = Path(args.out)
    lock = threading.Lock()

    def say(msg: str) -> None:
        with lock:
            print(msg, flush=True)

    results: list[Result] = []

    def work(port: str, row: int) -> None:
        r = provision(port, firmware=firmware, site=site, key=key, row=row, out=out, say=say)
        with lock:
            results.append(r)
            log_csv(out / "provision-log.csv", r)
            if r.ok:
                print(f"{GREEN}DONE {port}: sensor {r.short_code} ({r.device_id}). Print {r.label}, stick both labels "
                      f"on this kit's card, then delete the PDF.{RESET}", flush=True)
            else:
                print(f"{RED}SET ASIDE {port}: {r.reason}{RESET}", flush=True)

    threads = [threading.Thread(target=work, args=(p, min(5, args.row + i))) for i, p in enumerate(ports)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return 0 if results and all(r.ok for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
