#include <unity.h>

#include <map>
#include <string>

#include "codes.h"
#include "device_state.h"
#include "identity_policy.h"
#include "kvstore.h"

using namespace core;

void setUp() {}
void tearDown() {}

// ---------- kvstore ----------
class MemFs : public FileStore {
 public:
  std::map<std::string, std::string> files;
  int failWriteAfter = -1;  // simulate power loss: write only this many bytes, then fail
  bool failRename = false;
  bool read(const char* p, std::string& out) override {
    auto it = files.find(p);
    if (it == files.end()) return false;
    out = it->second;
    return true;
  }
  bool write(const char* p, const std::string& d) override {
    if (failWriteAfter >= 0) {
      files[p] = d.substr(0, static_cast<size_t>(failWriteAfter));
      return false;
    }
    files[p] = d;
    return true;
  }
  bool rename(const char* a, const char* b) override {
    if (failRename) return false;
    auto it = files.find(a);
    if (it == files.end()) return false;
    files[b] = it->second;
    files.erase(it);
    return true;
  }
  bool remove(const char* p) override { return files.erase(p) > 0; }
  bool exists(const char* p) override { return files.count(p) > 0; }
};

static void test_crc32_known_value() {
  const char* s = "123456789";  // standard CRC-32 check value
  TEST_ASSERT_EQUAL_HEX32(0xCBF43926u, crc32(reinterpret_cast<const uint8_t*>(s), 9));
}

static void test_record_roundtrip_with_nasty_values() {
  KvRecord r;
  r.set("ssid", "Cafe=WiFi%\n 5G\r");
  r.set("pass", std::string("a\x01" "b\x7f=c", 6));
  r.setInt("indoor", 1);
  r.set("empty", "");
  std::string text = r.serialize(3);
  KvRecord back;
  uint16_t v = 0;
  TEST_ASSERT_TRUE(back.parse(text, v));
  TEST_ASSERT_EQUAL_UINT16(3, v);
  TEST_ASSERT_EQUAL_STRING("Cafe=WiFi%\n 5G\r", back.get("ssid").c_str());
  TEST_ASSERT_EQUAL(6, back.get("pass").size());
  TEST_ASSERT_EQUAL(1, back.getInt("indoor"));
  TEST_ASSERT_TRUE(back.has("empty"));
  TEST_ASSERT_EQUAL(42, back.getInt("missing", 42));
}

static void test_record_rejects_corruption() {
  KvRecord r;
  r.set("ssid", "home");
  std::string text = r.serialize(1);
  uint16_t v;
  KvRecord b;
  std::string flipped = text;
  flipped[4] ^= 0x01;
  TEST_ASSERT_FALSE(b.parse(flipped, v));
  TEST_ASSERT_EQUAL(0, b.size());
  TEST_ASSERT_FALSE(b.parse(text.substr(0, text.size() / 2), v));  // torn write
  TEST_ASSERT_FALSE(b.parse("", v));
  TEST_ASSERT_FALSE(b.parse("crc=00000000\n", v));  // no version line
}

static void test_atomic_save_and_load() {
  MemFs fs;
  KvRecord r;
  r.set("ssid", "home");
  TEST_ASSERT_TRUE(saveRecord(fs, "/config", r, 1));
  TEST_ASSERT_FALSE(fs.exists("/config.tmp"));
  KvRecord l;
  uint16_t v;
  TEST_ASSERT_TRUE(loadRecord(fs, "/config", l, v) == LoadResult::kOk);
  TEST_ASSERT_EQUAL_STRING("home", l.get("ssid").c_str());
}

static void test_power_loss_mid_write_keeps_old_file() {
  MemFs fs;
  KvRecord r;
  r.set("ssid", "old");
  saveRecord(fs, "/config", r, 1);
  r.set("ssid", "new");
  fs.failWriteAfter = 10;
  TEST_ASSERT_FALSE(saveRecord(fs, "/config", r, 1));
  fs.failWriteAfter = -1;
  fs.files["/config.tmp"] = r.serialize(1).substr(0, 12);  // torn tmp left behind
  KvRecord l;
  uint16_t v;
  TEST_ASSERT_TRUE(loadRecord(fs, "/config", l, v) == LoadResult::kOk);
  TEST_ASSERT_EQUAL_STRING("old", l.get("ssid").c_str());
  TEST_ASSERT_FALSE(fs.exists("/config.tmp"));
}

static void test_power_loss_before_rename_recovers_new_file() {
  MemFs fs;
  KvRecord r;
  r.set("ssid", "old");
  saveRecord(fs, "/config", r, 1);
  r.set("ssid", "new");
  fs.failRename = true;
  TEST_ASSERT_FALSE(saveRecord(fs, "/config", r, 1));
  fs.failRename = false;
  KvRecord l;
  uint16_t v;
  TEST_ASSERT_TRUE(loadRecord(fs, "/config", l, v) == LoadResult::kRecoveredFromTmp);
  TEST_ASSERT_EQUAL_STRING("new", l.get("ssid").c_str());
  TEST_ASSERT_FALSE(fs.exists("/config.tmp"));
  TEST_ASSERT_TRUE(loadRecord(fs, "/config", l, v) == LoadResult::kOk);
}

static void test_missing_and_corrupt() {
  MemFs fs;
  KvRecord l;
  uint16_t v;
  TEST_ASSERT_TRUE(loadRecord(fs, "/identity", l, v) == LoadResult::kMissing);
  fs.files["/identity"] = "garbage";
  TEST_ASSERT_TRUE(loadRecord(fs, "/identity", l, v) == LoadResult::kCorrupt);
}

// ---------- codes ----------
static void test_code_alphabet_has_no_lookalikes() {
  std::string a(kCodeAlphabet);
  for (char c : std::string("01OIL")) TEST_ASSERT_TRUE(a.find(c) == std::string::npos);
  TEST_ASSERT_EQUAL(31, a.size());
}

static void test_make_code_is_unbiased_and_sized() {
  uint8_t rnd[64];
  for (int i = 0; i < 64; i++) rnd[i] = static_cast<uint8_t>(i * 37 + 11);
  std::string c = makeCode(rnd, sizeof rnd, kSetupPasswordLen);
  TEST_ASSERT_EQUAL(kSetupPasswordLen, c.size());
  uint8_t high[30];
  for (auto& b : high) b = 250;  // all in the rejected range
  TEST_ASSERT_EQUAL(0, makeCode(high, sizeof high, 4).size());
  uint8_t edge[2] = {247, 0};  // 247 % 31 = 30 -> '9'; 0 -> 'A'
  TEST_ASSERT_EQUAL_STRING("9A", makeCode(edge, 2, 2).c_str());
}

static void test_hex() {
  uint8_t b[3] = {0x00, 0xAB, 0x7F};
  TEST_ASSERT_EQUAL_STRING("00ab7f", toHex(b, 3).c_str());
}

// ---------- identity policy ----------
static void test_identity_policy() {
  IdentityFiles f;
  TEST_ASSERT_TRUE(decideIdentity(f) == IdentityAction::kCreate);  // brand-new device
  f.main = LoadResult::kOk;
  f.mainValid = true;
  TEST_ASSERT_TRUE(decideIdentity(f) == IdentityAction::kUseMain);
  f.mainValid = false;
  f.main = LoadResult::kCorrupt;
  f.backup = LoadResult::kOk;
  f.backupValid = true;
  TEST_ASSERT_TRUE(decideIdentity(f) == IdentityAction::kUseBackup);
  f.backupValid = false;
  TEST_ASSERT_TRUE(decideIdentity(f) == IdentityAction::kLost);  // never silently regenerate
  f.main = LoadResult::kMissing;
  f.backup = LoadResult::kCorrupt;
  TEST_ASSERT_TRUE(decideIdentity(f) == IdentityAction::kLost);
  f.main = LoadResult::kOk;  // parses but belongs to another chip / bad fields
  f.backup = LoadResult::kMissing;
  TEST_ASSERT_TRUE(decideIdentity(f) == IdentityAction::kLost);
}

static void test_identity_record_validation() {
  KvRecord r;
  r.set("device_id", "esp8266-1");
  r.set("secret", std::string(64, 'a'));
  r.set("setup_pw", "ABCDEFGHJKMN");
  TEST_ASSERT_TRUE(identityRecordValid(r, "esp8266-1"));
  TEST_ASSERT_FALSE(identityRecordValid(r, "esp8266-2"));  // moved flash to another chip
  r.set("secret", std::string(63, 'a') + "Z");
  TEST_ASSERT_FALSE(identityRecordValid(r, "esp8266-1"));
  r.set("secret", std::string(64, 'a'));
  r.set("setup_pw", "SHORT");
  TEST_ASSERT_FALSE(identityRecordValid(r, "esp8266-1"));
}

// ---------- LED ----------
static void test_led_patterns() {
  TEST_ASSERT_TRUE(ledLit(LedPattern::kSlowBlink, 0));
  TEST_ASSERT_TRUE(ledLit(LedPattern::kSlowBlink, 999));
  TEST_ASSERT_FALSE(ledLit(LedPattern::kSlowBlink, 1000));
  TEST_ASSERT_TRUE(ledLit(LedPattern::kFastBlink, 100));
  TEST_ASSERT_FALSE(ledLit(LedPattern::kFastBlink, 200));
  int litBlip = 0, litDouble = 0;
  for (uint32_t t = 0; t < 10000; t += 10) {
    litBlip += ledLit(LedPattern::kBlip, t);
    litDouble += ledLit(LedPattern::kDoubleBlink, t);
  }
  TEST_ASSERT_EQUAL(12, litBlip);     // 2 blips x 60 ms
  TEST_ASSERT_EQUAL(150, litDouble);  // 5 periods x 2 flashes x 150 ms
  TEST_ASSERT_TRUE(ledPatternFor(DeviceState::kSetup) == LedPattern::kSlowBlink);
  TEST_ASSERT_TRUE(ledPatternFor(DeviceState::kRunning) == LedPattern::kBlip);
  TEST_ASSERT_TRUE(ledPatternFor(DeviceState::kProblem) == LedPattern::kDoubleBlink);
}

// ---------- state machine ----------
static const uint32_t MIN = 60UL * 1000;

static void test_fresh_device_is_setup_with_ap() {
  StateMachine m;
  StateInputs in;
  m.begin(in, 0);
  TEST_ASSERT_TRUE(m.state() == DeviceState::kSetup);
  TEST_ASSERT_TRUE(m.outputs().apOn);
  TEST_ASSERT_FALSE(m.outputs().connectWifi);
}

static void test_saved_wifi_connects_then_runs() {
  StateMachine m;
  StateInputs in;
  in.hasSavedWifi = true;
  m.begin(in, 0);
  TEST_ASSERT_TRUE(m.state() == DeviceState::kConnecting);
  TEST_ASSERT_FALSE(m.outputs().apOn);
  in.wifiConnected = true;
  TEST_ASSERT_TRUE(m.update(in, 5000));
  TEST_ASSERT_TRUE(m.state() == DeviceState::kRunning);
}

static void test_boot_wifi_failing_opens_ap_after_3_min_and_keeps_retrying() {
  StateMachine m;
  StateInputs in;
  in.hasSavedWifi = true;
  m.begin(in, 0);
  m.update(in, 3 * MIN - 1);
  TEST_ASSERT_TRUE(m.state() == DeviceState::kConnecting);
  TEST_ASSERT_FALSE(m.outputs().apOn);
  m.update(in, 3 * MIN);
  TEST_ASSERT_TRUE(m.state() == DeviceState::kProblem);
  TEST_ASSERT_TRUE(m.outputs().apOn);
  TEST_ASSERT_TRUE(m.outputs().connectWifi);  // still retrying saved WiFi
  in.wifiConnected = true;                    // router comes back
  m.update(in, 4 * MIN);
  TEST_ASSERT_TRUE(m.state() == DeviceState::kRunning);
  TEST_ASSERT_FALSE(m.outputs().apOn);  // AP closes when WiFi returns
}

static void test_router_off_while_running_is_problem_no_ap_never_erases_wifi() {
  StateMachine m;
  StateInputs in;
  in.hasSavedWifi = true;
  in.wifiConnected = true;
  m.begin(in, 0);
  in.wifiConnected = false;
  m.update(in, 10000);
  TEST_ASSERT_TRUE(m.state() == DeviceState::kProblem);
  TEST_ASSERT_FALSE(m.outputs().apOn);
  in.hasSavedWifi = false;  // even if a caller passes this, WiFi is not "forgotten"
  for (uint32_t t = 10000; t < 120 * MIN; t += MIN) {
    m.update(in, t);
    TEST_ASSERT_FALSE(m.outputs().apOn);  // outage after a connection never opens the AP (founder decision)
  }
  TEST_ASSERT_TRUE(m.outputs().connectWifi);
  TEST_ASSERT_TRUE(m.state() == DeviceState::kProblem);
}

static void test_setup_ap_never_times_out() {
  StateMachine m;
  StateInputs in;
  m.begin(in, 0);
  for (uint32_t t = 0; t < 24 * 60 * MIN; t += 7 * MIN) {
    m.update(in, t);
    TEST_ASSERT_TRUE(m.outputs().apOn);
  }
  TEST_ASSERT_TRUE(m.state() == DeviceState::kSetup);
}

static void test_fallback_ap_idle_timeout_after_15_min() {
  StateMachine m;
  StateInputs in;
  in.hasSavedWifi = true;
  m.begin(in, 0);
  m.update(in, 3 * MIN);  // startup fallback opens the AP
  TEST_ASSERT_TRUE(m.outputs().apOn);
  m.update(in, 18 * MIN - 1);
  TEST_ASSERT_TRUE(m.outputs().apOn);
  m.update(in, 18 * MIN);
  TEST_ASSERT_FALSE(m.outputs().apOn);
  m.update(in, 60 * MIN);
  TEST_ASSERT_FALSE(m.outputs().apOn);  // stays closed until long-press / reboot
  TEST_ASSERT_TRUE(m.outputs().connectWifi);
  m.eraseWifi(61 * MIN);
  TEST_ASSERT_TRUE(m.outputs().apOn);
}

static void test_new_settings_reenable_startup_fallback() {
  StateMachine m;
  StateInputs in;
  in.hasSavedWifi = true;
  in.wifiConnected = true;
  m.begin(in, 0);
  in.wifiConnected = false;
  m.wifiSettingsSaved(MIN);  // moved house: new network that doesn't work yet
  m.update(in, 4 * MIN + 1);
  TEST_ASSERT_TRUE(m.outputs().apOn);
  TEST_ASSERT_TRUE(m.state() == DeviceState::kProblem);
}

static void test_ap_stays_open_with_client() {
  StateMachine m;
  StateInputs in;
  m.begin(in, 0);
  in.apClientSeen = true;
  m.update(in, 30 * MIN);
  TEST_ASSERT_TRUE(m.outputs().apOn);
}

static void test_wifi_settings_in_any_state_then_long_press_resets() {
  StateMachine m;
  StateInputs in;
  m.begin(in, 0);
  m.wifiSettingsSaved(1000);
  TEST_ASSERT_TRUE(m.state() == DeviceState::kConnecting);
  in.hasSavedWifi = true;
  in.wifiConnected = true;
  m.update(in, 2000);
  TEST_ASSERT_TRUE(m.state() == DeviceState::kRunning);
  m.wifiSettingsSaved(3000);  // re-setup after a move, while running
  TEST_ASSERT_TRUE(m.state() == DeviceState::kConnecting);
  m.eraseWifi(4000);
  TEST_ASSERT_TRUE(m.state() == DeviceState::kSetup);
  TEST_ASSERT_FALSE(m.outputs().connectWifi);
  in.hasSavedWifi = false;
  in.wifiConnected = false;
  m.update(in, 5000);
  TEST_ASSERT_TRUE(m.state() == DeviceState::kSetup);
}


static void test_state_machine_survives_millis_wrap() {
  StateMachine m;
  StateInputs in;
  in.hasSavedWifi = true;
  uint32_t t0 = 0xFFFFFFFFu - MIN;
  m.begin(in, t0);
  m.update(in, t0 + 2 * MIN);  // wraps
  TEST_ASSERT_TRUE(m.state() == DeviceState::kConnecting);
  m.update(in, t0 + 3 * MIN);
  TEST_ASSERT_TRUE(m.state() == DeviceState::kProblem);
}

static void test_settings_saved_slightly_after_now_does_not_trigger_fallback() {
  // Regression: wifiSettingsSaved(millis()) runs inside a loop pass whose `now` was captured earlier.
  StateMachine m;
  StateInputs in;
  m.begin(in, 0);
  m.wifiSettingsSaved(100005);
  in.hasSavedWifi = true;
  m.update(in, 100000);  // older timestamp than the save
  TEST_ASSERT_TRUE(m.state() == DeviceState::kConnecting);
  TEST_ASSERT_TRUE(m.outputs().apOn);  // SETUP's AP stays up during the test (it was open), but no PROBLEM
}

// ---------- long press ----------
static void test_long_press_fires_once_after_5s() {
  LongPress lp;
  lp.begin(false, 0);
  int fired = 0;
  for (uint32_t t = 1000; t <= 12000; t += 10) fired += lp.update(true, t);
  TEST_ASSERT_EQUAL(1, fired);
  lp.update(false, 12100);
  lp.update(false, 12200);
  fired = 0;
  for (uint32_t t = 13000; t <= 15000; t += 10) fired += lp.update(true, t);
  TEST_ASSERT_EQUAL(0, fired);  // short press
}

static void test_long_press_ignores_bounce_and_boot_hold() {
  LongPress lp;
  lp.begin(true, 0);  // held at boot
  int fired = 0;
  for (uint32_t t = 0; t <= 8000; t += 10) fired += lp.update(true, t);
  TEST_ASSERT_EQUAL(0, fired);
  for (uint32_t t = 8010; t <= 8200; t += 10) lp.update(false, t);
  // bouncy press: toggles for 30 ms, then held
  lp.update(true, 9000);
  lp.update(false, 9010);
  lp.update(true, 9020);
  for (uint32_t t = 9030; t <= 15000; t += 10) fired += lp.update(true, t);
  TEST_ASSERT_EQUAL(1, fired);
}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_crc32_known_value);
  RUN_TEST(test_record_roundtrip_with_nasty_values);
  RUN_TEST(test_record_rejects_corruption);
  RUN_TEST(test_atomic_save_and_load);
  RUN_TEST(test_power_loss_mid_write_keeps_old_file);
  RUN_TEST(test_power_loss_before_rename_recovers_new_file);
  RUN_TEST(test_missing_and_corrupt);
  RUN_TEST(test_identity_policy);
  RUN_TEST(test_identity_record_validation);
  RUN_TEST(test_code_alphabet_has_no_lookalikes);
  RUN_TEST(test_make_code_is_unbiased_and_sized);
  RUN_TEST(test_hex);
  RUN_TEST(test_led_patterns);
  RUN_TEST(test_fresh_device_is_setup_with_ap);
  RUN_TEST(test_saved_wifi_connects_then_runs);
  RUN_TEST(test_boot_wifi_failing_opens_ap_after_3_min_and_keeps_retrying);
  RUN_TEST(test_router_off_while_running_is_problem_no_ap_never_erases_wifi);
  RUN_TEST(test_setup_ap_never_times_out);
  RUN_TEST(test_fallback_ap_idle_timeout_after_15_min);
  RUN_TEST(test_new_settings_reenable_startup_fallback);
  RUN_TEST(test_ap_stays_open_with_client);
  RUN_TEST(test_wifi_settings_in_any_state_then_long_press_resets);
  RUN_TEST(test_state_machine_survives_millis_wrap);
  RUN_TEST(test_settings_saved_slightly_after_now_does_not_trigger_fallback);
  RUN_TEST(test_long_press_fires_once_after_5s);
  RUN_TEST(test_long_press_ignores_bounce_and_boot_hold);
  return UNITY_END();
}
