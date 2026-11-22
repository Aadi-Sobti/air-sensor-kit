from pathlib import Path

import check_release as cr

INI_OK = """
[env:release]
build_flags =
    -Wall
    -DFW_ENV=\\"release\\"
[env:dev]
build_flags = -DDEV_BUILD=1
"""


def make_fw(tmp_path: Path, ini=INI_OK, main="int x;\n", dev="const char* u = \"http://10.0.0.2\";\n"):
    fw = tmp_path / "firmware"
    (fw / "src" / "dev").mkdir(parents=True)
    (fw / "lib" / "core").mkdir(parents=True)
    (fw / "platformio.ini").write_text(ini)
    (fw / "src" / "main.cpp").write_text(main)
    (fw / "src" / "dev" / "dev.cpp").write_text(dev)
    return fw


def test_clean_tree_passes_and_dev_folder_is_ignored(tmp_path):
    fw = make_fw(tmp_path)
    assert cr.main(["--firmware-dir", str(fw), "--no-bin"]) == 0


def test_dev_flag_in_release_fails(tmp_path):
    fw = make_fw(tmp_path, ini=INI_OK.replace("-Wall", "-Wall -DDEV_BUILD=1", 1))
    assert cr.main(["--firmware-dir", str(fw), "--no-bin"]) == 1


def test_set_insecure_outside_dev_fails(tmp_path, capsys):
    fw = make_fw(tmp_path, main="client.setInsecure();\n")
    assert cr.main(["--firmware-dir", str(fw), "--no-bin"]) == 1
    assert "main.cpp:1" in capsys.readouterr().out


def test_http_url_outside_dev_fails(tmp_path):
    fw = make_fw(tmp_path, main='auto u = "http://example.org";\n')
    assert cr.main(["--firmware-dir", str(fw), "--no-bin"]) == 1


def test_dev_macro_outside_dev_fails(tmp_path):
    fw = make_fw(tmp_path, main="#ifdef DEV_BUILD\n#endif\n")
    assert cr.main(["--firmware-dir", str(fw), "--no-bin"]) == 1


def test_binary_and_elf_check(tmp_path):
    fw = make_fw(tmp_path)
    assert cr.main(["--firmware-dir", str(fw)]) == 1  # missing build outputs
    b = fw / ".pio" / "build" / "release"
    b.mkdir(parents=True)
    (b / "firmware.bin").write_bytes(b"\x00\x01https://ok\x00")
    (b / "firmware.elf").write_bytes(b"\x7fELF..._ZN11WiFiClient7connectEv\x00")
    assert cr.main(["--firmware-dir", str(fw)]) == 0
    (b / "firmware.bin").write_bytes(b"\x00http://bad\x00")
    assert cr.main(["--firmware-dir", str(fw)]) == 1
    (b / "firmware.bin").write_bytes(b"\x00ok\x00")
    # mangled symbol of a linked-in BearSSL::WiFiClientSecure::setInsecure()
    (b / "firmware.elf").write_bytes(b"\x7fELF..._ZN7BearSSL16WiFiClientSecure11setInsecureEv\x00")
    assert cr.main(["--firmware-dir", str(fw)]) == 1


INI_INHERIT = """
[env]
build_flags = {env_flag}
[common]
build_flags = -Wall {common_flag}
[env:release]
extends = common
build_flags =
    ${{common.build_flags}}
    -DFW_ENV=\\"release\\"
"""


def test_dev_flag_inherited_from_common_section_fails(tmp_path):
    fw = make_fw(tmp_path, ini=INI_INHERIT.format(env_flag="", common_flag="-DDEV_BUILD"))
    assert cr.main(["--firmware-dir", str(fw), "--no-bin"]) == 1


def test_dev_flag_in_global_env_section_fails(tmp_path):
    fw = make_fw(tmp_path, ini=INI_INHERIT.format(env_flag="-DFAKE_PMS", common_flag=""))
    assert cr.main(["--firmware-dir", str(fw), "--no-bin"]) == 1


def test_clean_inherited_flags_pass(tmp_path):
    fw = make_fw(tmp_path, ini=INI_INHERIT.format(env_flag="-Os", common_flag="-Wextra"))
    assert cr.main(["--firmware-dir", str(fw), "--no-bin"]) == 0


def test_fake_pms_macro_outside_dev_fails(tmp_path):
    fw = make_fw(tmp_path, main="#if FAKE_PMS\n#endif\n")
    assert cr.main(["--firmware-dir", str(fw), "--no-bin"]) == 1


def test_real_platformio_ini_resolves():
    flags = cr.resolved_flags(cr.ROOT / "firmware" / "platformio.ini")
    assert "-Wall" in flags and "release" in flags and "DEV_" not in flags


def test_only_the_local_setup_ap_address_is_allowed(tmp_path):
    fw = make_fw(tmp_path, main='const char* u = "http://192.168.4.1/";\n')
    assert cr.main(["--firmware-dir", str(fw), "--no-bin"]) == 0
    for bad in ['"http://192.168.4.10/"', '"http://192.168.1.1/"', '"http://example.org"', '"http://192.168.4.1:8080/"']:
        fw2 = make_fw(tmp_path / bad.strip('"').replace("/", "_").replace(":", "_"), main=f"auto u = {bad};\n")
        assert cr.main(["--firmware-dir", str(fw2), "--no-bin"]) == 1, bad
    b = fw / ".pio" / "build" / "release"
    b.mkdir(parents=True)
    (b / "firmware.elf").write_bytes(b"\x7fELF")
    (b / "firmware.bin").write_bytes(b"\x00http://192.168.4.1/\x00")
    assert cr.main(["--firmware-dir", str(fw)]) == 0
    (b / "firmware.bin").write_bytes(b"\x00http://192.168.4.1/\x00http://x.org\x00")
    assert cr.main(["--firmware-dir", str(fw)]) == 1


def test_dev_ota_key_in_release_binary_fails(tmp_path):
    fw = tmp_path / "fw"
    (fw / "keys").mkdir(parents=True)
    (fw / "keys" / "ota_dev_public.pem").write_text(
        "-----BEGIN PUBLIC KEY-----\nAAAAfirstline\nBBBBdistinctivesecondline\nCCCCthird\n-----END PUBLIC KEY-----\n")
    build = tmp_path / "build"
    build.mkdir()
    (build / "firmware.elf").write_bytes(b"elf")
    (build / "firmware.bin").write_bytes(b"\xe9 clean image")
    assert cr.check_bin(build, fw) == []
    (build / "firmware.bin").write_bytes(b"\xe9 ... BBBBdistinctivesecondline ...")
    assert any("DEV OTA" in p for p in cr.check_bin(build, fw))
