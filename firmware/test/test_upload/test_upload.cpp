#include <unity.h>

#include <cstring>
#include <string>

#include "claim.h"
#include "codes.h"
#include "improv.h"
#include "pending_readings.h"
#include "sha256.h"
#include "upload_payload.h"
#include "upload_policy.h"

using namespace core;

void setUp() {}
void tearDown() {}

static std::string sha(const std::string& s) {
  Sha256 h;
  h.update(s.data(), s.size());
  uint8_t out[32];
  h.finish(out);
  return toHex(out, 32);
}

// ---------- SHA-256 / HMAC (reference values from Python hashlib/hmac) ----------
static void test_sha256_vectors() {
  TEST_ASSERT_EQUAL_STRING("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", sha("abc").c_str());
  TEST_ASSERT_EQUAL_STRING("41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3",
                           sha(std::string(1000, 'a')).c_str());
  TEST_ASSERT_EQUAL_STRING("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", sha("").c_str());
}

static void test_hmac_rfc4231_case1() {
  uint8_t key[20];
  memset(key, 0x0b, sizeof key);
  uint8_t out[32];
  hmacSha256(key, sizeof key, "Hi There", 8, nullptr, 0, out);
  TEST_ASSERT_EQUAL_STRING("b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7", toHex(out, 32).c_str());
}

static void test_upload_signature_matches_backend_scheme() {
  // Same inputs as Python: hmac.new(bytes(range(1,33)), b'1795280000' + b'{"a":1}', sha256)
  std::string secret = "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";
  TEST_ASSERT_EQUAL_STRING("780789e9ca921dc03e285117d4d1a4452e83c7ae961f5dde55a994e51aa38747",
                           signUpload(secret, "1795280000", "{\"a\":1}").c_str());
  TEST_ASSERT_EQUAL_STRING("", signUpload("not-hex", "1", "x").c_str());
}

// ---------- payload ----------
static UploadReading sampleReading() {
  UploadReading r{};
  r.ts = 1795280000;
  r.avg.samples = 60;
  r.avg.pm1_cf1 = 5.25f; r.avg.pm25_cf1 = 8.04f; r.avg.pm10_cf1 = 11.0f;
  r.avg.pm1_atm = 5.0f; r.avg.pm25_atm = 8.0f; r.avg.pm10_atm = 11.0f;
  const float c[6] = {1500.4f, 450, 80, 10, 2, 0.6f};
  for (int i = 0; i < 6; i++) r.avg.counts[i] = c[i];
  r.avg.pm25_cf1_min = 6;
  r.avg.pm25_cf1_max = 12;
  return r;
}

static void test_payload_shape() {
  UploadInfo info;
  info.fw = "0.3.0";
  info.uptimeS = 1234;
  info.rssi = -61;
  info.errors = {{"csum_err", 2}, {"sensor_ok", 1}};
  std::string j = buildUploadJson(info, {sampleReading()});
  TEST_ASSERT_EQUAL_STRING(
      "{\"fw\":\"0.3.0\",\"uptime_s\":1234,\"rssi\":-61,\"readings\":[{\"ts\":1795280000,\"n\":60,"
      "\"pm1_cf1\":5.2,\"pm25_cf1\":8.0,\"pm10_cf1\":11.0,\"pm1_atm\":5.0,\"pm25_atm\":8.0,\"pm10_atm\":11.0,"
      "\"counts\":[1500,450,80,10,2,1],\"pm25_cf1_min\":6,\"pm25_cf1_max\":12}],"
      "\"errors\":{\"csum_err\":2,\"sensor_ok\":1}}",
      j.c_str());
}

static void test_payload_setup_is_escaped() {
  UploadInfo info;
  info.fw = "0.3.0";
  info.hasSetup = true;
  info.address = "12 \"Quote\" St\\Apt\n4";
  info.zip = "10027";
  info.indoor = true;
  info.claimTokenHash = std::string(64, 'a');
  std::string j = buildUploadJson(info, {sampleReading()});
  TEST_ASSERT_NOT_NULL(strstr(j.c_str(), "\"address\":\"12 \\\"Quote\\\" St\\\\Apt\\n4\""));
  TEST_ASSERT_NOT_NULL(strstr(j.c_str(), "\"indoor\":true"));
  TEST_ASSERT_NOT_NULL(strstr(j.c_str(), "\"claim_token_hash\":\"aaaa"));
  TEST_ASSERT_EQUAL_STRING("a\\u0001b", jsonEscape("a\x01" "b").c_str());
}

static void test_pending_queue_drops_oldest() {
  PendingReadings p;
  for (uint32_t i = 0; i < 10; i++) {
    UploadReading r = sampleReading();
    r.ts = i;
    p.push(r);
  }
  TEST_ASSERT_EQUAL(PendingReadings::kMax, p.items().size());
  TEST_ASSERT_EQUAL_UINT32(2, p.items().front().ts);
  TEST_ASSERT_EQUAL_UINT32(2, p.dropped());
  p.clear();
  TEST_ASSERT_TRUE(p.empty());
}

// ---------- upload policy ----------
static double gRand = 0.5;
static double fixedRand() { return gRand; }

static void test_policy_cadence_and_backoff_with_jitter() {
  gRand = 0.5;  // jitter factor exactly 1.0
  UploadPolicy p(fixedRand);
  p.begin(0);
  TEST_ASSERT_FALSE(p.due(149999));
  TEST_ASSERT_TRUE(p.due(150000));
  p.onResult(UploadOutcome::kNetworkError, 150000);
  TEST_ASSERT_EQUAL_UINT32(15000, p.nextInMs(150000));
  p.onResult(UploadOutcome::kNetworkError, 165000);
  TEST_ASSERT_EQUAL_UINT32(30000, p.nextInMs(165000));
  for (int i = 0; i < 10; i++) p.onResult(UploadOutcome::kNetworkError, 200000);
  TEST_ASSERT_EQUAL_UINT32(UploadPolicy::kBackoffMaxMs, p.nextInMs(200000));
  p.onResult(UploadOutcome::kOk, 300000);
  TEST_ASSERT_EQUAL_UINT32(0, p.consecutiveFailures());
  TEST_ASSERT_TRUE(p.enrolled());
  TEST_ASSERT_EQUAL_UINT32(150000, p.nextInMs(300000));
}

static void test_policy_jitter_spreads_devices() {
  gRand = 0.0;
  UploadPolicy a(fixedRand);
  a.begin(0);
  gRand = 0.99;
  UploadPolicy b(fixedRand);
  b.begin(0);
  TEST_ASSERT_EQUAL_UINT32(75000, a.nextInMs(0));     // 0.5x
  TEST_ASSERT_TRUE(b.nextInMs(0) > 220000);           // ~1.5x
  gRand = 0.0;
  a.onResult(UploadOutcome::kNetworkError, 0);
  TEST_ASSERT_EQUAL_UINT32(7500, a.nextInMs(0));
}

static void test_policy_special_outcomes() {
  gRand = 0.5;
  UploadPolicy p(fixedRand);
  p.begin(0);
  p.onResult(UploadOutcome::kRateLimited, 0, 600);
  TEST_ASSERT_EQUAL_UINT32(600000, p.nextInMs(0));
  p.onResult(UploadOutcome::kNotRegistered, 0);
  TEST_ASSERT_EQUAL_UINT32(UploadPolicy::kNotRegisteredMs, p.nextInMs(0));
  TEST_ASSERT_FALSE(p.needsTimeResync());
  p.onResult(UploadOutcome::kClockSkew, 0);
  TEST_ASSERT_TRUE(p.needsTimeResync());
  p.clearTimeResync();
  TEST_ASSERT_FALSE(p.needsTimeResync());
}

static void test_policy_due_across_millis_wrap() {
  gRand = 0.5;
  UploadPolicy p(fixedRand);
  p.begin(0xFFFFFFFFu - 1000);
  TEST_ASSERT_FALSE(p.due(0xFFFFFFFFu));
  TEST_ASSERT_TRUE(p.due(150000u));
}

// ---------- claim token ----------
static void test_claim_token_hash_and_url() {
  uint8_t rnd[16];
  for (int i = 0; i < 16; i++) rnd[i] = static_cast<uint8_t>(i);
  ClaimToken c = makeClaimToken(rnd);
  TEST_ASSERT_EQUAL_STRING("000102030405060708090a0b0c0d0e0f", c.token.c_str());
  // Python: hashlib.sha256(b"000102030405060708090a0b0c0d0e0f").hexdigest()  (backend: sha256Hex(t))
  TEST_ASSERT_EQUAL_STRING("d65df89f702eec58ca3c7bf2001c9ffc7cd80553ae01d42a799ba26756142d96", c.hashHex.c_str());
  TEST_ASSERT_EQUAL_STRING("https://x.example/claim#d=esp8266-7&t=000102030405060708090a0b0c0d0e0f",
                           claimUrl("https://x.example", "esp8266-7", c.token).c_str());
}

static void test_policy_request_soon() {
  gRand = 0.5;
  UploadPolicy p(fixedRand);
  p.begin(0);
  p.requestSoon(1000);
  TEST_ASSERT_TRUE(p.due(1000));
  p.onResult(UploadOutcome::kNetworkError, 2000);
  p.requestSoon(2000);
  TEST_ASSERT_FALSE(p.due(2000));  // still backing off
}

// ---------- Improv ----------
static void test_improv_spec_example_wifi_settings() {
  // Spec example: 01 1E 0C {MyWirelessAP} 10 {mysecurepassword}
  auto f = improv::rpcFrame(improv::kWifiSettings, improv::wifiSettingsPayload("MyWirelessAP", "mysecurepassword"));
  TEST_ASSERT_EQUAL_UINT8(0x01, f[9]);
  TEST_ASSERT_EQUAL_UINT8(0x1E, f[10]);
  TEST_ASSERT_EQUAL_UINT8(0x0C, f[11]);
  TEST_ASSERT_EQUAL_UINT8(0x10, f[11 + 1 + 12]);
  improv::Parser p;
  improv::Rpc rpc;
  bool invalid = false, got = false;
  const char* logs = "[hb] uptime_s=5 heap=4\r\nIMPRO";  // log noise + a false start
  for (const char* c = logs; *c; c++) got |= p.feed(static_cast<uint8_t>(*c), rpc, invalid);
  for (uint8_t b : f) got |= p.feed(b, rpc, invalid);
  TEST_ASSERT_TRUE(got);
  TEST_ASSERT_EQUAL_UINT8(improv::kWifiSettings, rpc.command);
  TEST_ASSERT_EQUAL_STRING("MyWirelessAP", rpc.ssid.c_str());
  TEST_ASSERT_EQUAL_STRING("mysecurepassword", rpc.password.c_str());
}

static void test_improv_checksum_and_bad_frames() {
  auto f = improv::rpcFrame(improv::kGetDeviceInfo, {});
  uint8_t sum = 0;
  for (size_t i = 0; i + 1 < f.size(); i++) sum = static_cast<uint8_t>(sum + f[i]);
  TEST_ASSERT_EQUAL_UINT8(sum, f.back());
  improv::Parser p;
  improv::Rpc rpc;
  bool invalid = false, got = false;
  f.back() ^= 0xFF;
  for (uint8_t b : f) got |= p.feed(b, rpc, invalid);
  TEST_ASSERT_FALSE(got);
  TEST_ASSERT_TRUE(invalid);
  // after a bad frame the parser recovers
  auto g = improv::rpcFrame(improv::kGetCurrentState, {});
  got = false;
  for (uint8_t b : g) got |= p.feed(b, rpc, invalid);
  TEST_ASSERT_TRUE(got);
  TEST_ASSERT_EQUAL_UINT8(improv::kGetCurrentState, rpc.command);
  // malformed wifi payload (ssid length beyond data)
  std::vector<uint8_t> bad{20, 'a', 'b'};
  auto h = improv::rpcFrame(improv::kWifiSettings, bad);
  got = false;
  bool sawInvalid = false;
  for (uint8_t b : h) {
    got |= p.feed(b, rpc, invalid);
    sawInvalid |= invalid;
  }
  TEST_ASSERT_FALSE(got);
  TEST_ASSERT_TRUE(sawInvalid);
}

static void test_improv_result_and_state_frames() {
  auto r = improv::resultFrame(improv::kGetDeviceInfo, {"ProseFire", "0.3.0", "ESP8266", "ProseFire sensor"});
  TEST_ASSERT_EQUAL_UINT8(improv::kRpcResult, r[7]);
  TEST_ASSERT_EQUAL_UINT8(improv::kGetDeviceInfo, r[9]);
  TEST_ASSERT_EQUAL_UINT8(r[8] - 2, r[10]);  // inner length = frame length - command - length byte
  TEST_ASSERT_EQUAL_UINT8(9, r[11]);
  TEST_ASSERT_EQUAL_MEMORY("ProseFire", &r[12], 9);
  auto empty = improv::resultFrame(improv::kGetWifiNetworks, {});  // end-of-list marker
  TEST_ASSERT_EQUAL_UINT8(2, empty[8]);
  TEST_ASSERT_EQUAL_UINT8(0, empty[10]);
  auto s = improv::stateFrame(improv::kProvisioned);
  TEST_ASSERT_EQUAL_UINT8(improv::kCurrentState, s[7]);
  TEST_ASSERT_EQUAL_UINT8(1, s[8]);
  TEST_ASSERT_EQUAL_UINT8(0x04, s[9]);
  auto big = improv::resultFrame(improv::kGetWifiNetworks, {std::string(300, 'x'), "-50", "YES"});
  TEST_ASSERT_TRUE(big.size() <= 9 + 255 + 1);
}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_sha256_vectors);
  RUN_TEST(test_hmac_rfc4231_case1);
  RUN_TEST(test_upload_signature_matches_backend_scheme);
  RUN_TEST(test_payload_shape);
  RUN_TEST(test_payload_setup_is_escaped);
  RUN_TEST(test_pending_queue_drops_oldest);
  RUN_TEST(test_policy_cadence_and_backoff_with_jitter);
  RUN_TEST(test_policy_jitter_spreads_devices);
  RUN_TEST(test_policy_special_outcomes);
  RUN_TEST(test_policy_due_across_millis_wrap);
  RUN_TEST(test_claim_token_hash_and_url);
  RUN_TEST(test_policy_request_soon);
  RUN_TEST(test_improv_spec_example_wifi_settings);
  RUN_TEST(test_improv_checksum_and_bad_frames);
  RUN_TEST(test_improv_result_and_state_frames);
  return UNITY_END();
}
