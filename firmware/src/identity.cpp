#include "identity.h"

#include <Arduino.h>

#include "codes.h"
#include "device_id.h"
#include "kvstore.h"
#include "storage_fs.h"

static const char* kPath = "/identity";
static const uint16_t kSchema = 1;

const char* identityStatusName(IdentityStatus s) {
  switch (s) {
    case IdentityStatus::kLoaded: return "loaded";
    case IdentityStatus::kCreated: return "created";
    case IdentityStatus::kRecreatedAfterCorruption: return "recreated_after_corruption";
    case IdentityStatus::kSaveFailed: return "save_failed";
  }
  return "?";
}

IdentityStatus loadOrCreateIdentity(Identity& out) {
  char id[24];
  core::formatDeviceId(ESP.getChipId(), id, sizeof id);
  out.deviceId = id;

  core::KvRecord rec;
  uint16_t schema = 0;
  core::LoadResult r = core::loadRecord(fileStore(), kPath, rec, schema);
  if ((r == core::LoadResult::kOk || r == core::LoadResult::kRecoveredFromTmp) &&
      rec.get("device_id") == out.deviceId && rec.get("secret").size() == 64 &&
      rec.get("setup_pw").size() == core::kSetupPasswordLen) {
    out.secretHex = rec.get("secret");
    out.setupPassword = rec.get("setup_pw");
    out.shortCode = rec.get("short_code");
    return IdentityStatus::kLoaded;
  }
  bool corrupt = (r == core::LoadResult::kCorrupt) || (r != core::LoadResult::kMissing);
  if (corrupt) fileStore().rename(kPath, "/identity.bad");  // keep for diagnosis; backend must re-enroll

  // ESP8266 hardware RNG (RANDOM_REG32), true random when the RF subsystem is on; WiFi is off here, but the
  // core's ESP.random() still mixes the hardware register. 32-byte secret + setup password.
  uint8_t secret[32];
  ESP.random(secret, sizeof secret);
  uint8_t rnd[64];
  std::string pw;
  while (pw.empty()) {
    ESP.random(rnd, sizeof rnd);
    pw = core::makeCode(rnd, sizeof rnd, core::kSetupPasswordLen);
  }
  out.secretHex = core::toHex(secret, sizeof secret);
  out.setupPassword = pw;
  out.shortCode.clear();
  memset(secret, 0, sizeof secret);

  core::KvRecord nrec;
  nrec.set("device_id", out.deviceId);
  nrec.set("secret", out.secretHex);
  nrec.set("setup_pw", out.setupPassword);
  nrec.set("short_code", out.shortCode);
  if (!core::saveRecord(fileStore(), kPath, nrec, kSchema)) return IdentityStatus::kSaveFailed;
  return corrupt ? IdentityStatus::kRecreatedAfterCorruption : IdentityStatus::kCreated;
}
