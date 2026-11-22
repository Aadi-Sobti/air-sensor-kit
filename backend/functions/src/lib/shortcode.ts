// Same alphabet and fallback as the firmware (firmware/lib/core/src/codes.cpp + portal.cpp fallbackShortCode):
// until the factory assigns a short code (M9), the public page and the setup AP use a code derived from the chip ID.
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function fallbackShortCode(chipId: number): string {
  let v = chipId >>> 0;
  let s = "";
  for (let i = 0; i < 6; i++) {
    s += CODE_ALPHABET[v % CODE_ALPHABET.length];
    v = Math.floor(v / CODE_ALPHABET.length);
  }
  return s;
}

export function shortCodeFor(deviceId: string, assigned?: string | null): string {
  if (assigned) return assigned;
  const chip = Number(deviceId.replace(/^esp8266-/, ""));
  return fallbackShortCode(chip);
}
