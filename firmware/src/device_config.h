// User config: WiFi + setup info. Erased by a FLASH long-press (identity is kept).
#pragma once
#include <string>

struct DeviceConfig {
  std::string wifiSsid, wifiPass;
  std::string address, zip;  // private: sent once in the first signed upload, never logged
  bool indoor = false;       // default outdoor (USER_FLOW)
  bool setupInfoPending = false;
  bool hasWifi() const { return !wifiSsid.empty(); }
};

bool loadConfig(DeviceConfig& out);  // false if missing/corrupt (out = defaults)
bool saveConfig(const DeviceConfig& c);
bool eraseWifiAndSetup(DeviceConfig& c);  // FLASH long-press
