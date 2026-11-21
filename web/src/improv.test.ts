import { describe, expect, it } from "vitest";

import { frame, GET_INFO, GET_NETWORKS, Parser, parseStrings, rpc, STATE_PROVISIONING, STATE_READY, T_ERROR, T_RESULT, T_STATE, WIFI_SETTINGS, wifiSettings } from "./improv";
import { claimPathFromRedirect, ImprovClient, parseClaimFragment, Transport } from "./improvClient";

const enc = new TextEncoder();
const result = (cmd: number, strings: string[]) => {
  const parts: number[] = [];
  for (const s of strings) {
    const b = enc.encode(s);
    parts.push(b.length, ...b);
  }
  return frame(T_RESULT, Uint8Array.from([cmd, parts.length, ...parts]));
};

describe("improv codec", () => {
  it("matches the spec example and the firmware/python codecs", () => {
    const f = wifiSettings("MyWirelessAP", "mysecurepassword");
    expect(Array.from(f.subarray(0, 9))).toEqual([0x49, 0x4d, 0x50, 0x52, 0x4f, 0x56, 1, 3, 32]);
    expect(Array.from(f.subarray(9, 12))).toEqual([0x01, 0x1e, 0x0c]);
    const sum = Array.from(f.subarray(0, -1)).reduce((a, b) => (a + b) & 0xff, 0);
    expect(f[f.length - 1]).toBe(sum);
    // Same bytes as tools/tests/test_improv.py::test_same_bytes_as_firmware_codec
    const info = Array.from(rpc(GET_INFO));
    expect(info.slice(0, -1)).toEqual([...enc.encode("IMPROV"), 1, 3, 2, 3, 0]);
  });

  it("parses frames split across chunks, skipping logs and bad checksums", () => {
    const good = result(GET_INFO, ["ProseFire", "0.4.0"]);
    const bad = frame(T_STATE, Uint8Array.from([2]));
    bad[bad.length - 1] ^= 0xff;
    const p = new Parser();
    const a = p.feed(Uint8Array.from([...enc.encode("[hb] up\r\nIMPROV-x"), ...bad, ...good.subarray(0, 4)]));
    const b = p.feed(Uint8Array.from([...good.subarray(4), ...enc.encode("\n[pms] n=1\n")]));
    expect(a.length + b.length).toBe(1);
    expect(parseStrings(b[0].data)).toEqual(["ProseFire", "0.4.0"]);
  });

  it("rejects bad credential lengths", () => {
    expect(() => wifiSettings("", "x")).toThrow();
    expect(() => wifiSettings("x".repeat(33), "x")).toThrow();
  });
});

/** A fake sensor speaking Improv, with log noise, for client tests. */
function fakeDevice(opts: { password: string; networks: [string, number, boolean][]; silent?: boolean }) {
  const inbox: Uint8Array[] = [];
  let notify: (() => void) | null = null;
  const parser = new Parser();
  const push = (b: Uint8Array) => {
    inbox.push(Uint8Array.from([...enc.encode("[hb] noise\n"), ...b]));
    notify?.();
  };
  const t: Transport = {
    async write(bytes) {
      if (opts.silent) return;
      for (const f of parser.feed(bytes)) {
        const cmd = f.data[0];
        if (cmd === GET_INFO) push(result(GET_INFO, ["ProseFire", "0.4.0", "ESP8266", "ProseFire sensor"]));
        if (cmd === GET_NETWORKS) {
          for (const [s, r, sec] of opts.networks) push(result(GET_NETWORKS, [s, String(r), sec ? "YES" : "NO"]));
          push(result(GET_NETWORKS, []));
        }
        if (cmd === 0x02) push(frame(T_STATE, Uint8Array.from([STATE_READY])));
        if (cmd === WIFI_SETTINGS) {
          const sl = f.data[2];
          const pass = new TextDecoder().decode(f.data.subarray(4 + sl));
          push(frame(T_STATE, Uint8Array.from([STATE_PROVISIONING])));
          setTimeout(() => {
            if (pass === opts.password) push(result(WIFI_SETTINGS, ["https://site.example/claim#d=esp8266-42&t=" + "a".repeat(32)]));
            else push(frame(T_ERROR, Uint8Array.from([0x03])));
          }, 20);
        }
      }
    },
    async read() {
      while (!inbox.length) await new Promise<void>((r) => (notify = r));
      return inbox.shift()!;
    },
  };
  return t;
}

describe("ImprovClient against a fake sensor", () => {
  const nets: [string, number, boolean][] = [["Weak", -80, true], ["Home", -50, true], ["Cafe", -60, false]];

  it("gets info, lists networks strongest first, and connects", async () => {
    const c = new ImprovClient(fakeDevice({ password: "right", networks: nets }));
    expect((await c.getInfo())?.firmware).toBe("ProseFire");
    expect(await c.isConnected()).toBe(false);
    const list = await c.scan();
    expect(list.map((n) => n.ssid)).toEqual(["Home", "Cafe", "Weak"]);
    expect(list[1].secure).toBe(false);
    const r = await c.sendWifi("Home", "right");
    expect(r.ok).toBe(true);
    if (r.ok) expect(claimPathFromRedirect(r.redirect)).toBe("/claim#d=esp8266-42&t=" + "a".repeat(32));
  });

  it("reports a wrong password", async () => {
    const c = new ImprovClient(fakeDevice({ password: "right", networks: nets }));
    expect(await c.sendWifi("Home", "wrong")).toEqual({ ok: false, reason: "wrong_password_or_range" });
  });

  it("gives up when the sensor doesn't answer", async () => {
    const c = new ImprovClient(fakeDevice({ password: "x", networks: [], silent: true }));
    expect(await c.getInfo(2, 50)).toBeUndefined();
    expect(await c.sendWifi("Home", "x", 50)).toEqual({ ok: false, reason: "timeout" });
  });
});

describe("claim links", () => {
  it("only accepts well-formed device IDs and tokens, and stays same-origin", () => {
    const t = "0123456789abcdef0123456789abcdef";
    expect(parseClaimFragment(`#d=esp8266-11001626&t=${t}`)).toEqual({ d: "esp8266-11001626", t });
    expect(parseClaimFragment("#d=evil&t=" + t)).toBeNull();
    expect(parseClaimFragment("#d=esp8266-1&t=short")).toBeNull();
    expect(parseClaimFragment("")).toBeNull();
    expect(claimPathFromRedirect(`https://evil.example/claim#d=esp8266-1&t=${t}`)).toBe(`/claim#d=esp8266-1&t=${t}`);
    expect(claimPathFromRedirect("https://evil.example/phish")).toBeNull();
  });
});
