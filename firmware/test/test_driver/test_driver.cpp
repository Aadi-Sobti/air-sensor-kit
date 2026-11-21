#include <unity.h>

#include <deque>
#include <vector>

#include "pms5003.h"
#include "pms_driver.h"

using namespace core;

void setUp() {}
void tearDown() {}

// Mock sensor: records commands; in passive mode answers each read with one frame; can stream (active mode).
class MockLink : public PmsLink {
 public:
  std::vector<std::vector<uint8_t>> sent;
  std::deque<uint8_t> rx;
  bool answerReads = true;
  bool dead = false;
  uint16_t pm25 = 9;

  void begin() override {}
  int available() override { return static_cast<int>(rx.size()); }
  int read() override {
    if (rx.empty()) return -1;
    int b = rx.front();
    rx.pop_front();
    return b;
  }
  void write(const uint8_t* b, size_t n) override {
    sent.emplace_back(b, b + n);
    if (!dead && answerReads && n >= 3 && b[2] == 0xE2) pushFrame();
  }
  const char* name() const override { return "mock"; }
  void pushFrame(size_t cut = kPmsFrameSize) {
    PmsFrame f{};
    f.pm25_cf1 = f.pm25_atm = pm25;
    uint8_t buf[kPmsFrameSize];
    encodePmsFrame(f, buf);
    for (size_t i = 0; i < cut; i++) rx.push_back(buf[i]);
  }
  int count(uint8_t cmd, uint8_t datal) const {
    int c = 0;
    for (auto& s : sent)
      if (s.size() == 7 && s[2] == cmd && s[4] == datal) c++;
    return c;
  }
};

static void run(PmsDriver& d, uint32_t from, uint32_t to, uint32_t step = 5) {
  for (uint32_t t = from; t <= to; t += step) d.poll(t);
}

static void test_begin_sends_wake_and_passive_then_reads_every_2_5_s() {
  MockLink link;
  PmsDriver d(link);
  d.begin(0);
  TEST_ASSERT_EQUAL(1, link.count(0xE4, 0x01));
  TEST_ASSERT_EQUAL(1, link.count(0xE1, 0x00));
  run(d, 0, 60005);  // each answer is read on the poll after its request (+5 ms)
  TEST_ASSERT_EQUAL(24, link.count(0xE2, 0x00));  // 60 s / 2.5 s
  TEST_ASSERT_EQUAL_UINT32(24, d.stats().frames_ok);
  TEST_ASSERT_EQUAL_UINT32(0, d.unsolicited());
  TEST_ASSERT_TRUE(d.healthy(60005));
  PmsAverage a;
  d.takeAverage(a);
  TEST_ASSERT_EQUAL_UINT16(13, a.samples);  // 30.005..60.005 s
  TEST_ASSERT_EQUAL_UINT32(11, d.warmupDiscards());  // 2.505..27.505 s: fan spin-up
}

static void test_silence_reinits_and_restarts_warmup() {
  MockLink link;
  PmsDriver d(link);
  d.begin(0);
  run(d, 0, 40000);
  PmsAverage a;
  d.takeAverage(a);
  link.dead = true;  // unplugged
  run(d, 40005, 56000);
  d.takeAverage(a);  // drop the last good frame (answer to the 40.0 s request)
  TEST_ASSERT_EQUAL_UINT32(1, d.timeouts());
  TEST_ASSERT_FALSE(d.healthy(56000));
  TEST_ASSERT_EQUAL(2, link.count(0xE1, 0x00));  // passive re-sent
  link.dead = false;  // replugged: fan spins up again
  uint32_t before = d.warmupDiscards();
  run(d, 56005, 70000);
  d.takeAverage(a);
  TEST_ASSERT_EQUAL_UINT16(0, a.samples);  // all within 30 s of the re-init -> discarded
  TEST_ASSERT_TRUE(d.warmupDiscards() > before);
}

static void test_unsolicited_frames_reassert_passive_and_restart_warmup() {
  MockLink link;
  PmsDriver d(link);
  d.begin(0);
  run(d, 0, 40000);
  PmsAverage a;
  d.takeAverage(a);
  // Sensor power-cycles: back in active mode, streaming without being asked.
  link.answerReads = false;
  link.pm25 = 300;  // spin-up garbage values that must not be averaged
  link.pushFrame();
  run(d, 40005, 40100);
  TEST_ASSERT_EQUAL_UINT32(1, d.unsolicited());
  TEST_ASSERT_EQUAL(2, link.count(0xE1, 0x00));
  d.takeAverage(a);
  // Only the legit answer to the 40.0 s request counts; the unsolicited 300 ug/m3 frame is warm-up.
  TEST_ASSERT_EQUAL_UINT16(1, a.samples);
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 9.0f, a.pm25_cf1);
}

static void test_gap_drops_partial_frame_and_counts_it() {
  MockLink link;
  link.answerReads = false;
  PmsDriver d(link);
  d.begin(0);
  link.pushFrame(20);  // 12 bytes lost
  run(d, 0, 500);
  TEST_ASSERT_EQUAL_UINT32(1, d.stats().partial_dropped);
  link.pushFrame();
  run(d, 505, 1000);
  TEST_ASSERT_EQUAL_UINT32(1, d.stats().frames_ok);
}

static void test_sleep_drains_and_stops_requests() {
  MockLink link;
  PmsDriver d(link);
  d.begin(0);
  d.sleep();
  TEST_ASSERT_EQUAL(1, link.count(0xE4, 0x00));
  link.pushFrame();
  run(d, 0, 30000);
  TEST_ASSERT_EQUAL(0, link.count(0xE2, 0x00));
  TEST_ASSERT_EQUAL_UINT32(0, d.timeouts());
  TEST_ASSERT_EQUAL(0, link.available());
}

static void test_parser_reset_counts_partial() {
  PmsParser p;
  uint8_t b[32];
  PmsFrame f{};
  encodePmsFrame(f, b);
  for (int i = 0; i < 20; i++) p.feed(b[i], f);
  p.reset();
  p.reset();  // nothing buffered: not counted twice
  TEST_ASSERT_EQUAL_UINT32(1, p.stats().partial_dropped);
}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_begin_sends_wake_and_passive_then_reads_every_2_5_s);
  RUN_TEST(test_silence_reinits_and_restarts_warmup);
  RUN_TEST(test_unsolicited_frames_reassert_passive_and_restart_warmup);
  RUN_TEST(test_gap_drops_partial_frame_and_counts_it);
  RUN_TEST(test_sleep_drains_and_stops_requests);
  RUN_TEST(test_parser_reset_counts_partial);
  return UNITY_END();
}
