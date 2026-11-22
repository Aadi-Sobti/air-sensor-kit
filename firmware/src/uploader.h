// Signed HTTPS uploads to /api/v1/ingest (BearSSL, pinned roots, NTP-synced clock).
#pragma once
#include <string>

#include "upload_payload.h"
#include "upload_policy.h"

struct UploadResult {
  core::UploadOutcome outcome;
  int httpCode;  // <0: transport error (BearSSL/HTTPClient code)
  uint32_t retryAfterS;
  uint32_t ms;
  uint32_t heapBefore, heapMin;
  int sslError;
  int accepted;  // readings the server stored (-1 unknown)
};

void uploaderBegin();
namespace BearSSL { class X509List; }
// The pinned root CAs (parsed once), shared with OTA downloads.
BearSSL::X509List* pinnedTrust();
UploadResult uploadNow(const std::string& deviceId, const std::string& secretHex, bool sendEnrollSecret,
                       const std::string& body);
