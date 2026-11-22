#!/usr/bin/env python3
"""Packing-laptop ("station") keys for factory registration (founder decision 2026-11-22).

  python3 tools/factory_station.py new bench-laptop     # makes secrets/factory-bench-laptop.key
  python3 tools/factory_station.py revoke bench-laptop  # removes it from the list
  python3 tools/factory_station.py list

Each packing laptop gets one long random key file (copy it to that laptop's secrets/ folder; never commit or share
it). The backend only knows SHA-256 hashes, kept in secrets/factory-key-hashes.txt and uploaded to the
FACTORY_KEY_HASHES secret. After new/revoke, upload the list and redeploy the function:

  firebase functions:secrets:set FACTORY_KEY_HASHES --data-file ../secrets/factory-key-hashes.txt --project <project>
  firebase deploy --only functions:factory --project <project>
"""
from __future__ import annotations

import argparse
import hashlib
import os
import re
import secrets
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SECRETS = ROOT / "secrets"
HASHES = SECRETS / "factory-key-hashes.txt"
NAME_RE = re.compile(r"[a-z0-9_-]{1,40}")


def key_hash(key: str) -> str:
    """Must match backend/functions/src/factory.ts stationKeyHash."""
    return hashlib.sha256(f"factory-station:v1:{key}".encode()).hexdigest()


def read_list(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if path.exists():
        for line in path.read_text().splitlines():
            parts = line.split()
            if len(parts) == 2:
                out[parts[0]] = parts[1]
    return out


def write_private(path: Path, text: str) -> None:
    old = os.umask(0o077)
    try:
        path.write_text(text)
    finally:
        os.umask(old)
    path.chmod(0o600)


def main(argv=None, secrets_dir: Path = SECRETS) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("action", choices=["new", "revoke", "list"])
    ap.add_argument("name", nargs="?")
    args = ap.parse_args(argv)
    hashes_file = secrets_dir / HASHES.name
    stations = read_list(hashes_file)
    if args.action == "list":
        print("\n".join(sorted(stations)) or "(no stations)")
        return 0
    if not args.name or not NAME_RE.fullmatch(args.name):
        print("Give a station name: lower-case letters, digits, - or _ (e.g. bench-laptop).")
        return 2
    secrets_dir.mkdir(exist_ok=True)
    keyfile = secrets_dir / f"factory-{args.name}.key"
    if args.action == "new":
        if args.name in stations or keyfile.exists():
            print(f"Station {args.name} already exists. Revoke it first to replace its key.")
            return 1
        key = secrets.token_hex(32)
        write_private(keyfile, key + "\n")
        stations[args.name] = key_hash(key)
        print(f"Created {keyfile.relative_to(secrets_dir.parent)} (copy it to that laptop; never share it).")
    else:
        if args.name not in stations:
            print(f"No station named {args.name}.")
            return 1
        del stations[args.name]
        keyfile.unlink(missing_ok=True)
        print(f"Revoked {args.name}.")
    write_private(hashes_file, "".join(f"{n} {h}\n" for n, h in sorted(stations.items())))
    print("Now upload the list and redeploy (see the top of this file).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
