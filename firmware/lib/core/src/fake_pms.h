// Fake PMS5003: synthesizes a realistic byte stream (clean air, smoke spikes, bad checksums, garbage)
// so the whole pipeline runs without a sensor. Deterministic for a given seed. Pure C++.
#pragma once
#include <cstddef>
#include <cstdint>

#include "pms5003.h"

namespace core {

struct FakePmsOptions {
  uint32_t seed = 12345;
  uint16_t badChecksumEvery = 50;  // 1 in N frames gets a corrupted checksum (0 = never)
  uint16_t garbageEvery = 40;      // 1 in N frames is preceded by a few garbage bytes (0 = never)
  uint32_t spikePeriod = 600;      // frames per cycle (0 = no spikes)
  uint32_t spikeLength = 60;       // frames of smoke at the start of each cycle's second half
  uint16_t baselinePm25 = 8;
  uint16_t spikePm25 = 180;
};

class FakePms {
 public:
  explicit FakePms(const FakePmsOptions& o = FakePmsOptions()) : o_(o), rng_(o.seed ? o.seed : 1) {}
  // Writes the bytes for the next frame (possibly with garbage first) into out; returns the count.
  // out must hold at least kFakePmsMaxBurst bytes.
  size_t nextBurst(uint8_t* out);
  // The clean values of the last frame generated (what a correct parser should decode, if not corrupted).
  const PmsFrame& lastFrame() const { return last_; }
  bool lastWasCorrupted() const { return lastCorrupt_; }
  uint32_t frameIndex() const { return n_; }
  bool inSpike(uint32_t idx) const;

  static constexpr size_t kMaxGarbage = 5;
  static constexpr size_t kMaxBurst = kMaxGarbage + kPmsFrameSize;

 private:
  uint32_t rand();
  FakePmsOptions o_;
  uint32_t rng_;
  uint32_t n_ = 0;
  PmsFrame last_{};
  bool lastCorrupt_ = false;
};

}  // namespace core
