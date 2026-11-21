// Device identity: created once, survives setup resets. Secret and setup password are NEVER logged.
#pragma once
#include <string>

struct Identity {
  std::string deviceId;       // esp8266-<chipid>
  std::string secretHex;      // 32 random bytes (HMAC key for uploads, enrolled on first upload)
  std::string setupPassword;  // WPA2 password for the setup AP + QR sticker
  std::string shortCode;      // assigned by the factory tool (M9); empty until then
};

enum class IdentityStatus { kLoaded, kCreated, kRecreatedAfterCorruption, kSaveFailed };
IdentityStatus loadOrCreateIdentity(Identity& out);
const char* identityStatusName(IdentityStatus s);
