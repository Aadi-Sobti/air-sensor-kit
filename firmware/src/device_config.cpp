#include "device_config.h"

#include "kvstore.h"
#include "storage_fs.h"

static const char* kPath = "/config";
static const uint16_t kSchema = 1;
static core::LoadResult gLast = core::LoadResult::kMissing;

const char* lastConfigLoadResult() {
  switch (gLast) {
    case core::LoadResult::kOk: return "loaded";
    case core::LoadResult::kMissing: return "missing";
    case core::LoadResult::kCorrupt: return "corrupt";
    case core::LoadResult::kRecoveredFromTmp: return "recovered";
  }
  return "?";
}

bool loadConfig(DeviceConfig& out) {
  out = DeviceConfig{};
  core::KvRecord rec;
  uint16_t schema = 0;
  core::LoadResult r = core::loadRecord(fileStore(), kPath, rec, schema);
  gLast = r;
  if (r != core::LoadResult::kOk && r != core::LoadResult::kRecoveredFromTmp) return false;
  // Future schema migrations go here (schema < kSchema -> fill new fields with defaults).
  out.wifiSsid = rec.get("ssid");
  out.wifiPass = rec.get("pass");
  out.address = rec.get("address");
  out.zip = rec.get("zip");
  out.indoor = rec.getInt("indoor", 0) != 0;
  out.setupInfoPending = rec.getInt("setup_pending", 0) != 0;
  return true;
}

bool saveConfig(const DeviceConfig& c) {
  core::KvRecord rec;
  rec.set("ssid", c.wifiSsid);
  rec.set("pass", c.wifiPass);
  rec.set("address", c.address);
  rec.set("zip", c.zip);
  rec.setInt("indoor", c.indoor ? 1 : 0);
  rec.setInt("setup_pending", c.setupInfoPending ? 1 : 0);
  return core::saveRecord(fileStore(), kPath, rec, kSchema);
}

bool eraseWifiAndSetup(DeviceConfig& c) {
  c = DeviceConfig{};
  return saveConfig(c);
}
