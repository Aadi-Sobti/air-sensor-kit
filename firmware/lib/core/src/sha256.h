// SHA-256 (FIPS 180-4) and HMAC-SHA256 (RFC 2104). Portable C++ so the device and the host tests sign uploads
// with exactly the same code. Upload signature = hex(HMAC-SHA256(secret, timestamp + body)), as the backend checks.
#pragma once
#include <cstddef>
#include <cstdint>
#include <string>

namespace core {

class Sha256 {
 public:
  Sha256() { reset(); }
  void reset();
  void update(const void* data, size_t n);
  void finish(uint8_t out[32]);

 private:
  void block(const uint8_t* p);
  uint32_t h_[8];
  uint8_t buf_[64];
  size_t bufLen_ = 0;
  uint64_t total_ = 0;
};

void hmacSha256(const uint8_t* key, size_t keyLen, const void* msg1, size_t n1, const void* msg2, size_t n2,
                uint8_t out[32]);

// Signs an upload: key = 32-byte secret given as 64 hex chars. Returns "" if the key isn't valid hex.
std::string signUpload(const std::string& secretHex, const std::string& timestamp, const std::string& body);

bool fromHex(const std::string& hex, uint8_t* out, size_t outLen);

}  // namespace core
