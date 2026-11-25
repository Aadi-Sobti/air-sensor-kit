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

// Why the board last restarted, added to the upload's "errors" map (the backend already accepts any [a-z_] key).
// reason = rst_info.reason from the ESP8266 SDK (tools/sdk/include/user_interface.h, enum rst_reason):
// 0 power on, 1 hardware watchdog, 2 exception (crash), 3 software watchdog, 4 software restart (ESP.restart),
// 5 deep-sleep wake, 6 reset pin. For crashes and watchdogs we also send the exception cause and the crash address
// (epc1), which decodes against the release ELF to the function that crashed.
void appendResetInfo(std::vector<std::pair<std::string, uint32_t>>& errors, uint32_t reason, uint32_t exccause,
                     uint32_t epc1);

std::string jsonEscape(const std::string& s);
std::string buildUploadJson(const UploadInfo& info, const std::vector<UploadReading>& readings);

}  // namespace core
