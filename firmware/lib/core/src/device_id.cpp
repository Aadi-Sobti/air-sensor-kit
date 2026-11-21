#include "device_id.h"

#include <cstdio>

namespace core {

size_t formatDeviceId(uint32_t chipId, char* out, size_t outSize) {
  if (out == nullptr || outSize == 0) return 0;
  int n = std::snprintf(out, outSize, "esp8266-%lu", static_cast<unsigned long>(chipId));
  if (n < 0 || static_cast<size_t>(n) >= outSize) {
    out[0] = '\0';
    return 0;
  }
  return static_cast<size_t>(n);
}

}  // namespace core
