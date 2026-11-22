#!/usr/bin/env python3
"""Sign a firmware build and write the OTA manifest that sensors check (OTA = updating sensors over WiFi).

  python3 tools/ota_publish.py --env dev --stage bench --bench esp8266-11001626
  python3 tools/ota_publish.py --env dev --stage canary --canary-percent 10
  python3 tools/ota_publish.py --env dev --stage all

Then deploy Hosting (dev: `firebase deploy --only hosting --project prosefire-dev`; prod: founder only).
Output goes to web/public/fw/ (gitignored; the web build copies it to the site): <name>-<version>.bin.signed and
manifest.json. Rollout order (firmware spec): bench boards -> canary slice -> all. There is no automatic rollback,
so a version reaches "canary" only after it ran on the bench boards.

Signed image format (ESP8266 Arduino core, tools/signing.py + Updater.cpp): firmware.bin, then the RSA signature
of SHA-256(firmware.bin) (PKCS#1 v1.5, `openssl dgst -sha256 -sign`), then the signature length as a 32-bit
little-endian number. The sensor checks it before it will boot the new image.

--unsigned writes an UNSIGNED image (bench stage only), to prove sensors reject it (M9 acceptance).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "public" / "fw"
MAX_IMAGE = 1044464  # max program size of the 4m1m layout (platformio size report)


def fw_version(config_h: Path) -> str:
    m = re.search(r'#define\s+FW_VERSION\s+"(\d+\.\d+\.\d+)"', config_h.read_text())
    if not m:
        raise SystemExit("FW_VERSION not found in firmware/src/config.h")
    return m.group(1)


def sign(data: bytes, private_key: Path) -> bytes:
    sig = subprocess.run(["openssl", "dgst", "-sha256", "-sign", str(private_key)], input=data, check=True,
                         capture_output=True).stdout
    return data + sig + struct.pack("<L", len(sig))


def verify_signed(image: bytes, private_key: Path) -> bool:
    """Checks the image the way the sensor will: split off the signature, verify it with the public key."""
    (n,) = struct.unpack("<L", image[-4:])
    body, sig = image[:-4 - n], image[-4 - n:-4]
    pub = subprocess.run(["openssl", "rsa", "-in", str(private_key), "-pubout"], check=True, capture_output=True).stdout
    with tempfile.TemporaryDirectory() as d:
        (Path(d) / "pub.pem").write_bytes(pub)
        (Path(d) / "sig").write_bytes(sig)
        r = subprocess.run(["openssl", "dgst", "-sha256", "-verify", str(Path(d) / "pub.pem"), "-signature",
                            str(Path(d) / "sig")], input=body, capture_output=True)
    return r.returncode == 0


def build(binary: Path, version: str, key: Path | None, stage: str, canary_percent: int, bench: list[str],
          out: Path, name: str, unsigned: bool = False) -> dict:
    data = binary.read_bytes()
    if not data or data[0] != 0xE9:
        raise SystemExit(f"{binary} doesn't look like an ESP8266 firmware image")
    if version.encode() not in data:
        raise SystemExit(f"{binary} doesn't contain version {version}: rebuild it after changing FW_VERSION")
    if unsigned:
        if stage != "bench":
            raise SystemExit("--unsigned is a bench-only test")
        image, fname = data, f"{name}-{version}-UNSIGNED-test.bin"
    else:
        image = sign(data, key)
        if not verify_signed(image, key):
            raise SystemExit("signature check failed right after signing; nothing written")
        fname = f"{name}-{version}.bin.signed"
    if len(image) > MAX_IMAGE:
        raise SystemExit(f"image is {len(image)} bytes, over the {MAX_IMAGE}-byte limit")
    manifest = {"version": version, "path": f"/fw/{fname}", "size": len(image), "stage": stage,
                "canary_percent": canary_percent, "bench": bench, "sha256": hashlib.sha256(image).hexdigest()}
    out.mkdir(parents=True, exist_ok=True)
    (out / fname).write_bytes(image)
    (out / "manifest.json").write_text(json.dumps(manifest, separators=(",", ":")) + "\n")
    return manifest


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--env", choices=["dev", "release"], required=True, help="which PlatformIO build to publish")
    ap.add_argument("--key", help="private key (default: secrets/ota-<env>-private.pem)")
    ap.add_argument("--stage", choices=["bench", "canary", "all"], required=True)
    ap.add_argument("--canary-percent", type=int, default=0)
    ap.add_argument("--bench", nargs="*", default=[], help="device IDs (esp8266-<chipid>) that get bench builds")
    ap.add_argument("--unsigned", action="store_true", help="bench test: publish an UNSIGNED image")
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args(argv)
    if not 0 <= args.canary_percent <= 100:
        raise SystemExit("--canary-percent must be 0..100")
    if args.stage == "bench" and not args.bench:
        raise SystemExit("--stage bench needs --bench <device IDs>")
    if any(not re.fullmatch(r"esp8266-\d{1,10}", b) for b in args.bench):
        raise SystemExit("--bench takes device IDs like esp8266-11001626")
    key = Path(args.key) if args.key else ROOT / "secrets" / f"ota-{'dev' if args.env == 'dev' else 'release'}-private.pem"
    if args.env == "release" and "dev" in key.name:
        raise SystemExit("refusing to sign a release build with the dev key")
    if not args.unsigned and not key.exists():
        raise SystemExit(f"{key} not found (create it with tools/ota_keys.py {args.env})")
    version = fw_version(ROOT / "firmware" / "src" / "config.h")
    binary = ROOT / "firmware" / ".pio" / "build" / args.env / "firmware.bin"
    m = build(binary, version, None if args.unsigned else key, args.stage, args.canary_percent, args.bench,
              Path(args.out), "prosefire", args.unsigned)
    print(f"Wrote {m['path']} ({m['size']} bytes) and manifest.json: version {m['version']}, stage {m['stage']}"
          + (f" {m['canary_percent']}%" if m["stage"] == "canary" else "")
          + (f", bench {', '.join(m['bench'])}" if m["bench"] else ""))
    print("Next: deploy Hosting so sensors see it (dev: firebase deploy --only hosting --project prosefire-dev).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
