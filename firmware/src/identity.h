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
// Factory tool (M9): store the backend-assigned short code in /identity and its backup. Returns false on a write
// failure (the old file stays valid: writes are atomic).
bool saveShortCode(Identity& id, const std::string& code);
const char* identityStatusName(IdentityStatus s);
// Uploads (M4) and setup must refuse to run unless this is true.
inline bool identityUsable(IdentityStatus s) {
  return s == IdentityStatus::kLoaded || s == IdentityStatus::kRestoredFromBackup || s == IdentityStatus::kCreated;
}
