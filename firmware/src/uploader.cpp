#include "uploader.h"

#include <Arduino.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecureBearSSL.h>
#include <time.h>

#include "config.h"
#include "pinned_roots.h"
#include "sha256.h"

static BearSSL::X509List* gTrust = nullptr;

void uploaderBegin() {
  if (!gTrust) gTrust = new BearSSL::X509List(kPinnedRoots);  // parsed once; ~1.5 KB of heap
}

static uint32_t parseRetryAfter(const String& body) {
  int i = body.indexOf("\"retry_after_s\":");
  return i < 0 ? 0 : static_cast<uint32_t>(body.substring(i + 16).toInt());
}

UploadResult uploadNow(const std::string& deviceId, const std::string& secretHex, bool sendEnrollSecret,
                       const std::string& body) {
  UploadResult r{core::UploadOutcome::kNetworkError, -1, 0, 0, ESP.getFreeHeap(), ESP.getFreeHeap(), 0};
  uint32_t t0 = millis();
  time_t now = time(nullptr);
  char ts[16];
  snprintf(ts, sizeof ts, "%lu", static_cast<unsigned long>(now));
  std::string sig = core::signUpload(secretHex, ts, body);

  BearSSL::WiFiClientSecure client;
  client.setTrustAnchors(gTrust);
  client.setX509Time(now);  // validate cert dates against NTP time
  client.setTimeout(15000);
  // Smaller TLS buffers only if the server supports Max Fragment Length (firmware spec); else defaults.
  if (client.probeMaxFragmentLength(INGEST_HOST, 443, 1024)) client.setBufferSizes(1024, 1024);

  HTTPClient http;
  http.setTimeout(15000);  // >= 15 s: function cold starts
  http.setReuse(false);
  if (!http.begin(client, INGEST_HOST, 443, INGEST_PATH, true)) {
    r.ms = millis() - t0;
    return r;
  }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Id", deviceId.c_str());
  http.addHeader("X-Timestamp", ts);
  http.addHeader("X-Signature", sig.c_str());
  if (sendEnrollSecret) http.addHeader("X-Enroll-Secret", secretHex.c_str());
  int code = http.POST(reinterpret_cast<const uint8_t*>(body.data()), body.size());
  r.heapMin = ESP.getFreeHeap();
  String resp = code > 0 ? http.getString() : String();
  http.end();
  r.httpCode = code;
  r.ms = millis() - t0;
  if (code <= 0) {
    char err[8];
    r.sslError = client.getLastSSLError(err, sizeof err);
    r.outcome = core::UploadOutcome::kNetworkError;
  } else if (code >= 200 && code < 300) {
    r.outcome = core::UploadOutcome::kOk;
  } else if (code == 401 && resp.indexOf("clock_skew") >= 0) {
    r.outcome = core::UploadOutcome::kClockSkew;
  } else if (code == 403) {
    r.outcome = core::UploadOutcome::kNotRegistered;
  } else if (code == 429) {
    r.outcome = core::UploadOutcome::kRateLimited;
    r.retryAfterS = parseRetryAfter(resp);
  } else if (code == 400 || code == 401 || code == 413) {
    r.outcome = core::UploadOutcome::kRejected;
  } else {
    r.outcome = core::UploadOutcome::kNetworkError;  // 5xx etc.
  }
  return r;
}
