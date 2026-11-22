#include <unity.h>

#include <string>

#include "ota_policy.h"

using namespace core;

void setUp() {}
void tearDown() {}

static const char* kGood =
    "{\"version\":\"0.7.1\",\"path\":\"/fw/prosefire-0.7.1.bin.signed\",\"size\":540000,"
    "\"stage\":\"bench\",\"canary_percent\":10,\"bench\":[\"esp8266-11001626\",\"esp8266-42\"],\"note\":{\"x\":[1,2]}}";

static void test_parse_good_manifest() {
  OtaManifest m;
  TEST_ASSERT_TRUE(parseOtaManifest(kGood, m));
  TEST_ASSERT_EQUAL_STRING("0.7.1", m.version.c_str());
  TEST_ASSERT_EQUAL_STRING("/fw/prosefire-0.7.1.bin.signed", m.path.c_str());
  TEST_ASSERT_EQUAL_UINT32(540000, m.size);
  TEST_ASSERT_EQUAL_STRING("bench", m.stage.c_str());
  TEST_ASSERT_EQUAL(10, m.canaryPercent);
  TEST_ASSERT_EQUAL(2, m.bench.size());
  TEST_ASSERT_TRUE(parseOtaManifest(" { \"version\" : \"1.0.0\" , \"path\":\"/fw/a.bin\", \"size\":1, \"stage\":\"all\", \"bench\":[] } ", m));
  TEST_ASSERT_EQUAL(0, m.bench.size());
}

static void test_reject_bad_manifests() {
  OtaManifest m;
  m.version = "keep";
  const char* bad[] = {
      "",
      "[]",
      "{\"version\":\"0.7\",\"path\":\"/fw/a\",\"size\":1,\"stage\":\"all\"}",              // version needs X.Y.Z
      "{\"version\":\"0.7.1\",\"path\":\"https://evil/x\",\"size\":1,\"stage\":\"all\"}",   // other site
      "{\"version\":\"0.7.1\",\"path\":\"/fw/../x\",\"size\":1,\"stage\":\"all\"}",
      "{\"version\":\"0.7.1\",\"path\":\"/fw/a\",\"size\":2000000,\"stage\":\"all\"}",      // bigger than max program
      "{\"version\":\"0.7.1\",\"path\":\"/fw/a\",\"size\":0,\"stage\":\"all\"}",
      "{\"version\":\"0.7.1\",\"path\":\"/fw/a\",\"size\":1,\"stage\":\"everyone\"}",
      "{\"version\":\"0.7.1\",\"path\":\"/fw/a\",\"size\":1,\"stage\":\"canary\"}",         // canary needs a percent
      "{\"version\":\"0.7.1\",\"path\":\"/fw/a\",\"size\":1,\"stage\":\"canary\",\"canary_percent\":101}",
      "{\"version\":\"0.7.1\",\"path\":\"/fw/a\",\"size\":1,\"stage\":\"all\"} trailing",
      "{\"version\":\"0.7.1\",\"path\":\"/fw/a\\\"b\",\"size\":1,\"stage\":\"all\"}",       // escapes not accepted
      "{\"version\":\"0.7.1\",\"path\":\"/fw/a\",\"size\":1,\"stage\":\"all\"",            // unterminated
      "{\"version\":\"0.7.1\" \"path\":\"/fw/a\",\"size\":1,\"stage\":\"all\"}",           // missing comma
  };
  for (const char* b : bad) TEST_ASSERT_FALSE_MESSAGE(parseOtaManifest(b, m), b);
  TEST_ASSERT_EQUAL_STRING("keep", m.version.c_str());  // untouched on failure
  TEST_ASSERT_FALSE(parseOtaManifest(std::string(5000, ' '), m));
}

static void test_versions() {
  TEST_ASSERT_TRUE(compareVersions("0.7.10", "0.7.9") > 0);
  TEST_ASSERT_TRUE(compareVersions("0.7.1", "0.7.1") == 0);
  TEST_ASSERT_TRUE(compareVersions("0.6.9", "0.7.0") < 0);
  TEST_ASSERT_TRUE(compareVersions("1.0.0", "0.99.99") > 0);
}

static void test_rollout_stages() {
  OtaManifest m;
  TEST_ASSERT_TRUE(parseOtaManifest(kGood, m));
  TEST_ASSERT_TRUE(otaEligible(m, "esp8266-11001626", "0.7.0"));   // on the bench list
  TEST_ASSERT_FALSE(otaEligible(m, "esp8266-999", "0.7.0"));       // bench stage: nobody else
  TEST_ASSERT_FALSE(otaEligible(m, "esp8266-11001626", "0.7.1"));  // already has it
  TEST_ASSERT_FALSE(otaEligible(m, "esp8266-11001626", "0.8.0"));  // never downgrade
  m.stage = "all";
  TEST_ASSERT_TRUE(otaEligible(m, "esp8266-999", "0.7.0"));
  // Canary: about canary_percent % of devices, always the same ones.
  m.stage = "canary";
  m.canaryPercent = 10;
  m.bench.clear();
  int in = 0;
  for (int i = 0; i < 2000; i++) in += otaEligible(m, "esp8266-" + std::to_string(1000000 + i * 7919), "0.7.0");
  TEST_ASSERT_TRUE_MESSAGE(in > 140 && in < 260, "canary slice should be ~10%");
  TEST_ASSERT_EQUAL(otaBucket("esp8266-123"), otaBucket("esp8266-123"));
  m.canaryPercent = 0;
  TEST_ASSERT_FALSE(otaEligible(m, "esp8266-123", "0.7.0"));
  m.canaryPercent = 100;
  TEST_ASSERT_TRUE(otaEligible(m, "esp8266-123", "0.7.0"));
}

static void test_jitter_spreads_checks() {
  uint32_t a = otaJitterMs("esp8266-1"), b = otaJitterMs("esp8266-2");
  TEST_ASSERT_TRUE(a < 3600000u && b < 3600000u);
  TEST_ASSERT_TRUE(a != b);
  TEST_ASSERT_EQUAL_UINT32(a, otaJitterMs("esp8266-1"));
}

static void test_failed_installs() {
  OtaFailures f;
  const std::string a = "/fw/p-0.7.2.bin.signed:546148", fixed = "/fw/p-0.7.3.bin.signed:546200";
  TEST_ASSERT_FALSE(f.blocks(a));
  f.record(a, 6);   // stream error (network): retry later
  f.record(a, 0);   // HTTP/TLS failure before writing
  TEST_ASSERT_FALSE(f.blocks(a));
  f.record(a, 14);  // out of memory
  TEST_ASSERT_TRUE(f.blocks(a));  // 3 tries: stop until restart
  TEST_ASSERT_FALSE(f.blocks(fixed));
  f.record(fixed, 12);  // bad signature: never again
  TEST_ASSERT_TRUE(f.blocks(fixed));
  TEST_ASSERT_FALSE(f.blocks(a));  // only the latest image is remembered
  TEST_ASSERT_TRUE(otaBadImageError(12) && otaBadImageError(10) && otaBadImageError(4));
  TEST_ASSERT_FALSE(otaBadImageError(0) || otaBadImageError(6) || otaBadImageError(14) || otaBadImageError(1));
}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_parse_good_manifest);
  RUN_TEST(test_reject_bad_manifests);
  RUN_TEST(test_versions);
  RUN_TEST(test_rollout_stages);
  RUN_TEST(test_jitter_spreads_checks);
  RUN_TEST(test_failed_installs);
  return UNITY_END();
}
