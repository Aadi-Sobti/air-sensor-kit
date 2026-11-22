#include "ota.h"
#include "log.h"

#include <Arduino.h>
#include <ESP8266HTTPClient.h>
#include <ESP8266httpUpdate.h>
#include <WiFiClientSecureBearSSL.h>
#include <time.h>

#include <memory>

#include "config.h"
#include "ota_policy.h"
#include "uploader.h"

// Public keys (PEM, in flash). The dev key lives in src/dev/ (dev builds only); the release key file is created by
// the founder with tools/ota_keys.py release (M11). Missing key = OTA off.
__attribute__((weak)) const char* otaDevPublicKeyPem() { return nullptr; }
__attribute__((weak)) const char* otaReleasePublicKeyPem() { return nullptr; }

// The signature checker exists only during an update: a SigningVerifier holds a reference to BearSSL's 6 KB
// second stack, and keeping it from boot left too little RAM for TLS (seen on hardware 2026-11-22: idle heap
// 33.8 KB -> 26.2 KB, manifest download failed with 4 KB left).
static const char* gPem = nullptr;  // in flash
static std::string gDeviceId;
static bool gOn = false;
static bool gScheduled = false;
static uint32_t gNextCheck = 0;
static std::string gFailedVersion;  // don't download the same bad image again until the next restart

static BearSSL::PublicKey* loadKey(const char* pem) {
  size_t n = strlen_P(pem);
  std::unique_ptr<char[]> buf(new char[n + 1]);
  memcpy_P(buf.get(), pem, n + 1);
  return new BearSSL::PublicKey(buf.get());
}

void otaBegin(const std::string& deviceId) {
  gDeviceId = deviceId;
  const char* pem = otaDevPublicKeyPem();
  const char* which = "dev";
  if (!pem) {
    pem = otaReleasePublicKeyPem();
    which = "release";
  }
  if (!pem) {
    LOGLN("[ota] off (no signing key in this build)");
    return;
  }
  std::unique_ptr<BearSSL::PublicKey> key(loadKey(pem));  // parse once now to catch a broken key early
  if (!key || !key->isRSA()) {
    LOGLN("[ota] off (bad signing key)");
    return;
  }
  gPem = pem;
  gOn = true;
  LOGF("[ota] on key=%s\n", which);
}

static void secureClient(BearSSL::WiFiClientSecure& c) {
  c.setTrustAnchors(pinnedTrust());
  c.setX509Time(time(nullptr));
  c.setTimeout(15000);
  if (c.probeMaxFragmentLength(INGEST_HOST, 443, 1024)) c.setBufferSizes(1024, 1024);
}

// Returns true if a manifest was read and parsed.
static bool fetchManifest(core::OtaManifest& m) {
  BearSSL::WiFiClientSecure client;
  secureClient(client);
  HTTPClient http;
  http.setTimeout(15000);
  http.setReuse(false);
  if (!http.begin(client, INGEST_HOST, 443, "/fw/manifest.json", true)) return false;
  int code = http.GET();
  int len = http.getSize();
  String body = code == 200 && len > 0 && len <= 4096 ? http.getString() : String();
  http.end();
  if (code == 404) {
    LOGLN("[ota] no update published");
    return false;
  }
  if (code != 200 || body.isEmpty()) {
    char err[8];
    int ssl = client.getLastSSLError(err, sizeof err);
    LOGF("[ota] manifest http=%d len=%d ssl_err=%d heap=%u maxblk=%u\n", code, len, ssl, ESP.getFreeHeap(),
                  ESP.getMaxFreeBlockSize());
    return false;
  }
  if (!core::parseOtaManifest(body.c_str(), m)) {
    LOGLN("[ota] manifest invalid");
    return false;
  }
  return true;
}

static void check(const std::string& currentVersion) {
  core::OtaManifest m;
  if (!fetchManifest(m)) return;
  if (!core::otaEligible(m, gDeviceId, currentVersion) || m.version == gFailedVersion) {
    LOGF("[ota] up to date (have %s, published %s stage=%s)\n", currentVersion.c_str(), m.version.c_str(),
                  m.stage.c_str());
    return;
  }
  LOGF("[ota] updating %s -> %s heap=%u\n", currentVersion.c_str(), m.version.c_str(), ESP.getFreeHeap());
  // Signature checking on for exactly this download (the updater refuses to finish without a valid signature).
  std::unique_ptr<BearSSL::PublicKey> key(loadKey(gPem));
  BearSSL::HashSHA256 hash;
  BearSSL::SigningVerifier verifier(key.get());
  Update.installSignature(&hash, &verifier);
  BearSSL::WiFiClientSecure client;
  secureClient(client);
  ESPhttpUpdate.rebootOnUpdate(false);
  ESPhttpUpdate.setLedPin(-1);
  t_httpUpdate_return r = ESPhttpUpdate.update(client, INGEST_HOST, 443, m.path.c_str(), currentVersion.c_str());
  if (r == HTTP_UPDATE_OK) {
    LOGF("[ota] installed %s (signature ok); restarting\n", m.version.c_str());
    Serial.flush();
    delay(200);
    ESP.restart();
    return;
  }
  Update.installSignature(nullptr, nullptr);  // the checker objects die with this function
  gFailedVersion = m.version;
  // UPDATE_ERROR_SIGN (12) = the image wasn't signed with our key: it is never booted.
  LOGF("[ota] failed result=%d err=%d update_err=%u (%s); still on %s\n", (int)r, ESPhttpUpdate.getLastError(),
                Update.getError(), ESPhttpUpdate.getLastErrorString().c_str(), currentVersion.c_str());
}

void otaPoll(uint32_t nowMs, bool canRun, const std::string& currentVersion) {
  if (!gOn) return;
  if (!canRun) return;  // a due check waits until the sensor is RUNNING again
  if (!gScheduled) {  // first time RUNNING since boot: check a couple of minutes from now
    gScheduled = true;
    gNextCheck = nowMs + core::kOtaFirstCheckMs;
  }
  if (static_cast<int32_t>(nowMs - gNextCheck) < 0) return;
  gNextCheck = nowMs + core::kOtaIntervalMs + core::otaJitterMs(gDeviceId);
  check(currentVersion);
}
