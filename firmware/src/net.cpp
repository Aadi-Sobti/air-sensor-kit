#include "net.h"

#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <time.h>

static bool gStaStarted = false;
static bool gApLogged = false;
static bool gNtpStarted = false;
static std::string gSsid, gPass;
static bool gTesting = false;
static uint32_t gTestStart = 0;
static char gTestReason[48] = "";

void netBegin() {
  WiFi.persistent(false);  // credentials live in our /config, not the SDK's flash sector
  WiFi.mode(WIFI_OFF);
  WiFi.setAutoReconnect(true);  // the SDK keeps retrying the saved network; we never erase it
}

void netApply(bool connectWifi, const DeviceConfig& cfg, bool apOn, uint32_t nowMs) {
  (void)nowMs;
  if (gTesting) return;
  if (connectWifi && cfg.hasWifi()) {
    if (!gStaStarted || gSsid != cfg.wifiSsid || gPass != cfg.wifiPass) {
      if (gStaStarted) WiFi.disconnect();  // new password for the same network: start over
      WiFi.forceSleepWake();
      WiFi.mode(WIFI_STA);
      WiFi.begin(cfg.wifiSsid.c_str(), cfg.wifiPass.c_str());
      gStaStarted = true;
      gSsid = cfg.wifiSsid;
      gPass = cfg.wifiPass;
      Serial.println("[net] connecting to saved WiFi");  // never log SSID/password
    }
  } else if (gStaStarted) {
    WiFi.disconnect(true);
    WiFi.mode(WIFI_OFF);
    gStaStarted = false;
    gSsid.clear();
    gPass.clear();
  }
  if (apOn != gApLogged) {
    gApLogged = apOn;
    Serial.printf("[net] setup_ap=%s (access point is built in M6)\n", apOn ? "on" : "off");
  }
  if (gStaStarted && WiFi.status() == WL_CONNECTED && !gNtpStarted) {
    // Time must be valid before TLS (cert dates). Two pools for redundancy.
    configTime(0, 0, "pool.ntp.org", "time.google.com");
    gNtpStarted = true;
  }
}

bool netConnected() { return gStaStarted && WiFi.status() == WL_CONNECTED; }
int netRssi() { return netConnected() ? WiFi.RSSI() : 0; }
bool timeValid() { return time(nullptr) > 1700000000; }  // after Nov 2023 = NTP has run

void netTestBegin(const std::string& ssid, const std::string& pass) {
  gTesting = true;
  gTestStart = millis();
  WiFi.forceSleepWake();
  delay(2);  // the RF needs a moment after waking from forced sleep
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  WiFi.begin(ssid.c_str(), pass.c_str());
  gTestReason[0] = 0;
  gStaStarted = false;  // force netApply to restart the saved network after the test
  gSsid.clear();
  gPass.clear();
}

NetTest netTestPoll(uint32_t nowMs) {
  if (!gTesting) return NetTest::kIdle;
  // The caller's nowMs may be older than gTestStart (captured earlier in the same loop pass), and an
  // unsigned difference would then wrap to ~49 days and end the test instantly. Use the live clock.
  (void)nowMs;
  nowMs = millis();
  wl_status_t st = WiFi.status();
  uint32_t el = (nowMs - gTestStart) / 1000;
  auto done = [&](const char* why) {
    snprintf(gTestReason, sizeof gTestReason, "%s status=%d after=%lus", why, (int)st, (unsigned long)el);
  };
  if (st == WL_CONNECTED) {
    done("connected");
    return NetTest::kConnected;
  }
  if (st == WL_WRONG_PASSWORD) {
    done("wrong_password");
    return NetTest::kFailed;
  }
  // NO_SSID / CONNECT_FAILED can be transient right after begin(); only trust them after a while.
  if ((st == WL_NO_SSID_AVAIL || st == WL_CONNECT_FAILED) && nowMs - gTestStart > 12000) {
    done(st == WL_NO_SSID_AVAIL ? "network_not_found" : "connect_failed");
    return NetTest::kFailed;
  }
  if (nowMs - gTestStart > 30000) {
    done("timeout");
    return NetTest::kFailed;
  }
  return NetTest::kRunning;
}

void netTestEnd() {
  gTesting = false;
  if (WiFi.status() == WL_CONNECTED) {
    // Connected with the new credentials: they are now the saved ones; keep the connection.
    gStaStarted = true;
    gSsid = WiFi.SSID().c_str();
    gPass = WiFi.psk().c_str();
  } else {
    WiFi.disconnect();
  }
}

void netResyncTime() { gNtpStarted = false; }
const char* netTestReason() { return gTestReason; }
