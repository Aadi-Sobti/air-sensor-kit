#!/usr/bin/env python3
"""Simulate N registered sensors sending correctly signed uploads (backend testing without hardware).

Runs against the local Firebase emulator (needs `firebase emulators:exec` / `:start` with functions+firestore).
`--target dev` is refused until the dev project exists (M4, founder step).

  python3 tools/device_sim.py --devices 5 --minutes 2 --target emulator
  python3 tools/device_sim.py --devices 3 --minutes 30 --scenario all --target emulator

Scenarios (each checks the HTTP status the backend must return):
  normal         clean air, one upload per 2.5 min of simulated time            -> 200
  smoke          PM2.5 ramps to ~250 ug/m3                                       -> 200
  stuck          identical readings every time (stuck sensor; QC flags it later) -> 200
  bad_signature  signed with the wrong key                                       -> 401
  replay         a captured upload sent again with an old timestamp              -> 401
  skew           device clock 20 min fast                                        -> 401
  burst          a backlog of readings after an outage, sent at once (array)     -> 200
"""
from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import math
import os
import random
import secrets
import sys
import time
import urllib.error
import urllib.request

PROJECT = os.environ.get("GCLOUD_PROJECT", "demo-prosefire")
REGION = "us-east1"
UPLOAD_EVERY_S = 150  # provisional decision #6
SCENARIOS = ["normal", "smoke", "stuck", "bad_signature", "replay", "skew", "burst"]


def emulator_urls(project: str) -> tuple[str, str]:
    fs_host = os.environ.get("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8080")
    fn_host = os.environ.get("FUNCTIONS_EMULATOR_HOST", "127.0.0.1:5001")
    return (f"http://{fs_host}/v1/projects/{project}/databases/(default)/documents",
            f"http://{fn_host}/{project}/{REGION}/ingest")


def http(method: str, url: str, body: bytes | None = None, headers: dict | None = None) -> tuple[int, dict]:
    req = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except ValueError:
            return e.code, {}


def register(fs_base: str, device_id: str) -> None:
    """Factory allowlist via the emulator's admin bypass (the real path is factory/register, M9)."""
    doc = {"fields": {"status": {"stringValue": "allowlisted"}, "batch": {"stringValue": "device_sim"}}}
    code, _ = http("PATCH", f"{fs_base}/devices/{device_id}", json.dumps(doc).encode(),
                   {"Authorization": "Bearer owner", "Content-Type": "application/json"})
    if code != 200:
        raise SystemExit(f"could not register {device_id} in the Firestore emulator (HTTP {code}). Is it running?")


def reading(ts: int, pm25: float, rng: random.Random, stuck: bool = False) -> dict:
    v = round(pm25) if stuck else max(0, round(pm25 + rng.uniform(-1.5, 1.5)))
    c03 = min(65535, int(150 * v + 200))
    return {"ts": ts, "n": 60, "pm1_cf1": int(v * 2 / 3), "pm25_cf1": v, "pm10_cf1": int(v * 1.25 + 1),
            "pm1_atm": int(v * 2 / 3), "pm25_atm": v if v <= 30 else int(30 + (v - 30) * 2 / 3),
            "pm10_atm": int(v * 1.25 + 1), "counts": [c03, c03 // 3, c03 // 12, c03 // 80, c03 // 400, c03 // 1500],
            "pm25_cf1_min": max(0, v - 2), "pm25_cf1_max": v + 3}


def signed(device_id: str, secret: str, body: dict, ts: int, enroll: bool) -> tuple[bytes, dict]:
    raw = json.dumps(body, separators=(",", ":")).encode()
    sig = hmac.new(bytes.fromhex(secret), str(ts).encode() + raw, hashlib.sha256).hexdigest()
    h = {"Content-Type": "application/json", "X-Device-Id": device_id, "X-Timestamp": str(ts), "X-Signature": sig}
    if enroll:
        h["X-Enroll-Secret"] = secret
    return raw, h


def run_device(i: int, scenario: str, minutes: float, fs_base: str, ingest: str, rng: random.Random) -> list[str]:
    # Fresh random ID per run: re-using an enrolled ID with a new secret is (correctly) rejected by the backend.
    device_id = f"esp8266-{1_000_000_000 + secrets.randbelow(3_000_000_000)}"
    secret = secrets.token_hex(32)
    register(fs_base, device_id)
    now = int(time.time())
    problems: list[str] = []

    def send(readings: list[dict], ts: int | None = None, key: str | None = None, enroll: bool = False,
             expect: int = 200) -> tuple[int, dict, bytes, dict]:
        body = {"fw": "sim-0.1", "uptime_s": 100 + i, "rssi": -60, "readings": readings, "errors": {"csum_err": 0}}
        raw, h = signed(device_id, key or secret, body, ts if ts is not None else int(time.time()), enroll)
        code, resp = http("POST", ingest, raw, h)
        if code != expect:
            problems.append(f"{device_id} {scenario}: expected {expect}, got {code} {resp}")
        return code, resp, raw, h

    # Enroll with one fresh reading.
    send([reading(now - 5, 8, rng)], enroll=True)
    n_uploads = max(1, int(minutes * 60 // UPLOAD_EVERY_S))
    times = [now - (n_uploads - k) * UPLOAD_EVERY_S for k in range(n_uploads)]  # simulated past, oldest first
    times = [t for t in times if t < now - 5]
    if scenario in ("normal", "smoke", "stuck"):
        for k, t in enumerate(times[-55:]):  # stay under the 60/hour limit (enroll used 1)
            if scenario == "smoke":
                pm = 8 + 240 * math.exp(-((k - len(times) / 2) ** 2) / max(1, len(times) / 4))
            else:
                pm = 8 + 3 * math.sin(k / 5)
            send([reading(t, pm, rng, stuck=scenario == "stuck")])
    elif scenario == "bad_signature":
        send([reading(now - 3, 8, rng)], key=secrets.token_hex(32), expect=401)
    elif scenario == "replay":
        code, _, raw, h = send([reading(now - 4, 8, rng)])
        h = dict(h)
        old = int(h["X-Timestamp"]) - 11 * 60
        h["X-Timestamp"] = str(old)
        h["X-Signature"] = hmac.new(bytes.fromhex(secret), str(old).encode() + raw, hashlib.sha256).hexdigest()
        c2, resp = http("POST", ingest, raw, h)
        if c2 != 401:
            problems.append(f"{device_id} replay: expected 401, got {c2} {resp}")
    elif scenario == "skew":
        send([reading(now - 3, 8, rng)], ts=int(time.time()) + 20 * 60, expect=401)
    elif scenario == "burst":
        backlog = [reading(t, 9, rng) for t in times[-50:]] or [reading(now - 3, 9, rng)]
        code, resp, _, _ = send(backlog)
        if code == 200 and resp.get("accepted") != len(backlog):
            problems.append(f"{device_id} burst: accepted {resp.get('accepted')} of {len(backlog)}")
    return problems


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--devices", type=int, default=5)
    ap.add_argument("--minutes", type=float, default=2, help="simulated time span of readings per device")
    ap.add_argument("--target", choices=["emulator", "dev"], default="emulator")
    ap.add_argument("--scenario", choices=SCENARIOS + ["all"], default="normal")
    ap.add_argument("--seed", type=int, default=1)
    args = ap.parse_args(argv)
    if args.target != "emulator":
        print("[sim] --target dev is not available yet: the dev Firebase project is created in M4 (founder step).")
        return 2
    fs_base, ingest = emulator_urls(PROJECT)
    rng = random.Random(args.seed)
    scenarios = SCENARIOS if args.scenario == "all" else [args.scenario]
    problems: list[str] = []
    runs = 0
    for i in range(args.devices):
        for sc in scenarios:
            problems += run_device(i, sc, args.minutes, fs_base, ingest, rng)
            runs += 1
    print(f"[sim] devices={args.devices} scenarios={','.join(scenarios)} runs={runs} problems={len(problems)}")
    for p in problems[:20]:
        print("  " + p)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
