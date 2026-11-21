// What to do with the stored identity at boot. Pure C++ so the auth-critical decision is unit-tested.
// The identity (secret enrolled by the backend on first upload, setup password printed on the QR sticker,
// factory short code) must survive resets. Silently replacing it would break uploads AND phone setup.
#pragma once
#include <string>

#include "kvstore.h"

namespace core {

struct IdentityFiles {
  LoadResult main = LoadResult::kMissing;
  bool mainValid = false;  // parsed AND fields valid AND matches this chip
  LoadResult backup = LoadResult::kMissing;
  bool backupValid = false;
};

enum class IdentityAction {
  kUseMain,        // normal
  kUseBackup,      // main damaged/missing: restore it from the backup
  kCreate,         // brand-new device: no identity files at all
  kLost,           // files exist but none is usable: do NOT regenerate; report, wait for re-provisioning
};

IdentityAction decideIdentity(const IdentityFiles& f);
// Fields valid for this chip: device_id matches, secret is 64 hex chars, setup password has the right length.
bool identityRecordValid(const KvRecord& rec, const std::string& deviceId);

}  // namespace core
