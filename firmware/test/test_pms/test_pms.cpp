#include <unity.h>

#include <cstring>
#include <vector>

#include "fake_pms.h"
#include "pms5003.h"

using namespace core;

void setUp() {}
void tearDown() {}

// Hand-picked clean-air values; checksum computed per the datasheet by encodePmsFrame.
static PmsFrame sample() {
  PmsFrame f{};
  f.pm1_cf1 = 5; f.pm25_cf1 = 9; f.pm10_cf1 = 12;
  f.pm1_atm = 5; f.pm25_atm = 9; f.pm10_atm = 12;
  const uint16_t c[6] = {1500, 450, 80, 10, 2, 1};
  for (int i = 0; i < 6; i++) f.counts[i] = c[i];
  return f;
}

static int feedAll(PmsParser& p, const uint8_t* b, size_t n, std::vector<PmsFrame>* frames = nullptr) {
  int got = 0;
  PmsFrame f{};
  for (size_t i = 0; i < n; i++) {
    if (p.feed(b[i], f)) {
      got++;
      if (frames) frames->push_back(f);
    }
  }
  return got;
}

static void test_encode_matches_datasheet_layout() {
  uint8_t b[32];
  encodePmsFrame(sample(), b);
  TEST_ASSERT_EQUAL_HEX8(0x42, b[0]);
  TEST_ASSERT_EQUAL_HEX8(0x4D, b[1]);
  TEST_ASSERT_EQUAL_UINT8(0, b[2]);
  TEST_ASSERT_EQUAL_UINT8(28, b[3]);
  TEST_ASSERT_EQUAL_UINT8(9, b[4 + 3]);   // data2 low = PM2.5 CF=1
  TEST_ASSERT_EQUAL_UINT8(0x05, b[4 + 12]);  // data7 high: 1500 = 0x05DC
  TEST_ASSERT_EQUAL_UINT8(0xDC, b[4 + 13]);
  uint16_t s = 0;
  for (int i = 0; i < 30; i++) s += b[i];
  TEST_ASSERT_EQUAL_UINT16(s, (b[30] << 8) | b[31]);
}

static void test_good_frame_decodes_all_fields() {
  uint8_t b[32];
  encodePmsFrame(sample(), b);
  PmsParser p;
  std::vector<PmsFrame> fr;
  TEST_ASSERT_EQUAL_INT(1, feedAll(p, b, 32, &fr));
  TEST_ASSERT_EQUAL_UINT16(9, fr[0].pm25_cf1);
  TEST_ASSERT_EQUAL_UINT16(12, fr[0].pm10_atm);
  TEST_ASSERT_EQUAL_UINT16(1500, fr[0].counts[0]);
  TEST_ASSERT_EQUAL_UINT16(1, fr[0].counts[5]);
  TEST_ASSERT_EQUAL_UINT32(1, p.stats().frames_ok);
  TEST_ASSERT_EQUAL_UINT32(0, p.stats().checksum_errors);
  PmsFrame d{};
  TEST_ASSERT_TRUE(decodePmsFrame(b, 32, d));
  TEST_ASSERT_EQUAL_UINT16(450, d.counts[1]);
}

static void test_bad_checksum_dropped_and_counted_then_recovers() {
  uint8_t b[64];
  encodePmsFrame(sample(), b);
  b[31] ^= 0x01;
  encodePmsFrame(sample(), b + 32);
  PmsParser p;
  TEST_ASSERT_EQUAL_INT(1, feedAll(p, b, 64));
  TEST_ASSERT_EQUAL_UINT32(1, p.stats().checksum_errors);
  TEST_ASSERT_EQUAL_UINT32(1, p.stats().frames_ok);
  PmsFrame d{};
  TEST_ASSERT_FALSE(decodePmsFrame(b, 32, d));
}

static void test_garbage_before_frame_is_skipped() {
  uint8_t b[40] = {0x00, 0x42, 0x13, 0x4D, 0xFF, 0x42, 0x42, 0x10};
  encodePmsFrame(sample(), b + 8);
  PmsParser p;
  TEST_ASSERT_EQUAL_INT(1, feedAll(p, b, 40));
  TEST_ASSERT_EQUAL_UINT32(0, p.stats().checksum_errors);
  TEST_ASSERT_TRUE(p.stats().bytes_discarded >= 7);
}

static void test_bad_length_resyncs() {
  uint8_t b[36] = {0x42, 0x4D, 0x00, 0x99};
  encodePmsFrame(sample(), b + 4);
  PmsParser p;
  TEST_ASSERT_EQUAL_INT(1, feedAll(p, b, 36));
  TEST_ASSERT_EQUAL_UINT32(1, p.stats().length_errors);
}

static void test_dropped_byte_finds_next_header_inside_broken_frame() {
  // First frame loses 10 bytes in the middle (SoftwareSerial overrun); the next frame starts inside
  // what the parser thinks is still frame 1. It must still be found.
  uint8_t a[32], c[32], s[54];
  encodePmsFrame(sample(), a);
  PmsFrame f2 = sample();
  f2.pm25_cf1 = 77;
  encodePmsFrame(f2, c);
  memcpy(s, a, 22);  // truncated frame 1
  memcpy(s + 22, c, 32);
  PmsParser p;
  std::vector<PmsFrame> fr;
  TEST_ASSERT_EQUAL_INT(1, feedAll(p, s, sizeof s, &fr));
  TEST_ASSERT_EQUAL_UINT16(77, fr[0].pm25_cf1);
  TEST_ASSERT_EQUAL_UINT32(1, p.stats().checksum_errors);
}

static void test_partial_frame_waits_then_completes() {
  uint8_t b[32];
  encodePmsFrame(sample(), b);
  PmsParser p;
  TEST_ASSERT_EQUAL_INT(0, feedAll(p, b, 17));
  TEST_ASSERT_TRUE(p.midFrame());
  TEST_ASSERT_EQUAL_INT(1, feedAll(p, b + 17, 15));
  TEST_ASSERT_FALSE(p.midFrame());
}

static void test_reset_drops_partial_frame() {
  uint8_t b[64];
  encodePmsFrame(sample(), b);
  encodePmsFrame(sample(), b + 32);
  PmsParser p;
  feedAll(p, b, 20);
  p.reset();
  TEST_ASSERT_EQUAL_INT(1, feedAll(p, b + 32, 32));
  TEST_ASSERT_EQUAL_UINT32(0, p.stats().checksum_errors);
}

static void test_short_ack_frame_is_ignored_not_an_error() {
  uint8_t b[40] = {0x42, 0x4D, 0x00, 0x04, 0xE1, 0x00};
  uint16_t s = 0;
  for (int i = 0; i < 6; i++) s += b[i];
  b[6] = s >> 8;
  b[7] = s & 0xFF;
  encodePmsFrame(sample(), b + 8);
  PmsParser p;
  TEST_ASSERT_EQUAL_INT(1, feedAll(p, b, 40));
  TEST_ASSERT_EQUAL_UINT32(1, p.stats().short_frames);
  TEST_ASSERT_EQUAL_UINT32(0, p.stats().checksum_errors + p.stats().length_errors);
}

static void test_commands_match_datasheet() {
  // 0x42 0x4D CMD DATAH DATAL LRCH LRCL; LRC = sum of preceding bytes (datasheet Appendix II)
  struct { PmsCommand c; uint8_t want[7]; } cases[] = {
      {PmsCommand::kRead, {0x42, 0x4D, 0xE2, 0x00, 0x00, 0x01, 0x71}},
      {PmsCommand::kPassiveMode, {0x42, 0x4D, 0xE1, 0x00, 0x00, 0x01, 0x70}},
      {PmsCommand::kActiveMode, {0x42, 0x4D, 0xE1, 0x00, 0x01, 0x01, 0x71}},
      {PmsCommand::kSleep, {0x42, 0x4D, 0xE4, 0x00, 0x00, 0x01, 0x73}},
      {PmsCommand::kWake, {0x42, 0x4D, 0xE4, 0x00, 0x01, 0x01, 0x74}},
  };
  for (auto& tc : cases) {
    uint8_t out[7];
    buildPmsCommand(tc.c, out);
    TEST_ASSERT_EQUAL_HEX8_ARRAY(tc.want, out, 7);
  }
}

static void test_averager_warmup_discard_and_stats() {
  PmsAverager avg(30000);
  avg.markWake(1000);
  PmsFrame f = sample();
  TEST_ASSERT_FALSE(avg.add(f, 1000));
  TEST_ASSERT_FALSE(avg.add(f, 30999));
  TEST_ASSERT_EQUAL_UINT32(2, avg.warmupDiscards());
  f.pm25_cf1 = 10; f.pm25_atm = 10;
  TEST_ASSERT_TRUE(avg.add(f, 31000));
  f.pm25_cf1 = 20; f.pm25_atm = 18;
  TEST_ASSERT_TRUE(avg.add(f, 33000));
  f.pm25_cf1 = 6; f.pm25_atm = 6;
  TEST_ASSERT_TRUE(avg.add(f, 35000));
  PmsAverage a;
  avg.take(a);
  TEST_ASSERT_EQUAL_UINT16(3, a.samples);
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 12.0f, a.pm25_cf1);
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 11.333f, a.pm25_atm);
  TEST_ASSERT_EQUAL_UINT16(6, a.pm25_cf1_min);
  TEST_ASSERT_EQUAL_UINT16(20, a.pm25_cf1_max);
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 1500.0f, a.counts[0]);
  avg.take(a);
  TEST_ASSERT_EQUAL_UINT16(0, a.samples);
}

static void test_averager_warmup_across_millis_wrap() {
  PmsAverager avg(30000);
  avg.markWake(0xFFFFF000u);  // ~4 s before millis() wraps
  TEST_ASSERT_FALSE(avg.add(sample(), 0x00000100u));  // ~4.3 s after wake
  TEST_ASSERT_TRUE(avg.add(sample(), 0xFFFFF000u + 30000u));
}

static void test_no_wake_means_no_discard() {
  PmsAverager avg;
  TEST_ASSERT_TRUE(avg.add(sample(), 5));
}

static void test_fake_stream_parses_with_expected_errors_and_spikes() {
  FakePmsOptions o;
  o.seed = 7;
  FakePms fake(o);
  PmsParser p;
  uint8_t buf[FakePms::kMaxBurst];
  int frames = 0, corrupt = 0, spikeFrames = 0, mismatches = 0;
  for (int i = 0; i < 1200; i++) {
    size_t n = fake.nextBurst(buf);
    std::vector<PmsFrame> fr;
    int got = feedAll(p, buf, n, &fr);
    if (fake.lastWasCorrupted()) {
      corrupt++;
      TEST_ASSERT_EQUAL_INT(0, got);
    } else {
      TEST_ASSERT_EQUAL_INT(1, got);
      frames++;
      if (fr[0].pm25_cf1 != fake.lastFrame().pm25_cf1) mismatches++;
      if (fr[0].pm25_cf1 > 100) spikeFrames++;
    }
  }
  TEST_ASSERT_EQUAL_INT(0, mismatches);
  TEST_ASSERT_TRUE(corrupt > 5 && corrupt < 60);
  TEST_ASSERT_EQUAL_UINT32(static_cast<uint32_t>(corrupt), p.stats().checksum_errors);
  TEST_ASSERT_EQUAL_UINT32(static_cast<uint32_t>(frames), p.stats().frames_ok);
  TEST_ASSERT_TRUE(spikeFrames > 80);  // 2 cycles x 60 spike frames, minus corrupted ones
  TEST_ASSERT_TRUE(p.stats().bytes_discarded > 0);  // garbage bursts happened
}

static void test_fake_is_deterministic() {
  FakePms a, b;
  uint8_t x[FakePms::kMaxBurst], y[FakePms::kMaxBurst];
  for (int i = 0; i < 50; i++) {
    size_t n = a.nextBurst(x);
    TEST_ASSERT_EQUAL_UINT(n, b.nextBurst(y));
    TEST_ASSERT_EQUAL_UINT8_ARRAY(x, y, n);
  }
}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_encode_matches_datasheet_layout);
  RUN_TEST(test_good_frame_decodes_all_fields);
  RUN_TEST(test_bad_checksum_dropped_and_counted_then_recovers);
  RUN_TEST(test_garbage_before_frame_is_skipped);
  RUN_TEST(test_bad_length_resyncs);
  RUN_TEST(test_dropped_byte_finds_next_header_inside_broken_frame);
  RUN_TEST(test_partial_frame_waits_then_completes);
  RUN_TEST(test_reset_drops_partial_frame);
  RUN_TEST(test_short_ack_frame_is_ignored_not_an_error);
  RUN_TEST(test_commands_match_datasheet);
  RUN_TEST(test_averager_warmup_discard_and_stats);
  RUN_TEST(test_averager_warmup_across_millis_wrap);
  RUN_TEST(test_no_wake_means_no_discard);
  RUN_TEST(test_fake_stream_parses_with_expected_errors_and_spikes);
  RUN_TEST(test_fake_is_deterministic);
  return UNITY_END();
}
