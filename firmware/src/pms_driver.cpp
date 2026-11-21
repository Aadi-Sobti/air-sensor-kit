#include "pms_driver.h"

void PmsDriver::send(core::PmsCommand c) {
  uint8_t b[core::kPmsCommandSize];
  core::buildPmsCommand(c, b);
  link_.write(b, sizeof b);
}

void PmsDriver::begin(uint32_t nowMs) {
  link_.begin();
  // The sensor powers up in active mode (datasheet). Switch to passive so it only talks when asked.
  wake(nowMs);
}

void PmsDriver::wake(uint32_t nowMs) {
  send(core::PmsCommand::kWake);
  send(core::PmsCommand::kPassiveMode);
  asleep_ = false;
  avg_.markWake(nowMs);
  lastRequest_ = nowMs;
  lastFrame_ = nowMs;
}

void PmsDriver::sleep() {
  send(core::PmsCommand::kSleep);
  asleep_ = true;
}

void PmsDriver::poll(uint32_t nowMs) {
  if (asleep_) {
    while (link_.available() > 0) link_.read();
    return;
  }
  if (link_.available() <= 0 && parser_.midFrame() && nowMs - lastByte_ > kGapResetMs) parser_.reset();
  int budget = 128;  // bounded work per call keeps loop() responsive
  while (budget-- > 0 && link_.available() > 0) {
    int c = link_.read();
    if (c < 0) break;
    lastByte_ = nowMs;
    core::PmsFrame f;
    if (parser_.feed(static_cast<uint8_t>(c), f)) {
      last_ = f;
      hasLast_ = true;
      lastFrame_ = nowMs;
      avg_.add(f, nowMs);
    }
  }
  if (nowMs - lastRequest_ >= kReadPeriodMs) {
    lastRequest_ = nowMs;
    send(core::PmsCommand::kRead);
  }
  if (nowMs - lastFrame_ >= kSilenceMs) {
    // Unplugged, power-cycled (back in active mode), or wiring problem. Re-init and keep trying.
    timeouts_++;
    parser_.reset();
    send(core::PmsCommand::kWake);
    send(core::PmsCommand::kPassiveMode);
    lastFrame_ = nowMs;
  }
}
