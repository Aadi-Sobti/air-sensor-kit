#include "claim.h"

#include "codes.h"
#include "sha256.h"

namespace core {

ClaimToken makeClaimToken(const uint8_t rnd[16]) {
  ClaimToken c;
  c.token = toHex(rnd, 16);
  Sha256 h;
  h.update(c.token.data(), c.token.size());
  uint8_t d[32];
  h.finish(d);
  c.hashHex = toHex(d, 32);
  return c;
}

std::string claimUrl(const std::string& siteUrl, const std::string& deviceId, const std::string& token) {
  return siteUrl + "/claim#d=" + deviceId + "&t=" + token;
}

}  // namespace core
