// Dev-only fake sensor link: answers passive-mode read requests with FakePms frames.
// Enabled by the dev-fake env (-DDEV_FAKE_PMS=1). Compiled only in dev envs (src/dev/).
#ifdef DEV_FAKE_PMS
#include <Arduino.h>

#include "fake_pms.h"
#include "pms5003.h"
#include "pms_link.h"

namespace {
class FakePmsLink : public PmsLink {
 public:
  void begin() override {}
  int available() override { return static_cast<int>(n_ - pos_); }
  int read() override { return pos_ < n_ ? buf_[pos_++] : -1; }
  void write(const uint8_t* b, size_t n) override {
    // A read request (0xE2) produces one frame (sometimes with garbage / bad checksum).
    if (n >= 3 && b[2] == 0xE2 && pos_ == n_) {
      n_ = fake_.nextBurst(buf_);
      pos_ = 0;
    }
  }
  const char* name() const override { return "fake"; }

 private:
  core::FakePms fake_;
  uint8_t buf_[core::FakePms::kMaxBurst];
  size_t n_ = 0, pos_ = 0;
};
FakePmsLink gFake;
}  // namespace

PmsLink* devPmsLink() { return &gFake; }
#endif
