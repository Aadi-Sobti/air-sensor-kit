import json
import struct
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import ota_keys  # noqa: E402
import ota_publish as op  # noqa: E402


@pytest.fixture(scope="module")
def key(tmp_path_factory):
    k = tmp_path_factory.mktemp("k") / "test-private.pem"
    subprocess.run(["openssl", "genrsa", "-out", str(k), "2048"], check=True, capture_output=True)
    return k


def fake_bin(tmp_path, version="0.7.1"):
    b = tmp_path / "firmware.bin"
    b.write_bytes(b"\xe9" + b"\x00" * 100 + f"fw={version}".encode() + b"\x11" * 1000)
    return b


def test_signed_image_layout_and_manifest(tmp_path, key):
    out = tmp_path / "out"
    m = op.build(fake_bin(tmp_path), "0.7.1", key, "bench", 0, ["esp8266-11001626"], out, "prosefire")
    img = (out / "prosefire-0.7.1.bin.signed").read_bytes()
    raw = fake_bin(tmp_path).read_bytes()
    (n,) = struct.unpack("<L", img[-4:])
    assert n == 256  # RSA-2048
    assert img[:len(raw)] == raw and len(img) == len(raw) + 256 + 4
    assert op.verify_signed(img, key)
    tampered = bytearray(img)
    tampered[50] ^= 1
    assert not op.verify_signed(bytes(tampered), key)
    man = json.loads((out / "manifest.json").read_text())
    assert man == m
    assert man["path"] == "/fw/prosefire-0.7.1.bin.signed" and man["size"] == len(img)
    assert man["stage"] == "bench" and man["bench"] == ["esp8266-11001626"]


def test_refuses_wrong_version_or_not_firmware(tmp_path, key):
    with pytest.raises(SystemExit):
        op.build(fake_bin(tmp_path, "0.7.0"), "0.7.1", key, "all", 0, [], tmp_path / "o", "p")
    bad = tmp_path / "bad.bin"
    bad.write_bytes(b"MZ not esp 0.7.1")
    with pytest.raises(SystemExit):
        op.build(bad, "0.7.1", key, "all", 0, [], tmp_path / "o", "p")


def test_unsigned_only_on_bench(tmp_path):
    m = op.build(fake_bin(tmp_path), "0.7.1", None, "bench", 0, ["esp8266-1"], tmp_path / "o", "p", unsigned=True)
    assert "UNSIGNED" in m["path"]
    with pytest.raises(SystemExit):
        op.build(fake_bin(tmp_path), "0.7.1", None, "all", 0, [], tmp_path / "o2", "p", unsigned=True)


def test_cli_guards(tmp_path):
    with pytest.raises(SystemExit):
        op.main(["--env", "dev", "--stage", "bench", "--out", str(tmp_path)])  # bench needs device IDs
    with pytest.raises(SystemExit):
        op.main(["--env", "release", "--stage", "all", "--key", str(tmp_path / "ota-dev-private.pem")])
    with pytest.raises(SystemExit):
        op.main(["--env", "dev", "--stage", "bench", "--bench", "not-an-id"])


def test_version_read_from_config(tmp_path):
    c = tmp_path / "config.h"
    c.write_text('#define FW_VERSION "1.2.3"\n')
    assert op.fw_version(c) == "1.2.3"


def test_key_source_file_is_public_only(key):
    src = ota_keys.cpp_source("otaDevPublicKeyPem", ota_keys.public_pem(key), "note")
    assert "BEGIN PUBLIC KEY" in src and "PRIVATE" not in src
    assert "PROGMEM" in src and "otaDevPublicKeyPem()" in src


def test_release_key_needs_the_founder(capsys):
    assert ota_keys.main(["release"]) == 2
    assert "founder" in capsys.readouterr().out
