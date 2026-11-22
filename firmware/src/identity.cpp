#include "identity.h"

#include <Arduino.h>

#include "codes.h"
#include "device_id.h"
#include "entropy.h"
#include "identity_policy.h"
#include "kvstore.h"
#include "storage_fs.h"

static const char* kPath = "/identity";
static const char* kBackupPath = "/identity.bak";  // written at creation (and by the factory tool in M9)
static const uint16_t kSchema = 1;

const char* identityStatusName(IdentityStatus s) {
  switch (s) {
    case IdentityStatus::kLoaded: return "loaded";
    case IdentityStatus::kRestoredFromBackup: return "restored_from_backup";
    case IdentityStatus::kCreated: return "created";
    case IdentityStatus::kLost: return "LOST(needs re-provisioning)";
    case IdentityStatus::kStorageFailed: return "STORAGE_FAILED";
  }
  return "?";
}

static void fill(Identity& out, const core::KvRecord& rec) {
  out.secretHex = rec.get("secret");
  out.setupPassword = rec.get("setup_pw");
  out.shortCode = rec.get("short_code");
}

IdentityStatus loadOrCreateIdentity(Identity& out) {
  core::KvRecord main, backup;
  uint16_t schema = 0;
  core::IdentityFiles f;
  f.main = core::loadRecord(fileStore(), kPath, main, schema);
  f.mainValid = (f.main == core::LoadResult::kOk || f.main == core::LoadResult::kRecoveredFromTmp) &&
                core::identityRecordValid(main, out.deviceId);
  f.backup = core::loadRecord(fileStore(), kBackupPath, backup, schema);
  f.backupValid = (f.backup == core::LoadResult::kOk || f.backup == core::LoadResult::kRecoveredFromTmp) &&
                  core::identityRecordValid(backup, out.deviceId);

  switch (core::decideIdentity(f)) {
    case core::IdentityAction::kUseMain:
      fill(out, main);
      if (!f.backupValid) core::saveRecord(fileStore(), kBackupPath, main, kSchema);
      return IdentityStatus::kLoaded;
    case core::IdentityAction::kUseBackup:
      fill(out, backup);
      core::saveRecord(fileStore(), kPath, backup, kSchema);
      return IdentityStatus::kRestoredFromBackup;
    case core::IdentityAction::kLost:
      return IdentityStatus::kLost;  // never regenerate: the backend and the printed sticker know the old one
    case core::IdentityAction::kCreate:
      break;
  }

  uint8_t secret[32];
  secureRandom(secret, sizeof secret);
  std::string pw;
  while (pw.empty()) {
    uint8_t rnd[64];
    secureRandom(rnd, sizeof rnd);
    pw = core::makeCode(rnd, sizeof rnd, core::kSetupPasswordLen);
    memset(rnd, 0, sizeof rnd);
  }
  out.secretHex = core::toHex(secret, sizeof secret);
  out.setupPassword = pw;
  out.shortCode.clear();
  memset(secret, 0, sizeof secret);

  core::KvRecord rec;
  rec.set("device_id", out.deviceId);
  rec.set("secret", out.secretHex);
  rec.set("setup_pw", out.setupPassword);
  rec.set("short_code", out.shortCode);
  if (!core::saveRecord(fileStore(), kPath, rec, kSchema)) return IdentityStatus::kStorageFailed;
  core::saveRecord(fileStore(), kBackupPath, rec, kSchema);
  return IdentityStatus::kCreated;
}

bool saveShortCode(Identity& id, const std::string& code) {
  core::KvRecord rec;
  rec.set("device_id", id.deviceId);
  rec.set("secret", id.secretHex);
  rec.set("setup_pw", id.setupPassword);
  rec.set("short_code", code);
  if (!core::saveRecord(fileStore(), kPath, rec, kSchema)) return false;
  core::saveRecord(fileStore(), kBackupPath, rec, kSchema);
  id.shortCode = code;
  return true;
}
