// Device identity: created once, survives setup resets. Secret and setup password are NEVER logged.
#pragma once
#include <string>

struct Identity {
  std::string deviceId;       // esp8266-<chipid>; always set, even if storage fails
  std::string secretHex;      // 32 random bytes (HMAC key for uploads, enrolled on first upload)
  std::string setupPassword;  // WPA2 password for the setup AP + QR sticker
  std::string shortCode;      // assigned by the factory tool (M9); empty until then
};

enum class IdentityStatus { kLoaded, kRestoredFromBackup, kCreated, kLost, kStorageFailed };
IdentityStatus loadOrCreateIdentity(Identity& out);
const char* identityStatusName(IdentityStatus s);
// Uploads (M4) and setup must refuse to run unless this is true.
inline bool identityUsable(IdentityStatus s) {
  return s == IdentityStatus::kLoaded || s == IdentityStatus::kRestoredFromBackup || s == IdentityStatus::kCreated;
}
