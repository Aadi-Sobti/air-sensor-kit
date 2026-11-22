import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import factory_station as fs  # noqa: E402


def test_new_list_revoke(tmp_path, capsys):
    d = tmp_path / "secrets"
    assert fs.main(["new", "bench-laptop"], d) == 0
    key = (d / "factory-bench-laptop.key").read_text().strip()
    assert len(key) == 64 and int(key, 16) >= 0
    assert oct((d / "factory-bench-laptop.key").stat().st_mode)[-3:] == "600"
    lines = (d / "factory-key-hashes.txt").read_text().splitlines()
    assert lines == [f"bench-laptop {fs.key_hash(key)}"]
    assert key not in (d / "factory-key-hashes.txt").read_text()
    out = capsys.readouterr().out
    assert key not in out  # never printed
    assert fs.main(["new", "bench-laptop"], d) == 1  # no silent replacement
    assert fs.main(["new", "Bad Name"], d) == 2
    assert fs.main(["revoke", "bench-laptop"], d) == 0
    assert (d / "factory-key-hashes.txt").read_text() == ""
    assert not (d / "factory-bench-laptop.key").exists()


def test_hash_matches_backend_format():
    # backend/functions/src/factory.ts: sha256("factory-station:v1:" + key)
    import hashlib
    assert fs.key_hash("ab") == hashlib.sha256(b"factory-station:v1:ab").hexdigest()
