// Unsent readings kept in RAM while uploads fail (short outages). Persistent offline buffering is phase 2.
#pragma once
#include <cstddef>
#include <cstdint>
#include <vector>

#include "upload_payload.h"

namespace core {

class PendingReadings {
 public:
  static constexpr size_t kMax = 8;  // 20 min at 2.5 min per reading; ~8 x 0.3 KB of JSON
  void push(const UploadReading& r) {
    if (items_.size() >= kMax) {
      items_.erase(items_.begin());
      dropped_++;
    }
    items_.push_back(r);
  }
  const std::vector<UploadReading>& items() const { return items_; }
  void clear() { items_.clear(); }
  bool empty() const { return items_.empty(); }
  uint32_t dropped() const { return dropped_; }

 private:
  std::vector<UploadReading> items_;
  uint32_t dropped_ = 0;
};

}  // namespace core
