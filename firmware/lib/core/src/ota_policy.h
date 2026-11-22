// OTA (updating sensors over WiFi) decisions. Pure C++ (native-testable). Spec: firmware rules "OTA".
// The manifest is a small JSON file on our own site (Hosting, /fw/manifest.json):
//   {"version":"0.7.1","path":"/fw/prosefire-0.7.1.bin.signed","size":540000,
//    "stage":"bench","canary_percent":10,"bench":["esp8266-11001626"]}
// stage: "bench" = only the listed boards · "canary" = listed boards + canary_percent % of all boards (a stable
// per-device slice) · "all" = everyone. Nothing in the manifest is trusted for security: the image itself must carry
// a valid signature, which the updater checks before it will boot it.
#pragma once
#include <cstdint>
#include <string>
#include <vector>

namespace core {

struct OtaManifest {
  std::string version, path, stage;
  uint32_t size = 0;
  int canaryPercent = 0;
  std::vector<std::string> bench;
};

// Strict, tiny parser for exactly this flat object (no nesting beyond the bench string array). Unknown keys are
// ignored. Returns false if anything required is missing or malformed: version "X.Y.Z", path starting with "/fw/"
// (same site only), size 1..1,044,464 (the max program size), stage bench|canary|all, canary_percent 0..100.
bool parseOtaManifest(const std::string& json, OtaManifest& out);

// "0.7.10" > "0.7.9". Returns <0, 0, >0. Non-numeric parts compare as 0.
int compareVersions(const std::string& a, const std::string& b);

// Stable 0..99 bucket for a device (FNV-1a of the ID), so a canary slice is the same boards every time.
int otaBucket(const std::string& deviceId);

// Should this device install the manifest's image now?
bool otaEligible(const OtaManifest& m, const std::string& deviceId, const std::string& currentVersion);

// When to check: first check kFirstCheckMs after the device reaches RUNNING with valid time, then every 24 h plus a
// per-device offset (0..59 min) so a whole neighborhood doesn't download at the same moment.
constexpr uint32_t kOtaFirstCheckMs = 2UL * 60 * 1000;
constexpr uint32_t kOtaIntervalMs = 24UL * 60 * 60 * 1000;
uint32_t otaJitterMs(const std::string& deviceId);

}  // namespace core
