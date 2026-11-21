// Device state machine, LED patterns, and FLASH-button long-press detection. Pure C++ (native-testable).
// Spec: .claude/rules/firmware.md "States and LED" + "Setup: Both paths" + "Reset"; docs/USER_FLOW.md.
#pragma once
#include <cstdint>

namespace core {

enum class DeviceState : uint8_t { kSetup, kConnecting, kRunning, kProblem };
const char* stateName(DeviceState s);

enum class LedPattern : uint8_t { kSlowBlink, kFastBlink, kBlip, kDoubleBlink };
LedPattern ledPatternFor(DeviceState s);
// Whether the LED should be lit at time `ms` for a pattern (periodic, so no per-pattern state needed).
//  slow blink: 1 s on / 1 s off · fast blink: 150 ms on / 150 ms off
//  blip (decision #3, provisional): 60 ms flash every 5 s · double blink: two 150 ms flashes every 2 s
bool ledLit(LedPattern p, uint32_t ms);

struct StateInputs {
  bool hasSavedWifi = false;
  bool wifiConnected = false;
  bool apClientSeen = false;  // someone joined the setup AP since it opened
};
// Sensor faults are deliberately NOT a state: the LED means WiFi only (founder decision 2026-11-21); sensor
// health is reported in uploads and shown on the owner page.

struct StateOutputs {
  bool connectWifi = false;  // keep trying the saved network
  bool apOn = false;         // setup access point (implemented in M6)
};

// Rules:
//  - No saved WiFi -> SETUP (AP on). WiFi settings may arrive in any state (Improv, M5) -> CONNECTING.
//  - Saved WiFi -> CONNECTING; connected -> RUNNING.
//  - Saved WiFi failing for kApFallbackMs after boot, before it has ever connected -> PROBLEM + AP on, while
//    still retrying. Only at startup (founder decision 2026-11-21): a router outage later never opens the AP.
//    WiFi comes back -> RUNNING and the AP closes.
//  - RUNNING and WiFi drops -> PROBLEM immediately (router off shows the double blink), still retrying.
//  - The fallback AP closes after kApIdleTimeoutMs with no client. In SETUP (no saved WiFi) the AP never times
//    out, so a new sensor stays ready for phone setup (founder decision 2026-11-21).
//  - Saved WiFi is NEVER erased by this machine: only a FLASH long-press (eraseWifi) does that.
class StateMachine {
 public:
  static constexpr uint32_t kApFallbackMs = 3UL * 60 * 1000;
  static constexpr uint32_t kApIdleTimeoutMs = 15UL * 60 * 1000;

  void begin(const StateInputs& in, uint32_t nowMs);
  // Returns true if the state changed.
  bool update(const StateInputs& in, uint32_t nowMs);
  void wifiSettingsSaved(uint32_t nowMs);  // new credentials stored (Improv / portal)
  void eraseWifi(uint32_t nowMs);          // FLASH long-press: caller erases WiFi + setup info, keeps identity

  DeviceState state() const { return state_; }
  const StateOutputs& outputs() const { return out_; }

 private:
  void enter(DeviceState s, uint32_t nowMs);
  void openAp(uint32_t nowMs);
  DeviceState state_ = DeviceState::kSetup;
  StateOutputs out_;
  bool hasWifi_ = false;
  bool apClosedByTimeout_ = false;
  bool everConnected_ = false;  // since boot
  uint32_t disconnectedSince_ = 0;
  uint32_t apOpenedAt_ = 0;
};

// Long-press detector for the FLASH button (active-low on the board; pass pressed=true when held).
// Fires once per press after holdMs. Presses already held when begin() runs are ignored until released.
class LongPress {
 public:
  explicit LongPress(uint32_t holdMs = 5000, uint32_t debounceMs = 50) : holdMs_(holdMs), debounceMs_(debounceMs) {}
  void begin(bool pressed, uint32_t nowMs);
  // Returns true exactly once when a press has been held for holdMs.
  bool update(bool pressed, uint32_t nowMs);
  bool held() const { return stable_; }

 private:
  uint32_t holdMs_, debounceMs_;
  bool raw_ = false, stable_ = false, fired_ = false, armed_ = true;
  uint32_t rawChangedAt_ = 0, pressedAt_ = 0;
};

}  // namespace core
