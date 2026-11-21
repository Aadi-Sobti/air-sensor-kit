#!/usr/bin/env python3
"""Release-build guard (run in CI after `pio run -d firmware -e release`).

Fails if the release firmware could contain dev-only behavior:
  1. the resolved [env:release] build_flags (incl. [env] and ${section.option} references) contain a
     DEV_ or FAKE_PMS flag,
  2. a source file compiled into release (firmware/src except src/dev/, firmware/lib) mentions
     setInsecure, http://, or a DEV_ / FAKE_PMS macro,
  3. the built release firmware.bin contains "http://", or firmware.elf's symbols contain setInsecure
     (a flashed .bin carries no symbol names, so the ELF is the only place a linked-in call shows up).
     Both skipped with --no-bin. The ELF check also covers third-party libraries.
Dev-only code must live in firmware/src/dev/, which the release env excludes.
"""
from __future__ import annotations

import argparse
import configparser
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC_FORBIDDEN = re.compile(r"setInsecure|http://|\bDEV_[A-Z0-9_]*|\bFAKE_PMS\b")
FLAG_FORBIDDEN = re.compile(r"DEV_|FAKE_PMS")
BIN_FORBIDDEN = (b"http://",)
ELF_FORBIDDEN = (b"setInsecure",)
REF_RE = re.compile(r"\$\{([^.}]+)\.([^}]+)\}")
SRC_EXTS = {".c", ".cpp", ".h", ".hpp", ".ino"}


def resolved_flags(ini: Path, env: str = "release") -> str:
    """build_flags of [env:<env>] as PlatformIO sees them: [env] base + `extends` + ${sect.opt} expansion."""
    cp = configparser.ConfigParser(interpolation=None, strict=False)
    cp.read(ini)

    def get(section: str, option: str, depth: int = 0) -> str:
        if depth > 10:
            raise ValueError("platformio.ini: reference loop")
        if cp.has_option(section, option):
            raw = cp.get(section, option)
        elif cp.has_option(section, "extends"):
            raw = "\n".join(get(s.strip(), option, depth + 1) for s in cp.get(section, "extends").split(","))
        else:
            raw = ""
        return REF_RE.sub(lambda m: get(m.group(1), m.group(2), depth + 1), raw)

    section = f"env:{env}"
    own = get(section, "build_flags")
    base = get("env", "build_flags") if cp.has_section("env") and section != "env" else ""
    return base + "\n" + own


def check_flags(ini: Path) -> list[str]:
    m = FLAG_FORBIDDEN.search(resolved_flags(ini))
    return [f"{ini}: resolved [env:release] build_flags contain '{m.group(0)}'"] if m else []


def release_sources(fw: Path):
    for base in (fw / "src", fw / "lib"):
        if not base.exists():
            continue
        for p in sorted(base.rglob("*")):
            if p.suffix in SRC_EXTS and (fw / "src" / "dev") not in p.parents:
                yield p


def check_sources(fw: Path) -> list[str]:
    problems = []
    for p in release_sources(fw):
        for n, line in enumerate(p.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            m = SRC_FORBIDDEN.search(line)
            if m:
                problems.append(f"{p.relative_to(fw.parent)}:{n}: '{m.group(0)}' outside src/dev/")
    return problems


def scan_file(path: Path, needles) -> list[str]:
    if not path.exists():
        return [f"{path} not found: build the release env first (pio run -d firmware -e release)"]
    data = path.read_bytes()
    return [f"{path}: contains {s.decode()!r}" for s in needles if s in data]


def check_bin(build_dir: Path) -> list[str]:
    return scan_file(build_dir / "firmware.bin", BIN_FORBIDDEN) + \
        scan_file(build_dir / "firmware.elf", ELF_FORBIDDEN)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--firmware-dir", default=str(ROOT / "firmware"))
    ap.add_argument("--no-bin", action="store_true", help="skip the built-binary check")
    args = ap.parse_args(argv)
    fw = Path(args.firmware_dir)
    problems = check_flags(fw / "platformio.ini") + check_sources(fw)
    if not args.no_bin:
        problems += check_bin(fw / ".pio" / "build" / "release")
    if problems:
        print("[release-guard] FAIL")
        for p in problems:
            print("  " + p)
        return 1
    print("[release-guard] OK: no DEV_/FAKE_PMS flags, setInsecure, or http:// in the release build")
    return 0


if __name__ == "__main__":
    sys.exit(main())
