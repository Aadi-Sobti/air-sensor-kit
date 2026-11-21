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

void PmsDriver::reinit(uint32_t nowMs) {
  send(core::PmsCommand::kWake);
  send(core::PmsCommand::kPassiveMode);
  avg_.markWake(nowMs);  // fan (re)starting: the next 30 s are unstable (datasheet)
  requestOutstanding_ = false;
  lastRequest_ = nowMs;
  lastFrame_ = nowMs;
}

void PmsDriver::wake(uint32_t nowMs) {
  asleep_ = false;
  reinit(nowMs);
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
      lastGood_ = nowMs;
      if (!requestOutstanding_) {
        // Nobody asked: the sensor is streaming in active mode, i.e. it (re)booted. Re-assert passive
        // mode and restart the warm-up so spin-up readings aren't averaged.
        unsolicited_++;
        send(core::PmsCommand::kPassiveMode);
        avg_.markWake(nowMs);
      }
      requestOutstanding_ = false;
      avg_.add(f, nowMs);
    }
  }
  if (nowMs - lastRequest_ >= kReadPeriodMs) {
    lastRequest_ = nowMs;
    send(core::PmsCommand::kRead);
    requestOutstanding_ = true;
  }
  if (nowMs - lastFrame_ >= kSilenceMs) {
    // Unplugged, unpowered, asleep, or a wiring problem. Re-init (incl. warm-up) and keep trying.
    timeouts_++;
    parser_.reset();
    reinit(nowMs);
  }
}
