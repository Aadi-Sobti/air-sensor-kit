// Real sensor link: EspSoftwareSerial (bundled with the ESP8266 Arduino core) on D1 (RX) / D2 (TX).
#include <Arduino.h>
#include <SoftwareSerial.h>

#include "config.h"
#include "pms_link.h"

namespace {
class SerialPmsLink : public PmsLink {
 public:
  void begin() override {
    // 9600 8N1 per the datasheet. 64-byte buffer = 2 frames; in passive mode we ask for one at a time.
    // (The bit-level ISR buffer is ~40x this in bytes, so 256 here cost ~10 KB of heap.)
    ser_.begin(PMS_BAUD, SWSERIAL_8N1, PIN_PMS_RX, PIN_PMS_TX, false, 64);
  }
  int available() override { return ser_.available(); }
  int read() override { return ser_.read(); }
  void write(const uint8_t* b, size_t n) override { ser_.write(b, n); }
  const char* name() const override { return "pms5003"; }

 private:
  SoftwareSerial ser_;
};
SerialPmsLink gSerialLink;
}  // namespace

PmsLink& realPmsLink() { return gSerialLink; }
