import improv


def test_spec_example_wifi_settings():
    # Spec: 01 1E 0C {MyWirelessAP} 10 {mysecurepassword}
    f = improv.wifi_settings("MyWirelessAP", "mysecurepassword")
    assert f[:6] == b"IMPROV" and f[6] == 1 and f[7] == improv.T_RPC
    assert f[9:12] == bytes([0x01, 0x1E, 0x0C])
    assert f[12:24] == b"MyWirelessAP" and f[24] == 0x10
    assert sum(f[:-1]) & 0xFF == f[-1]


def test_same_bytes_as_firmware_codec():
    # The firmware's rpcFrame(kGetDeviceInfo, {}) = "IMPROV" 01 03 02 03 00 + checksum
    f = improv.rpc(improv.GET_INFO)
    assert f == b"IMPROV\x01\x03\x02\x03\x00" + bytes([sum(b"IMPROV\x01\x03\x02\x03\x00") & 0xFF])


def test_parser_skips_logs_and_bad_checksums():
    good = improv.frame(improv.T_RESULT, bytes([3, 12, 9]) + b"ProseFire" + bytes([1]) + b"x")
    bad = bytearray(improv.frame(improv.T_STATE, bytes([2])))
    bad[-1] ^= 0xFF
    p = improv.Parser()
    out = list(p.feed(b"[hb] uptime_s=5\r\nIMPR" + b"OV-not" + bytes(bad) + good[:5]))
    out += list(p.feed(good[5:] + b"\n[pms] n=12\n"))
    assert len(out) == 1
    t, d = out[0]
    assert t == improv.T_RESULT and improv.parse_strings(d) == ["ProseFire", "x"]


def test_rejects_too_long_credentials():
    import pytest
    with pytest.raises(ValueError):
        improv.wifi_settings("x" * 33, "p")
    with pytest.raises(ValueError):
        improv.wifi_settings("", "p")
