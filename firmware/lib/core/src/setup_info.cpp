#include "setup_info.h"

#include <cstring>

namespace core {

bool CommandLine::feed(uint8_t b, const char* command) {
  return feedLine(b) && std::strcmp(last_, command) == 0;
}

bool CommandLine::feedLine(uint8_t b) {
  last_[0] = 0;
  if (b == '\n' || b == '\r') {
    bool clean = !bad_ && len_ > 0;
    if (clean) std::memcpy(last_, buf_, len_ + 1);
    len_ = 0;
    bad_ = false;
    buf_[0] = 0;
    return clean;
  }
  if (bad_) return false;
  if (b < 0x20 || b >= 0x7F || len_ >= sizeof buf_ - 1) {
    bad_ = true;
    len_ = 0;
    buf_[0] = 0;
    return false;
  }
  buf_[len_++] = static_cast<char>(b);
  buf_[len_] = 0;
  return false;
}

bool setupInfoAllowed(bool hasShortCode, uint32_t uptimeMs) { return !hasShortCode || uptimeMs < 60000; }

bool attachSetupInfo(UploadInfo& info, bool pending, const std::string& address, const std::string& zip, bool indoor) {
  if (!pending || address.empty() || zip.empty()) return false;
  info.hasSetup = true;
  info.address = address;
  info.zip = zip;
  info.indoor = indoor;
  return true;
}

}  // namespace core
