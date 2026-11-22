// Phone setup page served by the sensor's own WiFi (captive portal). Pure C++ (native-testable).
// Spec: firmware rules "Setup B" + USER_FLOW Part 2B. No external assets (no internet), works with JS off and in
// iOS's captive-portal mini-browser: plain HTML forms + meta refresh. Strings: EN + ES table below.
#pragma once
#include <cstdint>
#include <map>
#include <string>
#include <vector>

namespace core {
namespace portal {

enum class Lang { kEn, kEs };
Lang pickLang(const std::string& acceptLanguage);

enum Key {
  kTitle, kIntro, kWifi, kOther, kWifiName, kPassword, kShowPw, kOpen, kWifiHint, kAddress, kAddressHint, kZip,
  kWhere, kOutside, kInside, kConnect, kConnecting, kKeepOpen, kDone, kDoneNext, kErrPassword, kErrNotFound,
  kErrNeedSsid, kErrPwLength, kErrAddress, kErrZip, kSafety, kShare, kKeyCount
};
std::string str(Lang l, Key k);

struct Network {
  std::string ssid;
  int rssi;
  bool secure;
  int channel = 0;  // 0 = unknown
};

struct Form {
  std::string ssid, password, address, zip;
  bool indoor = false;  // default outdoor (USER_FLOW)
};

// Fields as posted (already URL-decoded by the web server): net (picked SSID or "__other__"), ssid, pass,
// address, zip, where ("outside" | "inside"). Returns error keys (empty = valid).
std::vector<Key> validate(const std::map<std::string, std::string>& fields, Form& out);

std::string htmlEscape(const std::string& s);

// Pages. `errors` are shown at the top; form values (except the password) are kept so people don't retype.
std::string formPage(Lang l, const std::vector<Network>& nets, const Form& values, const std::vector<Key>& errors);
std::string connectingPage(Lang l);  // refreshes itself to /status (works without JS, survives channel switches)
std::string donePage(Lang l);

// Radio rules for a stable setup network (founder test 2026-11-22: after a wrong password the iPhone dropped off the
// setup WiFi and couldn't rejoin). The ESP8266 has one radio: while it keeps retrying a saved network it can't
// reach, it leaves the setup network's channel to search, and the phone drops.
//  - pauseSavedWifi: stop retrying the saved network while a phone is on the setup WiFi and used the page recently.
//    Retries resume when the phone leaves or after kPortalIdleMs without a page request (a phone left joined
//    must not keep the sensor offline forever). Never pauses a connection that already works.
//  - pickApChannel: open the setup WiFi on the channel of the home network (the saved one if it's nearby, else the
//    strongest), so testing the password doesn't move the setup WiFi to another channel. Channels 12-13 are not
//    allowed in the US, so those (and unknown channels) return 0 = keep the current channel.
constexpr uint32_t kPortalIdleMs = 5UL * 60 * 1000;
bool pauseSavedWifi(bool apOn, int stations, bool staConnected, uint32_t msSinceActivity);
int pickApChannel(const std::vector<Network>& nets, const std::string& savedSsid);

// Setup AP name: "<prefix>-Setup-<code>" (<= 32 chars). Until the factory assigns a short code (M9), a stable
// 6-character code derived from the chip ID.
std::string fallbackShortCode(uint32_t chipId);
std::string apSsid(const std::string& prefix, const std::string& shortCode);

}  // namespace portal
}  // namespace core
