#include "storage_fs.h"

#include <Arduino.h>
#include <LittleFS.h>

namespace {
class LittleFsStore : public core::FileStore {
 public:
  bool read(const char* path, std::string& out) override {
    File f = LittleFS.open(path, "r");
    if (!f) return false;
    out.clear();
    size_t n = f.size();
    if (n > 4096) {  // our files are < 1 KB; anything bigger is corrupt
      f.close();
      return false;
    }
    out.resize(n);
    size_t got = f.read(reinterpret_cast<uint8_t*>(&out[0]), n);
    f.close();
    out.resize(got);
    return got == n;
  }
  bool write(const char* path, const std::string& data) override {
    File f = LittleFS.open(path, "w");
    if (!f) return false;
    size_t n = f.write(reinterpret_cast<const uint8_t*>(data.data()), data.size());
    f.close();
    return n == data.size();
  }
  // lfs_rename atomically replaces an existing destination (littlefs semantics).
  bool rename(const char* from, const char* to) override { return LittleFS.rename(from, to); }
  bool remove(const char* path) override { return LittleFS.remove(path); }
  bool exists(const char* path) override { return LittleFS.exists(path); }
};
LittleFsStore gStore;
}  // namespace

// Mount without auto-format, so a mount glitch can't silently wipe the identity. Format only if mounting
// fails (a brand-new board, or real corruption); the caller logs that the FS was formatted.
static bool gFormatted = false;
bool storageBegin() {
  LittleFSConfig cfg(false);
  LittleFS.setConfig(cfg);
  if (LittleFS.begin()) return true;
  gFormatted = LittleFS.format();
  return gFormatted && LittleFS.begin();
}
bool storageWasFormatted() { return gFormatted; }
core::FileStore& fileStore() { return gStore; }
