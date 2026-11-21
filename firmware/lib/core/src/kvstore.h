// Small key=value record format for LittleFS files (identity, config), with a schema version and a CRC so a
// half-written or corrupted file is detected instead of half-loaded. Pure C++ (native-testable).
//
// File format (UTF-8 text, one record per line):
//   v=<schema>\n  <key>=<percent-encoded value>\n ...  crc=<8 hex digits, CRC-32 of every byte before "crc=">\n
// Values are percent-encoded for '%', '=', '\n', '\r' and bytes < 0x20 or 0x7F, so any SSID or password is safe.
#pragma once
#include <cstddef>
#include <cstdint>
#include <string>
#include <utility>
#include <vector>

namespace core {

uint32_t crc32(const uint8_t* data, size_t n);

class KvRecord {
 public:
  void set(const std::string& key, const std::string& value);
  void setInt(const std::string& key, long value);
  bool has(const std::string& key) const;
  std::string get(const std::string& key, const std::string& def = "") const;
  long getInt(const std::string& key, long def = 0) const;
  void clear() { items_.clear(); }
  size_t size() const { return items_.size(); }

  std::string serialize(uint16_t schema) const;
  // Returns false (and leaves the record empty) if the text is malformed or the CRC doesn't match.
  bool parse(const std::string& text, uint16_t& schemaOut);

 private:
  std::vector<std::pair<std::string, std::string>> items_;
};

std::string percentEncode(const std::string& s);
bool percentDecode(const std::string& s, std::string& out);

// Minimal file-system interface so atomic save/load can be tested on the host.
class FileStore {
 public:
  virtual ~FileStore() {}
  virtual bool read(const char* path, std::string& out) = 0;
  virtual bool write(const char* path, const std::string& data) = 0;  // may fail part-way
  virtual bool rename(const char* from, const char* to) = 0;          // atomically replaces `to`
  virtual bool remove(const char* path) = 0;
  virtual bool exists(const char* path) = 0;
};

// Writes <path>.tmp, then renames it over <path>. Power loss at any point leaves either the old or the new
// complete file (the CRC catches a torn .tmp).
bool saveRecord(FileStore& fs, const char* path, const KvRecord& rec, uint16_t schema);

enum class LoadResult { kOk, kMissing, kCorrupt, kRecoveredFromTmp };
// Loads <path>. A valid <path>.tmp (power lost between write and rename) is newer and wins; it is promoted.
// A torn .tmp is deleted.
LoadResult loadRecord(FileStore& fs, const char* path, KvRecord& rec, uint16_t& schema);

}  // namespace core
