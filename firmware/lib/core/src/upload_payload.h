// Builds the JSON body for POST /api/v1/ingest. Must match backend/functions/src/lib/payload.ts.
#pragma once
#include <cstdint>
#include <string>
#include <utility>
#include <vector>

#include "pms5003.h"

namespace core {

struct UploadReading {
  uint32_t ts;  // unix seconds at the end of the averaging interval
  PmsAverage avg;
};

struct UploadInfo {
  std::string fw;
  uint32_t uptimeS = 0;
  int rssi = 0;
  std::vector<std::pair<std::string, uint32_t>> errors;  // keys: [a-z_]{1,24}
  // Setup info: sent once (first upload after setup), then cleared.
  bool hasSetup = false;
  std::string address, zip;
  bool indoor = false;
  std::string claimTokenHash;  // 64 hex chars or empty
};

std::string jsonEscape(const std::string& s);
std::string buildUploadJson(const UploadInfo& info, const std::vector<UploadReading>& readings);

}  // namespace core
