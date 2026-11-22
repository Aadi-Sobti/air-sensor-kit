import setup_info


def test_wifi_qr_payload_escapes_special_characters():
    assert setup_info.wifi_qr_payload("ProseFire-Setup-K7Q2MX", "ABCDEFGHJKMN") == \
        "WIFI:T:WPA;S:ProseFire-Setup-K7Q2MX;P:ABCDEFGHJKMN;;"
    assert setup_info.wifi_qr_payload('a;b,c:d"e\\f', "p;w") == 'WIFI:T:WPA;S:a\\;b\\,c\\:d\\"e\\\\f;P:p\\;w;;'


def test_line_regex():
    m = setup_info.LINE_RE.search("noise\n[setupinfo] ap_ssid=ProseFire-Setup-AB23CD ap_password=XYZ234ABCDEF\r\n")
    assert m and m.group(1) == "ProseFire-Setup-AB23CD" and m.group(2) == "XYZ234ABCDEF"


def test_half_received_line_does_not_match():
    # Regression (hardware 2026-11-22): a chunk boundary inside the password must not yield a truncated password.
    assert setup_info.LINE_RE.search("[setupinfo] ap_ssid=ProseFire-Setup-AB23CD ap_password=XYZ234A") is None
