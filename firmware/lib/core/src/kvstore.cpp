#include "kvstore.h"

#include <cstdio>
#include <cstdlib>

namespace core {

uint32_t crc32(const uint8_t* data, size_t n) {
  uint32_t c = 0xFFFFFFFFu;
  for (size_t i = 0; i < n; i++) {
    c ^= data[i];
    for (int k = 0; k < 8; k++) c = (c >> 1) ^ (0xEDB88320u & (0u - (c & 1u)));
  }
  return ~c;
}

std::string percentEncode(const std::string& s) {
  static const char* hex = "0123456789ABCDEF";
  std::string out;
  out.reserve(s.size());
  for (unsigned char ch : s) {
    if (ch == '%' || ch == '=' || ch == '\n' || ch == '\r' || ch < 0x20 || ch == 0x7F) {
      out += '%';
      out += hex[ch >> 4];
      out += hex[ch & 0xF];
    } else {
      out += static_cast<char>(ch);
    }
  }
  return out;
}

static int hexVal(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  return -1;
}

bool percentDecode(const std::string& s, std::string& out) {
  out.clear();
  for (size_t i = 0; i < s.size(); i++) {
    if (s[i] != '%') {
      out += s[i];
      continue;
    }
    if (i + 2 >= s.size()) return false;
    int h = hexVal(s[i + 1]), l = hexVal(s[i + 2]);
    if (h < 0 || l < 0) return false;
    out += static_cast<char>((h << 4) | l);
    i += 2;
  }
  return true;
}

void KvRecord::set(const std::string& key, const std::string& value) {
  for (auto& kv : items_) {
    if (kv.first == key) {
      kv.second = value;
      return;
    }
  }
  items_.emplace_back(key, value);
}

void KvRecord::setInt(const std::string& key, long value) { set(key, std::to_string(value)); }

bool KvRecord::has(const std::string& key) const {
  for (auto& kv : items_)
    if (kv.first == key) return true;
  return false;
}

std::string KvRecord::get(const std::string& key, const std::string& def) const {
  for (auto& kv : items_)
    if (kv.first == key) return kv.second;
  return def;
}

long KvRecord::getInt(const std::string& key, long def) const {
  if (!has(key)) return def;
  std::string v = get(key);
  char* end = nullptr;
  long r = std::strtol(v.c_str(), &end, 10);
  return (end && *end == '\0' && !v.empty()) ? r : def;
}

std::string KvRecord::serialize(uint16_t schema) const {
  std::string body = "v=" + std::to_string(schema) + "\n";
  for (auto& kv : items_) body += kv.first + "=" + percentEncode(kv.second) + "\n";
  char crc[16];
  std::snprintf(crc, sizeof crc, "%08lx",
                static_cast<unsigned long>(crc32(reinterpret_cast<const uint8_t*>(body.data()), body.size())));
  return body + "crc=" + crc + "\n";
}

bool KvRecord::parse(const std::string& text, uint16_t& schemaOut) {
  items_.clear();
  size_t crcPos = text.rfind("crc=");
  if (crcPos == std::string::npos || (crcPos > 0 && text[crcPos - 1] != '\n')) return false;
  std::string crcHex = text.substr(crcPos + 4);
  while (!crcHex.empty() && (crcHex.back() == '\n' || crcHex.back() == '\r')) crcHex.pop_back();
  if (crcHex.size() != 8) return false;
  char* end = nullptr;
  unsigned long want = std::strtoul(crcHex.c_str(), &end, 16);
  if (!end || *end != '\0') return false;
  uint32_t got = crc32(reinterpret_cast<const uint8_t*>(text.data()), crcPos);
  if (got != static_cast<uint32_t>(want)) return false;

  bool sawVersion = false;
  size_t pos = 0;
  while (pos < crcPos) {
    size_t nl = text.find('\n', pos);
    if (nl == std::string::npos || nl > crcPos) return false;
    std::string line = text.substr(pos, nl - pos);
    pos = nl + 1;
    size_t eq = line.find('=');
    if (eq == std::string::npos || eq == 0) {
      items_.clear();
      return false;
    }
    std::string key = line.substr(0, eq), val;
    if (!percentDecode(line.substr(eq + 1), val)) {
      items_.clear();
      return false;
    }
    if (!sawVersion) {
      if (key != "v") return false;
      long v = std::strtol(val.c_str(), &end, 10);
      if (!end || *end != '\0' || v <= 0 || v > 65535) return false;
      schemaOut = static_cast<uint16_t>(v);
      sawVersion = true;
      continue;
    }
    set(key, val);
  }
  if (!sawVersion) {
    items_.clear();
    return false;
  }
  return true;
}

bool saveRecord(FileStore& fs, const char* path, const KvRecord& rec, uint16_t schema) {
  std::string tmp = std::string(path) + ".tmp";
  if (!fs.write(tmp.c_str(), rec.serialize(schema))) {
    fs.remove(tmp.c_str());
    return false;
  }
  return fs.rename(tmp.c_str(), path);
}

LoadResult loadRecord(FileStore& fs, const char* path, KvRecord& rec, uint16_t& schema) {
  // A complete <path>.tmp only exists if power was lost between writing it and renaming it, so it is the
  // newest data: prefer it. A torn .tmp fails its CRC and the main file is used.
  std::string tmp = std::string(path) + ".tmp";
  std::string text;
  if (fs.read(tmp.c_str(), text)) {
    if (rec.parse(text, schema)) {
      fs.rename(tmp.c_str(), path);
      return LoadResult::kRecoveredFromTmp;
    }
    fs.remove(tmp.c_str());
  }
  bool mainExists = fs.read(path, text);
  if (mainExists && rec.parse(text, schema)) return LoadResult::kOk;
  rec.clear();
  return mainExists ? LoadResult::kCorrupt : LoadResult::kMissing;
}

}  // namespace core
