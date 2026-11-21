// Plantower PMS5003 protocol: frame parser, host commands, interval averaging. Pure C++ (native-testable).
//
// Source: Plantower "PMS5003 series data manual" v2.3 (2016), Appendix I (active-mode 32-byte frame) and
// Appendix II (passive-mode host protocol). Verified 2026-11-21 from
// https://www.aqmd.gov/docs/default-source/aq-spec/resources-page/plantower-pms5003-manual_v2-3.pdf
//  - 9600 bps, no parity, 1 stop bit.
//  - Frame: 0x42 0x4D, frame length (16-bit BE) = 2x13+2 = 28, 13 data words (BE), check code (16-bit BE)
//    = sum of all bytes from start character 1 through data 13 low byte.
//  - Data 1-3: PM1.0/PM2.5/PM10 CF=1; 4-6: PM1.0/PM2.5/PM10 atmospheric; 7-12: particle counts beyond
//    0.3/0.5/1.0/2.5/5.0/10 um per 0.1 L; 13 reserved.
//  - Host command: 0x42 0x4D CMD DATAH DATAL LRCH LRCL, LRC = sum of all preceding bytes.
//    CMD 0xE2 read (passive), 0xE1 mode (DATAL 0 passive / 1 active), 0xE4 sleep (DATAL 0) / wake (1).
//  - "Stable data should be got at least 30 seconds after the sensor wakeup" -> warm-up discard.
// Not in the datasheet but seen on real sensors: mode/sleep commands are answered with a short frame
// (length 4). We accept any checksum-valid short frame (length 4) and ignore it; it is not an error.
#pragma once
#include <cstddef>
#include <cstdint>

namespace core {

constexpr uint8_t kPmsStart1 = 0x42;
constexpr uint8_t kPmsStart2 = 0x4D;
constexpr uint16_t kPmsDataFrameLen = 28;  // 2x13 + 2
constexpr size_t kPmsFrameSize = 32;
constexpr uint32_t kPmsWarmupMs = 30000;
constexpr size_t kPmsCountBins = 6;  // >0.3, >0.5, >1.0, >2.5, >5.0, >10 um per 0.1 L

struct PmsFrame {
  uint16_t pm1_cf1, pm25_cf1, pm10_cf1;
  uint16_t pm1_atm, pm25_atm, pm10_atm;
  uint16_t counts[kPmsCountBins];
};

struct PmsStats {
  uint32_t frames_ok = 0;
  uint32_t checksum_errors = 0;
  uint32_t length_errors = 0;
  uint32_t short_frames = 0;     // command acks (ignored)
  uint32_t bytes_discarded = 0;  // garbage skipped while looking for a header
  uint32_t partial_dropped = 0;  // frames cut short (gap/silence reset) and thrown away
};

// Byte-at-a-time parser. Resyncs after garbage, bad lengths, and bad checksums (re-scanning the bytes it
// had buffered, so a real header hidden inside a broken frame isn't lost). A partial frame simply waits
// for more bytes; call reset() after a long silence to drop it.
class PmsParser {
 public:
  // Returns true when a complete, checksum-valid data frame was decoded into `out`.
  bool feed(uint8_t b, PmsFrame& out);
  void reset() {
    if (len_ > 0) stats_.partial_dropped++;
    len_ = 0;
  }
  const PmsStats& stats() const { return stats_; }
  bool midFrame() const { return len_ > 0; }

 private:
  enum class Result { kNeedMore, kFrame, kShort, kBad };
  Result step(uint8_t b, PmsFrame& out);

  uint8_t buf_[kPmsFrameSize] = {};
  size_t len_ = 0;
  PmsStats stats_;
};

enum class PmsCommand : uint8_t { kRead, kPassiveMode, kActiveMode, kSleep, kWake };
constexpr size_t kPmsCommandSize = 7;
// Writes the 7-byte host command into out.
void buildPmsCommand(PmsCommand cmd, uint8_t out[kPmsCommandSize]);

// Decodes a full 32-byte data frame (header, length, checksum all checked). For tests and tools.
bool decodePmsFrame(const uint8_t* bytes, size_t n, PmsFrame& out);
// Encodes a frame (used by the fake sensor and tests). Writes 32 bytes.
void encodePmsFrame(const PmsFrame& f, uint8_t out[kPmsFrameSize]);

struct PmsAverage {
  uint16_t samples = 0;
  float pm1_cf1 = 0, pm25_cf1 = 0, pm10_cf1 = 0;
  float pm1_atm = 0, pm25_atm = 0, pm10_atm = 0;
  float counts[kPmsCountBins] = {};
  uint16_t pm25_cf1_min = 0, pm25_cf1_max = 0;
  uint16_t pm25_atm_min = 0, pm25_atm_max = 0;
};

// Averages frames over an interval. Frames within kPmsWarmupMs of the last wake are discarded and counted.
// Times are millis() values; wrap-around safe.
class PmsAverager {
 public:
  explicit PmsAverager(uint32_t warmupMs = kPmsWarmupMs) : warmupMs_(warmupMs) {}
  void markWake(uint32_t nowMs) { wakeMs_ = nowMs; awake_ = true; }
  // Returns false if the frame was discarded (warm-up).
  bool add(const PmsFrame& f, uint32_t nowMs);
  // Copies the current average into out (samples == 0 if nothing was collected) and starts a new interval.
  void take(PmsAverage& out);
  uint32_t warmupDiscards() const { return warmupDiscards_; }
  uint16_t pending() const { return n_; }

 private:
  uint32_t warmupMs_;
  uint32_t wakeMs_ = 0;
  bool awake_ = false;
  uint32_t warmupDiscards_ = 0;
  uint16_t n_ = 0;
  uint32_t sum_[6 + kPmsCountBins] = {};
  uint16_t min25cf_ = 0, max25cf_ = 0, min25atm_ = 0, max25atm_ = 0;
};

}  // namespace core
