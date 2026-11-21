#include "setup_info.h"

#include <cstring>

namespace core {

bool CommandLine::feed(uint8_t b, const char* command) {
  if (b == '\n' || b == '\r') {
    bool match = !bad_ && len_ > 0 && std::strcmp(buf_, command) == 0;
    len_ = 0;
    bad_ = false;
    buf_[0] = 0;
    return match;
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
