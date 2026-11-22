#include <unity.h>

#include <cstring>
#include <string>

#include "setup_info.h"

using namespace core;

void setUp() {}
void tearDown() {}

static int feedAll(CommandLine& c, const std::string& bytes) {
  int hits = 0;
  for (unsigned char b : bytes) hits += c.feed(b, "PFCMD SETUPINFO");
  return hits;
}

static void test_command_matches_clean_line_only() {
  CommandLine c;
  TEST_ASSERT_EQUAL(1, feedAll(c, "PFCMD SETUPINFO\n"));
  TEST_ASSERT_EQUAL(1, feedAll(c, "[log] x\r\nPFCMD SETUPINFO\r\n"));
  TEST_ASSERT_EQUAL(0, feedAll(c, "PFCMD SETUPINFOX\n"));
  TEST_ASSERT_EQUAL(0, feedAll(c, "XPFCMD SETUPINFO\n"));
  TEST_ASSERT_EQUAL(0, feedAll(c, "\n\n\n"));
}

static void test_binary_or_long_lines_never_match_and_never_replay() {
  CommandLine c;
  TEST_ASSERT_EQUAL(1, feedAll(c, "PFCMD SETUPINFO\n"));
  // Regression: an Improv frame (binary) followed by a newline byte must not re-trigger the old command.
  std::string improv = std::string("IMPROV\x01\x03\x02\x03\x00", 11) + "\n";
  TEST_ASSERT_EQUAL(0, feedAll(c, improv));
  TEST_ASSERT_EQUAL(0, feedAll(c, std::string("\x01PFCMD SETUPINFO\n", 17)));
  TEST_ASSERT_EQUAL(0, feedAll(c, std::string(40, 'A') + "PFCMD SETUPINFO\n"));
  TEST_ASSERT_EQUAL(1, feedAll(c, "PFCMD SETUPINFO\n"));  // a clean line works again
}

static void test_feed_line_returns_any_clean_command() {
  CommandLine c;
  int hits = 0;
  std::string got;
  for (unsigned char b : std::string("noise\x01x\nPFCMD NEWCLAIM\n")) {
    if (c.feedLine(b)) {
      hits++;
      got = c.text();
    }
  }
  TEST_ASSERT_EQUAL(1, hits);
  TEST_ASSERT_EQUAL_STRING("PFCMD NEWCLAIM", got.c_str());
}

static void test_setup_info_gate() {
  TEST_ASSERT_TRUE(setupInfoAllowed(false, 10 * 60000));  // unprovisioned: any time
  TEST_ASSERT_TRUE(setupInfoAllowed(true, 59999));         // provisioned: within 60 s of boot
  TEST_ASSERT_FALSE(setupInfoAllowed(true, 60000));
}

static void test_setup_info_sent_once_cleared_only_after_ok() {
  UploadInfo info;
  TEST_ASSERT_FALSE(attachSetupInfo(info, false, "1 A St", "10001", false));
  TEST_ASSERT_FALSE(info.hasSetup);
  TEST_ASSERT_FALSE(attachSetupInfo(info, true, "", "10001", false));  // nothing to send
  bool attached = attachSetupInfo(info, true, "1 A St", "10001", true);
  TEST_ASSERT_TRUE(attached);
  TEST_ASSERT_TRUE(info.hasSetup && info.indoor);
  TEST_ASSERT_EQUAL_STRING("1 A St", info.address.c_str());
  std::string json = buildUploadJson(info, {});
  TEST_ASSERT_NOT_NULL(strstr(json.c_str(), "\"setup\":{\"address\":\"1 A St\",\"zip\":\"10001\",\"indoor\":true}"));
  for (UploadOutcome o : {UploadOutcome::kNetworkError, UploadOutcome::kRejected, UploadOutcome::kRateLimited,
                          UploadOutcome::kClockSkew, UploadOutcome::kNotRegistered}) {
    TEST_ASSERT_FALSE(shouldClearSetupInfo(attached, o));  // keep it until the server has it
  }
  TEST_ASSERT_TRUE(shouldClearSetupInfo(true, UploadOutcome::kOk));
  TEST_ASSERT_FALSE(shouldClearSetupInfo(false, UploadOutcome::kOk));
}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_command_matches_clean_line_only);
  RUN_TEST(test_binary_or_long_lines_never_match_and_never_replay);
  RUN_TEST(test_feed_line_returns_any_clean_command);
  RUN_TEST(test_setup_info_gate);
  RUN_TEST(test_setup_info_sent_once_cleared_only_after_ok);
  return UNITY_END();
}
