// Claim token: proves to the website that the person at /claim just set this sensor up over USB
// (physical access = ownership). 128-bit random, single-use; only its SHA-256 leaves the device in the
// next signed upload, and the token itself travels in the redirect URL fragment (never in server logs).
#pragma once
#include <cstddef>
#include <cstdint>
#include <string>

namespace core {

struct ClaimToken {
  std::string token;    // 32 lowercase hex chars (goes into the claim URL)
  std::string hashHex;  // sha256(token as ASCII), 64 hex chars (goes into the upload)
};

// rnd must hold 16 random bytes.
ClaimToken makeClaimToken(const uint8_t rnd[16]);

// https://<site>/claim#d=<deviceId>&t=<token>
std::string claimUrl(const std::string& siteUrl, const std::string& deviceId, const std::string& token);

}  // namespace core
