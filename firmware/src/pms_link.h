// Byte link to the PMS5003. Real: SoftwareSerial on D1/D2. Dev: a fake sensor (src/dev/).
#pragma once
#include <stddef.h>
#include <stdint.h>

class PmsLink {
 public:
  virtual ~PmsLink() {}
  virtual void begin() = 0;
  virtual int available() = 0;
  virtual int read() = 0;
  virtual void write(const uint8_t* b, size_t n) = 0;
  virtual const char* name() const = 0;
};

// Dev hook: returns a fake link in dev builds with the fake sensor enabled, nullptr otherwise.
PmsLink* devPmsLink();
