#include "codes.h"

namespace core {

const char kCodeAlphabet[] = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
static_assert(sizeof(kCodeAlphabet) - 1 == kCodeAlphabetLen, "alphabet length");

std::string makeCode(const uint8_t* rnd, size_t rndLen, size_t len) {
  std::string out;
  const unsigned limit = 256 - (256 % kCodeAlphabetLen);  // 248: reject 248..255 to stay unbiased
  for (size_t i = 0; i < rndLen && out.size() < len; i++) {
    if (rnd[i] >= limit) continue;
    out += kCodeAlphabet[rnd[i] % kCodeAlphabetLen];
  }
  return out.size() == len ? out : std::string();
}

std::string toHex(const uint8_t* b, size_t n) {
  static const char* hex = "0123456789abcdef";
  std::string s;
  s.reserve(n * 2);
  for (size_t i = 0; i < n; i++) {
    s += hex[b[i] >> 4];
    s += hex[b[i] & 0xF];
  }
  return s;
}

}  // namespace core
