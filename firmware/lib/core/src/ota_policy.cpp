#include "ota_policy.h"

#include <cctype>
#include <cstdlib>

namespace core {

namespace {

// Minimal JSON reader for one flat object. Strings may not contain escapes (none of our values need them).
struct Reader {
  const std::string& s;
  size_t i = 0;
  explicit Reader(const std::string& str) : s(str) {}
  void ws() {
    while (i < s.size() && std::isspace(static_cast<unsigned char>(s[i]))) i++;
  }
  bool eat(char c) {
    ws();
    if (i < s.size() && s[i] == c) {
      i++;
      return true;
    }
    return false;
  }
  bool str(std::string& out) {
    ws();
    if (i >= s.size() || s[i] != '"') return false;
    size_t j = ++i;
    while (i < s.size() && s[i] != '"') {
      if (s[i] == '\\' || static_cast<unsigned char>(s[i]) < 0x20) return false;
      i++;
    }
    if (i >= s.size()) return false;
    out = s.substr(j, i - j);
    i++;
    return out.size() <= 64;
  }
  bool num(long& out) {
    ws();
    size_t j = i;
    if (i < s.size() && s[i] == '-') i++;
    while (i < s.size() && std::isdigit(static_cast<unsigned char>(s[i]))) i++;
    if (i == j || i - j > 10) return false;
    out = std::strtol(s.substr(j, i - j).c_str(), nullptr, 10);
    return true;
  }
  // Skips any other JSON value (used for unknown keys).
  bool skip() {
    ws();
    if (i >= s.size()) return false;
    char c = s[i];
    if (c == '"') {
      std::string t;
      return str(t);
    }
    if (c == '[' || c == '{') {
      int depth = 0;
      bool inStr = false;
      for (; i < s.size(); i++) {
        char d = s[i];
        if (inStr) {
          if (d == '\\') i++;
          else if (d == '"') inStr = false;
        } else if (d == '"') {
          inStr = true;
        } else if (d == '[' || d == '{') {
          depth++;
        } else if (d == ']' || d == '}') {
          if (--depth == 0) {
            i++;
            return true;
          }
        }
      }
      return false;
    }
    size_t j = i;
    while (i < s.size() && s[i] != ',' && s[i] != '}' && !std::isspace(static_cast<unsigned char>(s[i]))) i++;
    return i > j;
  }
};

bool validVersion(const std::string& v) {
  int parts = 0, digits = 0;
  for (char c : v) {
    if (c == '.') {
      if (!digits) return false;
      parts++;
      digits = 0;
    } else if (std::isdigit(static_cast<unsigned char>(c)) && digits < 3) {
      digits++;
    } else {
      return false;
    }
  }
  return parts == 2 && digits > 0;
}

}  // namespace

bool parseOtaManifest(const std::string& json, OtaManifest& out) {
  if (json.size() > 4096) return false;
  OtaManifest m;
  bool hasCanary = false;
  Reader r(json);
  if (!r.eat('{')) return false;
  bool first = true;
  while (!r.eat('}')) {
    if (!first && !r.eat(',')) return false;
    first = false;
    std::string key;
    if (!r.str(key) || !r.eat(':')) return false;
    long n = 0;
    if (key == "version" || key == "path" || key == "stage") {
      std::string v;
      if (!r.str(v)) return false;
      (key == "version" ? m.version : key == "path" ? m.path : m.stage) = v;
    } else if (key == "size") {
      if (!r.num(n) || n < 1 || n > 1044464) return false;
      m.size = static_cast<uint32_t>(n);
    } else if (key == "canary_percent") {
      if (!r.num(n) || n < 0 || n > 100) return false;
      m.canaryPercent = static_cast<int>(n);
      hasCanary = true;
    } else if (key == "bench") {
      if (!r.eat('[')) return false;
      if (!r.eat(']')) {
        do {
          std::string id;
          if (!r.str(id) || m.bench.size() >= 20) return false;
          m.bench.push_back(id);
        } while (r.eat(','));
        if (!r.eat(']')) return false;
      }
    } else if (!r.skip()) {
      return false;
    }
  }
  r.ws();
  if (r.i != json.size()) return false;
  if (!validVersion(m.version) || m.path.compare(0, 4, "/fw/") != 0 || m.path.find("..") != std::string::npos ||
      m.size == 0) {
    return false;
  }
  if (m.stage != "bench" && m.stage != "canary" && m.stage != "all") return false;
  if (m.stage == "canary" && !hasCanary) return false;
  out = m;
  return true;
}

int compareVersions(const std::string& a, const std::string& b) {
  size_t i = 0, j = 0;
  for (int part = 0; part < 3; part++) {
    long x = 0, y = 0;
    while (i < a.size() && a[i] != '.') x = x * 10 + (std::isdigit(static_cast<unsigned char>(a[i])) ? a[i] - '0' : 0), i++;
    while (j < b.size() && b[j] != '.') y = y * 10 + (std::isdigit(static_cast<unsigned char>(b[j])) ? b[j] - '0' : 0), j++;
    if (x != y) return x < y ? -1 : 1;
    i++;
    j++;
  }
  return 0;
}

static uint32_t fnv1a(const std::string& s) {
  uint32_t h = 2166136261u;
  for (char c : s) {
    h ^= static_cast<uint8_t>(c);
    h *= 16777619u;
  }
  return h;
}

int otaBucket(const std::string& deviceId) { return static_cast<int>(fnv1a(deviceId) % 100); }

bool otaEligible(const OtaManifest& m, const std::string& deviceId, const std::string& currentVersion) {
  if (compareVersions(m.version, currentVersion) <= 0) return false;  // never downgrade or reinstall
  bool onBench = false;
  for (const std::string& b : m.bench) onBench |= b == deviceId;
  if (m.stage == "all") return true;
  if (onBench) return true;
  return m.stage == "canary" && otaBucket(deviceId) < m.canaryPercent;
}

bool otaBadImageError(int e) {
  // 4 SPACE, 5 SIZE, 9 NEW_FLASH_CONFIG, 10 MAGIC_BYTE, 11 BOOTSTRAP, 12 SIGN
  return e == 4 || e == 5 || e == 9 || e == 10 || e == 11 || e == 12;
}

void OtaFailures::record(const std::string& image, int updaterError) {
  if (image != image_) {
    image_ = image;
    tries_ = 0;
    bad_ = false;
  }
  if (otaBadImageError(updaterError)) bad_ = true;
  else tries_++;
}

bool OtaFailures::blocks(const std::string& image) const {
  return image == image_ && (bad_ || tries_ >= kOtaMaxTries);
}

uint32_t otaJitterMs(const std::string& deviceId) { return (fnv1a("ota:" + deviceId) % 3600u) * 1000u; }

}  // namespace core
