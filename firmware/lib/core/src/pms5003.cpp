#include "pms5003.h"

namespace core {

namespace {
uint16_t be16(const uint8_t* p) { return static_cast<uint16_t>((p[0] << 8) | p[1]); }
void putBe16(uint8_t* p, uint16_t v) {
  p[0] = static_cast<uint8_t>(v >> 8);
  p[1] = static_cast<uint8_t>(v & 0xFF);
}
uint16_t sum(const uint8_t* p, size_t n) {
  uint16_t s = 0;
  for (size_t i = 0; i < n; i++) s = static_cast<uint16_t>(s + p[i]);
  return s;
}
void fillFrame(const uint8_t* bytes, PmsFrame& f) {
  const uint8_t* d = bytes + 4;
  f.pm1_cf1 = be16(d + 0);
  f.pm25_cf1 = be16(d + 2);
  f.pm10_cf1 = be16(d + 4);
  f.pm1_atm = be16(d + 6);
  f.pm25_atm = be16(d + 8);
  f.pm10_atm = be16(d + 10);
  for (size_t i = 0; i < kPmsCountBins; i++) f.counts[i] = be16(d + 12 + 2 * i);
}
constexpr uint16_t kShortFrameLen = 4;
}  // namespace

PmsParser::Result PmsParser::step(uint8_t b, PmsFrame& out) {
  if (len_ == 0) {
    if (b != kPmsStart1) {
      stats_.bytes_discarded++;
      return Result::kNeedMore;
    }
    buf_[len_++] = b;
    return Result::kNeedMore;
  }
  if (len_ == 1) {
    if (b != kPmsStart2) {
      stats_.bytes_discarded++;  // the 0x42 we held
      len_ = 0;
      return step(b, out);  // b may itself be a 0x42
    }
    buf_[len_++] = b;
    return Result::kNeedMore;
  }
  buf_[len_++] = b;
  if (len_ == 4) {
    uint16_t fl = be16(buf_ + 2);
    if (fl != kPmsDataFrameLen && fl != kShortFrameLen) {
      stats_.length_errors++;
      return Result::kBad;
    }
  }
  if (len_ < 4) return Result::kNeedMore;
  uint16_t fl = be16(buf_ + 2);
  size_t total = 4 + fl;
  if (len_ < total) return Result::kNeedMore;
  uint16_t want = be16(buf_ + total - 2);
  uint16_t got = sum(buf_, total - 2);
  if (want != got) {
    stats_.checksum_errors++;
    return Result::kBad;
  }
  len_ = 0;
  if (fl == kShortFrameLen) {
    stats_.short_frames++;
    return Result::kShort;
  }
  fillFrame(buf_, out);
  stats_.frames_ok++;
  return Result::kFrame;
}

bool PmsParser::feed(uint8_t b, PmsFrame& out) {
  // Replay queue: after a bad frame, every buffered byte except the first 0x42 is re-scanned, so a real
  // header hidden inside a broken frame (e.g. after a dropped byte) isn't lost. Bounded: <= 2 frames.
  uint8_t q[2 * kPmsFrameSize];
  size_t qn = 0, i = 0;
  q[qn++] = b;
  bool got = false;
  while (i < qn) {
    Result r = step(q[i++], out);
    if (r == Result::kFrame) {
      got = true;
    } else if (r == Result::kBad) {
      stats_.bytes_discarded++;  // the 0x42 that started the bad frame
      uint8_t nq[2 * kPmsFrameSize];
      size_t nn = 0;
      for (size_t k = 1; k < len_; k++) nq[nn++] = buf_[k];
      for (size_t k = i; k < qn; k++) nq[nn++] = q[k];
      for (size_t k = 0; k < nn; k++) q[k] = nq[k];
      qn = nn;
      i = 0;
      len_ = 0;
    }
  }
  return got;
}

void buildPmsCommand(PmsCommand cmd, uint8_t out[kPmsCommandSize]) {
  uint8_t c = 0xE2, datal = 0x00;
  switch (cmd) {
    case PmsCommand::kRead: c = 0xE2; datal = 0x00; break;
    case PmsCommand::kPassiveMode: c = 0xE1; datal = 0x00; break;
    case PmsCommand::kActiveMode: c = 0xE1; datal = 0x01; break;
    case PmsCommand::kSleep: c = 0xE4; datal = 0x00; break;
    case PmsCommand::kWake: c = 0xE4; datal = 0x01; break;
  }
  out[0] = kPmsStart1;
  out[1] = kPmsStart2;
  out[2] = c;
  out[3] = 0x00;
  out[4] = datal;
  putBe16(out + 5, sum(out, 5));
}

bool decodePmsFrame(const uint8_t* bytes, size_t n, PmsFrame& out) {
  if (bytes == nullptr || n != kPmsFrameSize) return false;
  if (bytes[0] != kPmsStart1 || bytes[1] != kPmsStart2) return false;
  if (be16(bytes + 2) != kPmsDataFrameLen) return false;
  if (be16(bytes + 30) != sum(bytes, 30)) return false;
  fillFrame(bytes, out);
  return true;
}

void encodePmsFrame(const PmsFrame& f, uint8_t out[kPmsFrameSize]) {
  out[0] = kPmsStart1;
  out[1] = kPmsStart2;
  putBe16(out + 2, kPmsDataFrameLen);
  uint8_t* d = out + 4;
  putBe16(d + 0, f.pm1_cf1);
  putBe16(d + 2, f.pm25_cf1);
  putBe16(d + 4, f.pm10_cf1);
  putBe16(d + 6, f.pm1_atm);
  putBe16(d + 8, f.pm25_atm);
  putBe16(d + 10, f.pm10_atm);
  for (size_t i = 0; i < kPmsCountBins; i++) putBe16(d + 12 + 2 * i, f.counts[i]);
  putBe16(d + 24, 0);  // reserved
  putBe16(out + 30, sum(out, 30));
}

bool PmsAverager::add(const PmsFrame& f, uint32_t nowMs) {
  if (awake_ && static_cast<uint32_t>(nowMs - wakeMs_) < warmupMs_) {
    warmupDiscards_++;
    return false;
  }
  awake_ = false;  // warm-up over; no need to keep comparing (avoids millis() wrap surprises)
  if (n_ == 0xFFFF) return false;
  const uint16_t v[6] = {f.pm1_cf1, f.pm25_cf1, f.pm10_cf1, f.pm1_atm, f.pm25_atm, f.pm10_atm};
  for (size_t i = 0; i < 6; i++) sum_[i] += v[i];
  for (size_t i = 0; i < kPmsCountBins; i++) sum_[6 + i] += f.counts[i];
  if (n_ == 0) {
    min25cf_ = max25cf_ = f.pm25_cf1;
    min25atm_ = max25atm_ = f.pm25_atm;
  } else {
    if (f.pm25_cf1 < min25cf_) min25cf_ = f.pm25_cf1;
    if (f.pm25_cf1 > max25cf_) max25cf_ = f.pm25_cf1;
    if (f.pm25_atm < min25atm_) min25atm_ = f.pm25_atm;
    if (f.pm25_atm > max25atm_) max25atm_ = f.pm25_atm;
  }
  n_++;
  return true;
}

void PmsAverager::take(PmsAverage& out) {
  out = PmsAverage{};
  out.samples = n_;
  if (n_ > 0) {
    const float n = static_cast<float>(n_);
    out.pm1_cf1 = sum_[0] / n;
    out.pm25_cf1 = sum_[1] / n;
    out.pm10_cf1 = sum_[2] / n;
    out.pm1_atm = sum_[3] / n;
    out.pm25_atm = sum_[4] / n;
    out.pm10_atm = sum_[5] / n;
    for (size_t i = 0; i < kPmsCountBins; i++) out.counts[i] = sum_[6 + i] / n;
    out.pm25_cf1_min = min25cf_;
    out.pm25_cf1_max = max25cf_;
    out.pm25_atm_min = min25atm_;
    out.pm25_atm_max = max25atm_;
  }
  n_ = 0;
  for (auto& s : sum_) s = 0;
}

}  // namespace core
