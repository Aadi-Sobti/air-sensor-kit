// When to upload and how to back off. Pure C++ (native-testable).
// firmware spec: HTTP timeout >= 15 s; retry with exponential backoff PLUS random jitter so a neighborhood of
// sensors coming back after an outage doesn't hit the server at once.
#pragma once
#include <cstdint>

namespace core {

enum class UploadOutcome {
  kOk,             // 2xx
  kClockSkew,      // 401 clock_skew: re-sync NTP, retry soon
  kRejected,       // 401 bad_signature / 400: our bug or a key problem; retry slowly
  kNotRegistered,  // 403: not allowlisted / retired; retry hourly (factory may register it later)
  kRateLimited,    // 429: honor retry_after
  kNetworkError,   // DNS/TLS/timeout/5xx: back off
};

class UploadPolicy {
 public:
  static constexpr uint32_t kIntervalMs = 150000;       // provisional decision #6
  static constexpr uint32_t kBackoffBaseMs = 15000;
  static constexpr uint32_t kBackoffMaxMs = 10UL * 60 * 1000;
  static constexpr uint32_t kNotRegisteredMs = 60UL * 60 * 1000;

  // `rand01` returns a uniform value in [0,1) (hardware RNG on the device, fixed in tests).
  explicit UploadPolicy(double (*rand01)()) : rand01_(rand01) {}
  void begin(uint32_t nowMs);
  bool due(uint32_t nowMs) const { return static_cast<int32_t>(nowMs - nextAtMs_) >= 0; }
  // Records the result and schedules the next attempt. retryAfterS is used for kRateLimited.
  void onResult(UploadOutcome o, uint32_t nowMs, uint32_t retryAfterS = 0);
  // Upload as soon as possible (e.g. a claim is waiting on the website), unless we're backing off failures.
  void requestSoon(uint32_t nowMs) {
    if (failures_ == 0) nextAtMs_ = nowMs;
  }
  uint32_t nextInMs(uint32_t nowMs) const { return due(nowMs) ? 0 : nextAtMs_ - nowMs; }
  uint32_t consecutiveFailures() const { return failures_; }
  bool enrolled() const { return enrolled_; }
  void setEnrolled(bool e) { enrolled_ = e; }
  bool needsTimeResync() const { return resync_; }
  void clearTimeResync() { resync_ = false; }

 private:
  uint32_t jitter(uint32_t ms);  // ms * [0.5, 1.5)
  double (*rand01_)();
  uint32_t nextAtMs_ = 0;
  uint32_t failures_ = 0;
  bool enrolled_ = false;
  bool resync_ = false;
};

}  // namespace core
