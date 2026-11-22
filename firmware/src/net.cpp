#include "net.h"

#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <time.h>

static bool gStaStarted = false;
static bool gNtpStarted = false;
static std::string gSsid, gPass;
static bool gTesting = false;
static uint32_t gTestStart = 0;
static char gTestReason[48] = "";
static int gTestFailure = 3;  // WifiFailure::kTimeout
static bool gApActive = false;  // set by the setup portal
static bool gPaused = false;    // a phone is using the setup WiFi: stop searching for the saved network

// One place decides the radio mode: station if we're using/testing a network, access point if the setup portal
// is up. Both at once (AP+STA) while a phone user's credentials are being tested.
static void applyMode() {
  bool sta = gStaStarted || gTesting;
  WiFiMode_t want = sta && gApActive ? WIFI_AP_STA : sta ? WIFI_STA : gApActive ? WIFI_AP : WIFI_OFF;
  if (WiFi.getMode() == want) return;
  if (want != WIFI_OFF) {
    WiFi.forceSleepWake();
    delay(2);
  }
  WiFi.mode(want);
}

void netSetSavedWifiPaused(bool paused) {
  if (paused == gPaused) return;
  gPaused = paused;
  Serial.printf("[net] saved WiFi retries %s\n", paused ? "paused (a phone is using setup)" : "resumed");
}

void netSetApActive(bool on) {
  gApActive = on;
  applyMode();
}

void netBegin() {
  WiFi.persistent(false);  // credentials live in our /config, not the SDK's flash sector
  WiFi.mode(WIFI_OFF);
  WiFi.setAutoReconnect(true);  // the SDK keeps retrying the saved network; we never erase it
}

void netApply(bool connectWifi, const DeviceConfig& cfg, bool apOn, uint32_t nowMs) {
  (void)nowMs;
  if (gTesting) return;
  bool connected = gStaStarted && WiFi.status() == WL_CONNECTED;
  if (connectWifi && cfg.hasWifi() && (!gPaused || connected)) {
    if (!gStaStarted || gSsid != cfg.wifiSsid || gPass != cfg.wifiPass) {
      if (gStaStarted) WiFi.disconnect();  // new password for the same network: start over
      gStaStarted = true;
      applyMode();
      WiFi.begin(cfg.wifiSsid.c_str(), cfg.wifiPass.c_str());
      gSsid = cfg.wifiSsid;
      gPass = cfg.wifiPass;
      Serial.println("[net] connecting to saved WiFi");  // never log SSID/password
    }
  } else if (gStaStarted) {
    WiFi.disconnect();
    gStaStarted = false;
    applyMode();
    gSsid.clear();
    gPass.clear();
  }
  (void)apOn;  // the setup portal (portal.cpp) owns the access point and calls netSetApActive()
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
  applyMode();  // STA (+ AP if the phone portal is up: the AP follows the router's channel during the test)
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
    gTestFailure = 0;
    return NetTest::kFailed;
  }
  // NO_SSID / CONNECT_FAILED can be transient right after begin(); only trust them after a while.
  if ((st == WL_NO_SSID_AVAIL || st == WL_CONNECT_FAILED) && nowMs - gTestStart > 12000) {
    done(st == WL_NO_SSID_AVAIL ? "network_not_found" : "connect_failed");
    gTestFailure = st == WL_NO_SSID_AVAIL ? 1 : 2;
    return NetTest::kFailed;
  }
  if (nowMs - gTestStart > 30000) {
    done("timeout");
    gTestFailure = 3;
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
    applyMode();  // back to the saved network (netApply) or AP only
  }
}

bool netTesting() { return gTesting; }

void netResyncTime() { gNtpStarted = false; }
const char* netTestReason() { return gTestReason; }
int netTestFailure() { return gTestFailure; }
