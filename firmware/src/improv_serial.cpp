#include "improv_serial.h"
#include "log.h"

#include <Arduino.h>
#include <ESP8266WiFi.h>

#include <algorithm>
#include <string>
#include <vector>

#include "config.h"
#include "improv.h"
#include "setup_info.h"
#include "net.h"

namespace im = core::improv;

static im::Parser gParser;


static const Identity* gId = nullptr;
static ImprovSavedFn gOnSaved = nullptr;
static ImprovRedirectFn gRedirect = nullptr;
static bool gTesting = false;
static std::string gSsid, gPass;  // in RAM only during the test; never logged

// Factory/setup-info line command (firmware spec "Identity and factory mode"): "PFCMD SETUPINFO\n" makes the
// sensor print its setup AP name + password once, so tools/setup_info.py (run by the founder/volunteer, never in
// logs we capture) can show them before QR stickers exist. Only while unprovisioned (no short code) or within
// 60 s of boot: physical USB access = ownership.
static core::CommandLine gCmd;
static SetupInfoFn gSetupInfo = nullptr;
static SetCodeFn gSetCode = nullptr;

static void feedLine(uint8_t b) {
  if (!gCmd.feedLine(b)) return;
  if (strcmp(gCmd.text(), "PFCMD NEWCLAIM") == 0 && gRedirect) {
    // "Get a new owner code" on /setup: a fresh single-use claim token for the page that has the USB port
    // (physical access = ownership). Same token channel as the Improv redirect; never stored or logged otherwise.
    std::string url = gRedirect(true);
    size_t d = url.find("#d="), t = url.find("&t=");
    if (d != std::string::npos && t != std::string::npos) {
      LOGF("[claim] d=%s t=%s\n", url.substr(d + 3, t - d - 3).c_str(), url.substr(t + 3).c_str());
    }
    return;
  }
  std::string code;
  if (core::parseSetCodeCommand(gCmd.text(), code) && gSetCode) {
    // Factory tool (M9): same physical-access gate as setup info. The handler saves, answers, and restarts.
    if (core::setupInfoAllowed(gId && !gId->shortCode.empty(), millis())) {
      gSetCode(code);
    } else {
      LOGLN("[factory] not available (unplug and plug in the sensor, then run the tool within 60 s)");
    }
    return;
  }
  if (strcmp(gCmd.text(), "PFCMD SETUPINFO") != 0 || !gSetupInfo) return;
  if (core::setupInfoAllowed(gId && !gId->shortCode.empty(), millis())) {
    std::string ssid, pw;
    gSetupInfo(ssid, pw);
    LOGF("[setupinfo] ap_ssid=%s ap_password=%s\n", ssid.c_str(), pw.c_str());
  } else {
    LOGLN("[setupinfo] not available (unplug and plug in the sensor, then run the tool within 60 s)");
  }
}

void improvSetSetupInfo(SetupInfoFn fn) { gSetupInfo = fn; }
void improvSetSetCode(SetCodeFn fn) { gSetCode = fn; }

static void send(const std::vector<uint8_t>& f) {
  Serial.write(f.data(), f.size());
  Serial.write('\n');  // keeps the log readable; Improv clients ignore bytes between frames
}

// The claim page URL (https://<site>/claim#d=<id>&t=<token>). fresh=true after new WiFi was saved; a status
// query reuses the current token so it doesn't break a claim page that's already open.
static std::string redirectUrl(bool fresh) {
  return gRedirect ? gRedirect(fresh) : std::string(SITE_URL) + "/";
}

static void sendDeviceInfo() {
  std::string name = std::string(PROJECT_NAME) + " sensor " + (gId && !gId->shortCode.empty() ? gId->shortCode : "");
  send(im::resultFrame(im::kGetDeviceInfo, {PROJECT_NAME, FW_VERSION, "ESP8266", name}));
}

static void sendNetworks() {
  bool wasOff = WiFi.getMode() == WIFI_OFF;
  if (wasOff) {
    WiFi.forceSleepWake();
    WiFi.mode(WIFI_STA);
  }
  int n = WiFi.scanNetworks(false, true);  // blocking ~2 s; yields internally
  struct Net { std::string ssid; int rssi; bool secure; };
  std::vector<Net> nets;
  for (int i = 0; i < n; i++) {
    std::string s = WiFi.SSID(i).c_str();
    if (s.empty()) continue;  // hidden networks: the user types the name
    auto it = std::find_if(nets.begin(), nets.end(), [&](const Net& x) { return x.ssid == s; });
    if (it != nets.end()) {
      it->rssi = std::max(it->rssi, (int)WiFi.RSSI(i));
      continue;
    }
    nets.push_back({s, WiFi.RSSI(i), WiFi.encryptionType(i) != ENC_TYPE_NONE});
  }
  WiFi.scanDelete();
  std::sort(nets.begin(), nets.end(), [](const Net& a, const Net& b) { return a.rssi > b.rssi; });
  if (nets.size() > 20) nets.resize(20);
  for (auto& x : nets) send(im::resultFrame(im::kGetWifiNetworks, {x.ssid, std::to_string(x.rssi), x.secure ? "YES" : "NO"}));
  send(im::resultFrame(im::kGetWifiNetworks, {}));  // end of list
  if (wasOff && !gTesting) WiFi.mode(WIFI_OFF);
}

void improvBegin(const Identity* id, ImprovSavedFn onSaved, ImprovRedirectFn redirect) {
  gId = id;
  gOnSaved = onSaved;
  gRedirect = redirect;
}

bool improvBusy() { return gTesting; }

void improvPoll(uint32_t nowMs, bool wifiConnected) {
  int budget = 64;
  while (budget-- > 0 && Serial.available() > 0) {
    im::Rpc rpc;
    bool invalid = false;
    uint8_t byte = static_cast<uint8_t>(Serial.read());
    feedLine(byte);
    if (gParser.feed(byte, rpc, invalid)) {
      send(im::errorFrame(im::kNoError));
      switch (rpc.command) {
        case im::kWifiSettings:
          if (netTesting()) {  // the phone portal is testing credentials right now
            send(im::errorFrame(im::kUnknownError));
            break;
          }
          gSsid = rpc.ssid;
          gPass = rpc.password;
          gTesting = true;
          LOGLN("[improv] testing new WiFi settings");  // no SSID/password in logs
          send(im::stateFrame(im::kProvisioning));
          netTestBegin(gSsid, gPass);
          break;
        case im::kGetCurrentState:
          if (wifiConnected && !gTesting) {
            send(im::stateFrame(im::kProvisioned));
            send(im::resultFrame(im::kWifiSettings, {redirectUrl(false)}));
          } else {
            send(im::stateFrame(gTesting ? im::kProvisioning : im::kReady));
          }
          break;
        case im::kGetDeviceInfo:
          sendDeviceInfo();
          break;
        case im::kGetWifiNetworks:
          sendNetworks();
          break;
        default:
          send(im::errorFrame(im::kUnknownRpc));
      }
    } else if (invalid) {
      send(im::errorFrame(im::kInvalidRpc));
    }
  }
  if (!gTesting) return;
  NetTest t = netTestPoll(nowMs);
  if (t == NetTest::kConnected) {
    gTesting = false;
    netTestEnd();
    if (gOnSaved) gOnSaved(gSsid, gPass);  // save only after the credentials worked
    LOGF("[improv] new WiFi works (%s)\n", netTestReason());
    send(im::stateFrame(im::kProvisioned));
    send(im::resultFrame(im::kWifiSettings, {redirectUrl(true)}));
  } else if (t == NetTest::kFailed) {
    gTesting = false;
    netTestEnd();  // the old saved network (if any) is untouched and resumes
    LOGF("[improv] new WiFi did not connect (%s); nothing saved\n", netTestReason());
    send(im::errorFrame(im::errorForWifiFailure(static_cast<im::WifiFailure>(netTestFailure()))));
    send(im::stateFrame(im::kReady));
  }
  if (!gTesting) {
    gSsid.assign(gSsid.size(), '\0');
    gPass.assign(gPass.size(), '\0');
    gSsid.clear();
    gPass.clear();
  }
}
