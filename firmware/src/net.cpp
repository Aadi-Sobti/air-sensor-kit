#include "net.h"

#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <time.h>

static bool gStaStarted = false;
static bool gApLogged = false;
static bool gNtpStarted = false;
static std::string gSsid, gPass;

void netBegin() {
  WiFi.persistent(false);  // credentials live in our /config, not the SDK's flash sector
  WiFi.mode(WIFI_OFF);
  WiFi.setAutoReconnect(true);  // the SDK keeps retrying the saved network; we never erase it
}

void netApply(bool connectWifi, const DeviceConfig& cfg, bool apOn, uint32_t nowMs) {
  (void)nowMs;
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
