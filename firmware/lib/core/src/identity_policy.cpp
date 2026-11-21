#include "identity_policy.h"

#include "codes.h"

namespace core {

static bool isHex(const std::string& s) {
  for (char c : s)
    if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'))) return false;
  return true;
}

bool identityRecordValid(const KvRecord& rec, const std::string& deviceId) {
  std::string secret = rec.get("secret");
  return rec.get("device_id") == deviceId && secret.size() == 64 && isHex(secret) &&
         rec.get("setup_pw").size() == kSetupPasswordLen;
}

IdentityAction decideIdentity(const IdentityFiles& f) {
  if (f.mainValid) return IdentityAction::kUseMain;
  if (f.backupValid) return IdentityAction::kUseBackup;
  if (f.main == LoadResult::kMissing && f.backup == LoadResult::kMissing) return IdentityAction::kCreate;
  return IdentityAction::kLost;
}

}  // namespace core
