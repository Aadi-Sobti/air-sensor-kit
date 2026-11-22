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

// Setup AP name: "<prefix>-Setup-<code>" (<= 32 chars). Until the factory assigns a short code (M9), a stable
// 6-character code derived from the chip ID.
std::string fallbackShortCode(uint32_t chipId);
std::string apSsid(const std::string& prefix, const std::string& shortCode);

}  // namespace portal
}  // namespace core
