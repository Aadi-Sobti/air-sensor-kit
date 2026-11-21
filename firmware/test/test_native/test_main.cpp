#include <unity.h>

#include <cstring>

#include "device_id.h"

void setUp() {}
void tearDown() {}

static void test_formats_decimal_chip_id() {
  char buf[32];
  size_t n = core::formatDeviceId(13597726u, buf, sizeof buf);
  TEST_ASSERT_EQUAL_STRING("esp8266-13597726", buf);
  TEST_ASSERT_EQUAL_UINT(strlen("esp8266-13597726"), n);
}

static void test_formats_zero_and_max() {
  char buf[32];
  core::formatDeviceId(0u, buf, sizeof buf);
  TEST_ASSERT_EQUAL_STRING("esp8266-0", buf);
  core::formatDeviceId(0xFFFFFFFFu, buf, sizeof buf);
  TEST_ASSERT_EQUAL_STRING("esp8266-4294967295", buf);
}

static void test_too_small_buffer_returns_zero_and_empty() {
  char buf[8];
  TEST_ASSERT_EQUAL_UINT(0, core::formatDeviceId(123456u, buf, sizeof buf));
  TEST_ASSERT_EQUAL_STRING("", buf);
  TEST_ASSERT_EQUAL_UINT(0, core::formatDeviceId(1u, nullptr, 10));
}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_formats_decimal_chip_id);
  RUN_TEST(test_formats_zero_and_max);
  RUN_TEST(test_too_small_buffer_returns_zero_and_empty);
  return UNITY_END();
}
