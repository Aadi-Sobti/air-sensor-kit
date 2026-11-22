#include "setup_portal.h"

#include <Arduino.h>
#include <DNSServer.h>
#include <ESP8266WebServer.h>
#include <ESP8266WiFi.h>

#include <algorithm>
#include <map>
#include <string>
#include <vector>

#include "config.h"
#include "net.h"

namespace pt = core::portal;

static const IPAddress kApIp(192, 168, 4, 1);
static const uint32_t kHoldAfterSuccessMs = 60000;  // keep the AP so the phone sees "You're all set!"

// Created only while the AP is up (they cost ~6 KB of RAM, which TLS uploads need the rest of the time).
static DNSServer* gDnsP = nullptr;
static ESP8266WebServer* gServerP = nullptr;
#define gDns (*gDnsP)
#define gServer (*gServerP)
static const Identity* gId = nullptr;
static PortalSavedFn gOnSaved = nullptr;
static std::string gSsid;
static bool gActive = false, gClientSeen = false;
static std::vector<pt::Network> gNets;

enum class Phase { kIdle, kTesting, kSuccess, kFailed };
static Phase gPhase = Phase::kIdle;
static uint32_t gTestStartAt = 0;
static bool gTestPending = false;  // start the test ~0.5 s after replying, so the page gets out first
static pt::Form gForm;  // password only kept while the test runs
static pt::Key gFailKey = pt::kErrPassword;
static uint32_t gHoldUntil = 0;
static bool gHolding = false;

static pt::Lang lang() { return pt::pickLang(gServer.header("Accept-Language").c_str()); }

static void sendPage(const std::string& html) {
  gServer.sendHeader("Cache-Control", "no-store");
  gServer.send(200, "text/html; charset=utf-8", html.c_str());
}

static void redirectToPortal() {
  // Captive-portal trigger: OS connectivity probes and unknown hosts all land on the setup page.
  gServer.sendHeader("Location", "http://192.168.4.1/", true);
  gServer.sendHeader("Cache-Control", "no-store");
  gServer.send(302, "text/plain", "");
}

static bool gScanning = false;

// Async scan, started right after the AP comes up (a blocking scan at boot would delay the first Improv answer,
// which must come within ~2 s). Results are collected in portalPoll.
static void startScan() {
  WiFi.scanNetworks(true, false);
  gScanning = true;
}

static void collectScan() {
  int n = WiFi.scanComplete();
  if (n == WIFI_SCAN_RUNNING) return;
  gScanning = false;
  if (n < 0) return;
  gNets.clear();
  for (int i = 0; i < n; i++) {
    std::string s = WiFi.SSID(i).c_str();
    if (s.empty()) continue;
    auto it = std::find_if(gNets.begin(), gNets.end(), [&](const pt::Network& x) { return x.ssid == s; });
    if (it != gNets.end()) {
      it->rssi = std::max(it->rssi, (int)WiFi.RSSI(i));
      continue;
    }
    gNets.push_back({s, WiFi.RSSI(i), WiFi.encryptionType(i) != ENC_TYPE_NONE});
  }
  WiFi.scanDelete();
  std::sort(gNets.begin(), gNets.end(), [](const pt::Network& a, const pt::Network& b) { return a.rssi > b.rssi; });
}

static void handleStatus();

// After the AP channel switch, phones reopen the captive browser at "/" (all probes redirect there), so "/"
// must show the current phase, exactly like /status.
static void handleRoot() {
  if (gPhase == Phase::kIdle) return sendPage(pt::formPage(lang(), gNets, gForm, {}));
  handleStatus();
}

static void handleConnect() {
  if (gPhase == Phase::kTesting) return sendPage(pt::connectingPage(lang()));
  std::map<std::string, std::string> f;
  for (int i = 0; i < gServer.args(); i++) f[gServer.argName(i).c_str()] = gServer.arg(i).c_str();
  pt::Form form;
  std::vector<pt::Key> errs = pt::validate(f, form);
  if (!errs.empty() || netTesting()) {
    if (errs.empty()) errs.push_back(pt::kErrNotFound);  // USB setup is testing right now; try again shortly
    form.password.clear();
    gForm = form;
    return sendPage(pt::formPage(lang(), gNets, form, errs));
  }
  gForm = form;
  gPhase = Phase::kTesting;
  Serial.println("[portal] testing new WiFi settings");  // never log SSID, password, or address
  sendPage(pt::connectingPage(lang()));
  gTestPending = true;  // portalPoll starts the test; the AP then follows the router's channel (phones may rejoin)
  gTestStartAt = millis() + 500;
}

static void handleStatus() {
  switch (gPhase) {
    case Phase::kTesting: return sendPage(pt::connectingPage(lang()));
    case Phase::kSuccess: return sendPage(pt::donePage(lang()));
    case Phase::kFailed: return sendPage(pt::formPage(lang(), gNets, gForm, {gFailKey}));
    default: return redirectToPortal();
  }
}

static void registerRoutes();

static void startAp() {
  WiFi.softAPConfig(kApIp, kApIp, IPAddress(255, 255, 255, 0));
  netSetApActive(true);
  // WPA2 with the per-device setup password from the QR sticker (decision #7). Never logged.
  bool ok = WiFi.softAP(gSsid.c_str(), gId ? gId->setupPassword.c_str() : nullptr);
  gDnsP = new DNSServer();
  gServerP = new ESP8266WebServer(80);
  registerRoutes();
  gDns.setErrorReplyCode(DNSReplyCode::NoError);
  gDns.start(53, "*", kApIp);  // every hostname -> the portal
  gServer.begin();
  gActive = true;
  gClientSeen = false;
  Serial.printf("[portal] ap=on ssid=%s ok=%d\n", gSsid.c_str(), ok ? 1 : 0);
}

static void stopAp() {
  gServer.stop();
  gDns.stop();
  delete gServerP;
  delete gDnsP;
  gServerP = nullptr;
  gDnsP = nullptr;
  WiFi.softAPdisconnect(true);
  netSetApActive(false);
  gActive = false;
  gHolding = false;
  if (gPhase != Phase::kTesting) {
    gPhase = Phase::kIdle;
    gForm = pt::Form{};
  }
  Serial.println("[portal] ap=off");
}

static void registerRoutes() {
  gServer.collectHeaders("Accept-Language");
  gServer.on("/", HTTP_GET, handleRoot);
  gServer.on("/connect", HTTP_POST, handleConnect);
  gServer.on("/status", HTTP_GET, handleStatus);
  // OS connectivity probes (Apple, Android, Windows): redirect so the portal pops up by itself.
  for (const char* p : {"/hotspot-detect.html", "/library/test/success.html", "/generate_204", "/gen_204",
                        "/connecttest.txt", "/ncsi.txt", "/redirect", "/fwlink", "/canonical.html", "/success.txt"}) {
    gServer.on(p, redirectToPortal);
  }
  gServer.onNotFound(redirectToPortal);
}

void portalBegin(const Identity* id, uint32_t chipId, PortalSavedFn onSaved) {
  gId = id;
  gOnSaved = onSaved;
  std::string code = id && !id->shortCode.empty() ? id->shortCode : pt::fallbackShortCode(chipId);
  gSsid = pt::apSsid(AP_PREFIX, code);
}

void portalSetWanted(bool wanted, uint32_t nowMs) {
  bool hold = gHolding && static_cast<int32_t>(gHoldUntil - nowMs) > 0;
  if (gHolding && !hold) {
    gHolding = false;
    if (gPhase == Phase::kSuccess) gPhase = Phase::kIdle;  // don't show an old "all set" page later
  }
  bool on = wanted || hold || gPhase == Phase::kTesting;
  if (on && !gActive) {
    startAp();
    if (!netTesting()) startScan();
  } else if (!on && gActive) {
    stopAp();
  }
}

void portalReset() {
  if (gPhase == Phase::kTesting && !gTestPending) netTestEnd();
  gPhase = Phase::kIdle;
  gTestPending = false;
  gForm = pt::Form{};
  gHolding = false;
}

bool portalActive() { return gActive; }
const std::string& portalApSsid() { return gSsid; }
bool portalClientSeen() { return gClientSeen; }

void portalPoll(uint32_t nowMs) {
  if (!gActive) return;
  if (gScanning) collectScan();
  gDns.processNextRequest();
  gServer.handleClient();
  if (!gClientSeen && WiFi.softAPgetStationNum() > 0) {
    gClientSeen = true;
    Serial.println("[portal] a phone joined");
  }
  if (gPhase != Phase::kTesting) return;
  if (gTestPending) {
    if (static_cast<int32_t>(nowMs - gTestStartAt) < 0) return;
    gTestPending = false;
    netTestBegin(gForm.ssid, gForm.password);
    return;
  }
  NetTest t = netTestPoll(nowMs);
  if (t == NetTest::kConnected) {
    netTestEnd();
    gPhase = Phase::kSuccess;
    if (gOnSaved) gOnSaved(gForm);  // save only after the credentials worked
    gForm.password.assign(gForm.password.size(), '\0');
    gForm.password.clear();
    gHolding = true;
    gHoldUntil = nowMs + kHoldAfterSuccessMs;
    Serial.printf("[portal] new WiFi works (%s)\n", netTestReason());
  } else if (t == NetTest::kFailed) {
    netTestEnd();  // saved WiFi (if any) untouched
    gPhase = Phase::kFailed;
    gFailKey = netTestFailure() == 0 ? pt::kErrPassword : pt::kErrNotFound;
    gForm.password.assign(gForm.password.size(), '\0');
    gForm.password.clear();
    Serial.printf("[portal] new WiFi did not connect (%s); nothing saved\n", netTestReason());
  }
}
