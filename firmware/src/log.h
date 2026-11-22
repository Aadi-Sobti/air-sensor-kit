// Serial log helpers that keep format strings in flash (on the ESP8266, plain string literals sit in RAM, and RAM
// is what TLS uploads and OTA downloads need). LOGF = printf with a flash format; LOGLN = println of a literal.
#pragma once
#include <Arduino.h>

#define LOGF(fmt, ...) Serial.printf_P(PSTR(fmt), ##__VA_ARGS__)
#define LOGLN(s) Serial.println(F(s))
