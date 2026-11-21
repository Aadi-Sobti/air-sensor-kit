// PMS5003 driver: passive mode (we ask for each reading), warm-up discard, averaging, error counters.
#pragma once
#include "pms5003.h"
#include "pms_link.h"

class PmsDriver {
 public:
  explicit PmsDriver(PmsLink& link) : link_(link) {}
  void begin(uint32_t nowMs);
  // Call often from loop(): sends read requests, drains bytes, handles silence. Non-blocking.
  void poll(uint32_t nowMs);
  void sleep();
  void wake(uint32_t nowMs);
  void takeAverage(core::PmsAverage& out) { avg_.take(out); }
  const core::PmsStats& stats() const { return parser_.stats(); }
  uint32_t warmupDiscards() const { return avg_.warmupDiscards(); }
  uint32_t timeouts() const { return timeouts_; }
  // Frames that arrived without a read request: the sensor rebooted into active mode (its power-up
  // default). We switch it back to passive and restart the warm-up.
  uint32_t unsolicited() const { return unsolicited_; }
  bool hasLast() const { return hasLast_; }
  // A frame arrived recently (sensor wired, powered, and answering).
  bool healthy(uint32_t nowMs) const { return hasLast_ && nowMs - lastGood_ < kSilenceMs; }
  const core::PmsFrame& last() const { return last_; }
  const char* linkName() const { return link_.name(); }

  static constexpr uint32_t kReadPeriodMs = 2500;  // passive-mode request period
  static constexpr uint32_t kSilenceMs = 15000;    // no frame this long -> re-init the sensor
  static constexpr uint32_t kGapResetMs = 200;     // a 32-byte frame takes ~33 ms at 9600; longer gap = drop partial

 private:
  void send(core::PmsCommand c);
  PmsLink& link_;
  core::PmsParser parser_;
  core::PmsAverager avg_;
  core::PmsFrame last_{};
  bool hasLast_ = false;
  bool asleep_ = false;
  uint32_t lastRequest_ = 0, lastFrame_ = 0, lastByte_ = 0, lastGood_ = 0;
  uint32_t timeouts_ = 0;
  uint32_t unsolicited_ = 0;
  bool requestOutstanding_ = false;
  void reinit(uint32_t nowMs);
};
