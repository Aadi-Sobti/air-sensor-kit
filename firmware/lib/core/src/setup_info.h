// Small, security-relevant rules kept here so they're unit-tested:
//  - the "PFCMD SETUPINFO" serial line command (prints the setup AP password) and when it's allowed;
//  - phone-setup info (address/ZIP/indoor) goes out once in a signed upload and is cleared only after a 2xx.
#pragma once
#include <cstddef>
#include <cstdint>
#include <string>

#include "upload_payload.h"
#include "upload_policy.h"

namespace core {

// Line parser for text commands mixed with Improv binary frames on the same serial port. A line counts only
// if every byte since the last line end was printable ASCII and it fits; anything else poisons the line until
// the next \n or \r (so stale buffer contents can never match).
class CommandLine {
 public:
  // Returns true when a complete, clean line equal to `command` just ended.
  bool feed(uint8_t b, const char* command);

 private:
  char buf_[24] = {0};
  size_t len_ = 0;
  bool bad_ = false;
};

// Setup info may be shown while the board has no factory short code, or within 60 s of boot.
bool setupInfoAllowed(bool hasShortCode, uint32_t uptimeMs);

// Phone-setup info. Returns true if it was attached to this upload.
bool attachSetupInfo(UploadInfo& info, bool pending, const std::string& address, const std::string& zip, bool indoor);
// Clear the device's copy only when it was attached AND the server accepted the upload.
inline bool shouldClearSetupInfo(bool attached, UploadOutcome o) { return attached && o == UploadOutcome::kOk; }

}  // namespace core
