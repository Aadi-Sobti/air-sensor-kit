#include "fake_pms.h"

namespace core {

uint32_t FakePms::rand() {  // xorshift32
  rng_ ^= rng_ << 13;
  rng_ ^= rng_ >> 17;
  rng_ ^= rng_ << 5;
  return rng_;
}

bool FakePms::inSpike(uint32_t idx) const {
  if (o_.spikePeriod == 0) return false;
  uint32_t pos = idx % o_.spikePeriod;
  uint32_t start = o_.spikePeriod / 2;
  return pos >= start && pos < start + o_.spikeLength;
}

size_t FakePms::nextBurst(uint8_t* out) {
  size_t n = 0;
  uint32_t idx = n_++;
  if (o_.garbageEvery && rand() % o_.garbageEvery == 0) {
    size_t g = 1 + rand() % kMaxGarbage;
    for (size_t i = 0; i < g; i++) {
      uint8_t b = static_cast<uint8_t>(rand());
      out[n++] = (b == kPmsStart1) ? 0x00 : b;  // garbage never starts a fake header
    }
  }
  uint16_t base = inSpike(idx) ? o_.spikePm25 : o_.baselinePm25;
  int noise = static_cast<int>(rand() % 5) - 2;  // -2..+2
  int pm25 = base + noise;
  if (pm25 < 0) pm25 = 0;
  PmsFrame f{};
  f.pm25_cf1 = static_cast<uint16_t>(pm25);
  f.pm1_cf1 = static_cast<uint16_t>(pm25 * 2 / 3);
  f.pm10_cf1 = static_cast<uint16_t>(pm25 + pm25 / 4 + 1);
  // Below ~30 ug/m3 the PMS5003 reports ATM == CF=1; above that ATM reads lower (roughly 2/3).
  auto atm = [](uint16_t v) { return v <= 30 ? v : static_cast<uint16_t>(30 + (v - 30) * 2 / 3); };
  f.pm1_atm = atm(f.pm1_cf1);
  f.pm25_atm = atm(f.pm25_cf1);
  f.pm10_atm = atm(f.pm10_cf1);
  uint32_t c03 = 150u * static_cast<uint32_t>(pm25) + 200u + rand() % 50;
  if (c03 > 65535u) c03 = 65535u;
  f.counts[0] = static_cast<uint16_t>(c03);
  f.counts[1] = static_cast<uint16_t>(c03 / 3);
  f.counts[2] = static_cast<uint16_t>(c03 / 12);
  f.counts[3] = static_cast<uint16_t>(c03 / 80);
  f.counts[4] = static_cast<uint16_t>(c03 / 400);
  f.counts[5] = static_cast<uint16_t>(c03 / 1500);
  last_ = f;
  encodePmsFrame(f, out + n);
  lastCorrupt_ = o_.badChecksumEvery && rand() % o_.badChecksumEvery == 0;
  if (lastCorrupt_) out[n + 30] ^= 0x5A;
  return n + kPmsFrameSize;
}

}  // namespace core
