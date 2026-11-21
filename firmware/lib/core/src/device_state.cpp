#include "device_state.h"

namespace core {

const char* stateName(DeviceState s) {
  switch (s) {
    case DeviceState::kSetup: return "SETUP";
    case DeviceState::kConnecting: return "CONNECTING";
    case DeviceState::kRunning: return "RUNNING";
    case DeviceState::kProblem: return "PROBLEM";
  }
  return "?";
}

LedPattern ledPatternFor(DeviceState s) {
  switch (s) {
    case DeviceState::kSetup: return LedPattern::kSlowBlink;
    case DeviceState::kConnecting: return LedPattern::kFastBlink;
    case DeviceState::kRunning: return LedPattern::kBlip;
    case DeviceState::kProblem: return LedPattern::kDoubleBlink;
  }
  return LedPattern::kDoubleBlink;
}

bool ledLit(LedPattern p, uint32_t ms) {
  switch (p) {
    case LedPattern::kSlowBlink: return (ms % 2000) < 1000;
    case LedPattern::kFastBlink: return (ms % 300) < 150;
    case LedPattern::kBlip: return (ms % 5000) < 60;
    case LedPattern::kDoubleBlink: {
      uint32_t t = ms % 2000;
      return t < 150 || (t >= 300 && t < 450);
    }
  }
  return false;
}

void StateMachine::enter(DeviceState s, uint32_t nowMs) {
  (void)nowMs;
  state_ = s;
}

void StateMachine::openAp(uint32_t nowMs) {
  if (out_.apOn || apClosedByTimeout_) return;
  out_.apOn = true;
  apOpenedAt_ = nowMs;
}

void StateMachine::begin(const StateInputs& in, uint32_t nowMs) {
  hasWifi_ = in.hasSavedWifi;
  out_ = StateOutputs{};
  apClosedByTimeout_ = false;
  everConnected_ = false;
  disconnectedSince_ = nowMs;
  if (hasWifi_) {
    out_.connectWifi = true;
    enter(DeviceState::kConnecting, nowMs);
  } else {
    enter(DeviceState::kSetup, nowMs);
    openAp(nowMs);
  }
  update(in, nowMs);
}

void StateMachine::wifiSettingsSaved(uint32_t nowMs) {
  hasWifi_ = true;
  out_.connectWifi = true;
  disconnectedSince_ = nowMs;
  everConnected_ = false;  // new network: the startup fallback applies again until it connects
  // The AP stays up (if on) so a phone user can see the result; it closes once WiFi connects.
  enter(DeviceState::kConnecting, nowMs);
}

void StateMachine::eraseWifi(uint32_t nowMs) {
  hasWifi_ = false;
  out_.connectWifi = false;
  apClosedByTimeout_ = false;  // a long-press always reopens setup
  out_.apOn = false;
  enter(DeviceState::kSetup, nowMs);
  openAp(nowMs);
}

bool StateMachine::update(const StateInputs& in, uint32_t nowMs) {
  DeviceState before = state_;
  if (in.hasSavedWifi && !hasWifi_) wifiSettingsSaved(nowMs);
  // Note: in.hasSavedWifi == false never clears hasWifi_ here: only eraseWifi() erases WiFi.

  if (out_.apOn && hasWifi_ && !in.apClientSeen && nowMs - apOpenedAt_ >= kApIdleTimeoutMs) {
    out_.apOn = false;
    apClosedByTimeout_ = true;
  }

  if (!hasWifi_) {
    if (state_ != DeviceState::kSetup) enter(DeviceState::kSetup, nowMs);
    if (!out_.apOn) {
      apClosedByTimeout_ = false;
      openAp(nowMs);  // SETUP always offers the AP
    }
    return state_ != before;
  }

  out_.connectWifi = true;
  if (in.wifiConnected) {
    disconnectedSince_ = nowMs;
    everConnected_ = true;
    out_.apOn = false;
    apClosedByTimeout_ = false;
    enter(DeviceState::kRunning, nowMs);
  } else {
    bool startupFailing = !everConnected_ && nowMs - disconnectedSince_ >= kApFallbackMs;
    if (startupFailing) openAp(nowMs);
    if (state_ == DeviceState::kRunning || state_ == DeviceState::kProblem || startupFailing) {
      enter(DeviceState::kProblem, nowMs);
    } else {
      enter(DeviceState::kConnecting, nowMs);
    }
  }
  return state_ != before;
}

void LongPress::begin(bool pressed, uint32_t nowMs) {
  raw_ = stable_ = pressed;
  armed_ = !pressed;  // held since boot: ignore until released
  fired_ = false;
  rawChangedAt_ = pressedAt_ = nowMs;
}

bool LongPress::update(bool pressed, uint32_t nowMs) {
  if (pressed != raw_) {
    raw_ = pressed;
    rawChangedAt_ = nowMs;
  }
  if (raw_ != stable_ && nowMs - rawChangedAt_ >= debounceMs_) {
    stable_ = raw_;
    if (stable_) {
      pressedAt_ = nowMs;
      fired_ = false;
    } else {
      armed_ = true;
    }
  }
  if (stable_ && armed_ && !fired_ && nowMs - pressedAt_ >= holdMs_) {
    fired_ = true;
    return true;
  }
  return false;
}

}  // namespace core
