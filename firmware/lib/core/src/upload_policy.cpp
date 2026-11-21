#include "upload_policy.h"

namespace core {

uint32_t UploadPolicy::jitter(uint32_t ms) {
  double r = rand01_ ? rand01_() : 0.5;
  if (r < 0) r = 0;
  if (r >= 1) r = 0.999999;
  return static_cast<uint32_t>(ms * (0.5 + r));
}

void UploadPolicy::begin(uint32_t nowMs) {
  // First upload after one full averaging interval, spread out so devices that power up together
  // (e.g. after a neighborhood outage) don't all upload in the same second.
  nextAtMs_ = nowMs + jitter(kIntervalMs);
  failures_ = 0;
}

void UploadPolicy::onResult(UploadOutcome o, uint32_t nowMs, uint32_t retryAfterS) {
  uint32_t wait;
  switch (o) {
    case UploadOutcome::kOk:
      failures_ = 0;
      enrolled_ = true;
      nextAtMs_ = nowMs + kIntervalMs;  // steady cadence; the averaging window matches it
      return;
    case UploadOutcome::kRateLimited:
      failures_++;
      wait = retryAfterS ? retryAfterS * 1000UL : kBackoffMaxMs;
      if (wait > 60UL * 60 * 1000) wait = 60UL * 60 * 1000;
      nextAtMs_ = nowMs + jitter(wait);
      return;
    case UploadOutcome::kNotRegistered:
      failures_++;
      nextAtMs_ = nowMs + jitter(kNotRegisteredMs);
      return;
    case UploadOutcome::kClockSkew:
      resync_ = true;
      // fallthrough: back off like any failure
    case UploadOutcome::kRejected:
    case UploadOutcome::kNetworkError:
    default: {
      failures_++;
      uint32_t exp = failures_ > 6 ? 6 : failures_ - 1;  // 15 s, 30 s, 1, 2, 4, 8 -> cap 10 min
      wait = kBackoffBaseMs << exp;
      if (wait > kBackoffMaxMs) wait = kBackoffMaxMs;
      nextAtMs_ = nowMs + jitter(wait);
      return;
    }
  }
}

}  // namespace core
